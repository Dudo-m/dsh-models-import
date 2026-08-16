/**
 * dsh-models-import, host half.
 *
 * Registers one exact route on the web composition's HTTP server:
 *
 *   POST /plugins/models-import/models   { "provider": "router" }
 *   POST /plugins/models-import/models   { "baseURL": "https://…/v1", "apiKey": "…" }
 *
 * The handler interrogates an OpenAI-compatible `GET <baseURL>/models` listing and
 * answers with each advertised model plus the capability mapping
 * (`src/mapping.ts`) the browser half offers for adoption. For a configured
 * provider route the endpoint and credential come from the `llm-pi-ai`
 * settings section — the browser never needs to know either — while a draft
 * may carry its own `baseURL`/`apiKey` for a provider that does not exist yet.
 *
 * Nothing here writes settings: the reply is candidate metadata, and only the
 * settings page's explicit import (a `settings.mutate` from the browser)
 * decides what a route serves.
 *
 * @module dsh-models-import
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import { parseListing } from './mapping.ts'
import type { CapabilityModel } from './mapping.ts'

export const name = 'dsh-models-import'
export const inject = ['webServer']

/** The exact path this plugin owns on the web server. */
const ROUTE_PATH = '/plugins/models-import/models'

/** Request bodies beyond this size are refused without parsing. */
const MAX_BODY_BYTES = 64 * 1024

/** Listing replies beyond this size are refused (the URL is caller-chosen). */
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** How long the upstream interrogation may take, end to end. */
const REQUEST_TIMEOUT_MS = 30_000

/** Attribution dsh's own adapters send on provider requests. */
const USER_AGENT = 'dsh-models-import/0.1.0 (+deepseek-harness plugin)'

/** The request the browser half posts. */
interface DiscoverRequest {
  provider?: unknown
  baseURL?: unknown
  apiKey?: unknown
}

/** The narrow slice of an `llm-pi-ai` profile this plugin reads. */
interface ProviderProfileSlice {
  baseURL?: unknown
  apiKeyEnv?: unknown
}

/** Respond once with JSON and end the exchange. */
function reply(res: import('node:http').ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** Read the request body under a hard ceiling, refusing anything larger. */
async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  const declared = Number(req.headers['content-length'] ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new RequestError(413, 'request body too large')
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).byteLength
    if (total > MAX_BODY_BYTES) throw new RequestError(413, 'request body too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/** A failure that already knows its HTTP status. */
class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** A non-empty string from an unvalidated JSON field. */
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The `llm-pi-ai` profile of one route, read from the settings seam when it
 * is mounted. The composition base is dormant (empty providers), so the
 * resolved section is the user document in practice; reading defensively
 * keeps a missing or differently-shaped section a 400 rather than a crash.
 */
function profileOf(ctx: Context, provider: string): ProviderProfileSlice | undefined {
  const settings = ctx.get('settings') as
    | { get(ns: string): unknown }
    | undefined
  const section = settings?.get('llm-pi-ai') as
    | { providers?: Record<string, ProviderProfileSlice> }
    | undefined
  return section?.providers?.[provider]
}

/**
 * The credential a configured route already stores: the credentials seam when
 * it is mounted, the process environment otherwise — the same split the
 * llm-pi-ai adapter makes. Absent stays absent: the interrogation then runs
 * unauthenticated, which is the posture a request to that route would take.
 */
async function storedApiKey(ctx: Context, ref: string | undefined): Promise<string | undefined> {
  if (ref === undefined) return undefined
  const credentials = ctx.get('credentials') as
    | { resolve(ref: string): Promise<{ value?: string } | undefined> }
    | undefined
  if (credentials !== undefined) {
    return (await credentials.resolve(ref))?.value
  }
  const fromEnv = process.env[ref]
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : undefined
}

/** Join the endpoint base with the listing path, keeping any prefix segments. */
function listingUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, '')}/models`
}

/** Fetch the listing body under the byte ceiling, as text. */
async function fetchListing(url: string, apiKey: string | undefined, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
    },
    signal,
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    const forWhom = response.status === 401 || response.status === 403
      ? ' (the credential was refused — check this provider\'s API key)'
      : ''
    throw new RequestError(502, `${url} answered ${String(response.status)}${forWhom}`)
  }
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new RequestError(502, `${url} answered with more than ${String(MAX_RESPONSE_BYTES)} bytes`)
  }
  /* v8 ignore next -- a 2xx Response always exposes a body stream; the guard is defensive. */
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new RequestError(502, `${url} answered with more than ${String(MAX_RESPONSE_BYTES)} bytes`)
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/**
 * Interrogate one endpoint for its model listing.
 * @returns the mapped models, in endpoint order.
 * @throws RequestError with a status and a message the UI shows verbatim.
 */
async function discover(ctx: Context, request: DiscoverRequest): Promise<CapabilityModel[]> {
  const provider = textOf(request.provider)
  const draftBase = textOf(request.baseURL)
  const profile = provider === undefined ? undefined : profileOf(ctx, provider)
  const baseURL = draftBase ?? textOf(profile?.baseURL)
  if (baseURL === undefined) {
    throw new RequestError(
      400,
      provider === undefined
        ? 'neither a provider nor a baseURL was supplied'
        : `provider "${provider}" has no baseURL in its llm-pi-ai profile; set one on the Models page first`,
    )
  }
  let parsed: URL
  try {
    parsed = new URL(listingUrl(baseURL))
  } catch {
    throw new RequestError(400, `"${baseURL}" is not a usable endpoint URL`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new RequestError(400, `"${baseURL}" is not an http(s) endpoint`)
  }
  // A key typed into the page wins over the stored one, being the one under
  // test; a trim keeps stray paste whitespace from becoming a header fault.
  const draftKey = textOf(request.apiKey)?.trim()
  const apiKey = draftKey !== undefined && draftKey.length > 0
    ? draftKey
    : await storedApiKey(ctx, textOf(profile?.apiKeyEnv))
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    const bodyText = await fetchListing(parsed.toString(), apiKey, controller.signal)
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(bodyText) as unknown
    } catch {
      throw new RequestError(502, `${parsed.toString()} did not answer with JSON`)
    }
    try {
      return parseListing(parsedBody)
    } catch (error) {
      throw new RequestError(502, error instanceof Error ? error.message : 'unreadable model listing')
    }
  } catch (error) {
    if (error instanceof RequestError) throw error
    if (controller.signal.aborted) {
      throw new RequestError(504, `${parsed.toString()} did not answer within ${String(REQUEST_TIMEOUT_MS / 1000)}s`)
    }
    throw new RequestError(502, `could not reach ${parsed.toString()}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Mount the interrogation route on the web composition's server.
 * @param ctx - host root context (the `webServer` service is injected).
 */
export function apply(ctx: Context): void {
  // ctx.effect ties the returned disposer to this plugin's fiber, so an HMR
  // refresh or unload withdraws the route instead of leaking it.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: async (req, res) => {
      try {
        if (req.method !== 'POST') {
          reply(res, 405, { error: 'POST only' })
          return
        }
        const bodyText = await readBody(req)
        let request: DiscoverRequest
        try {
          request = bodyText.length === 0 ? {} : (JSON.parse(bodyText) as DiscoverRequest)
        } catch {
          reply(res, 400, { error: 'request body is not JSON' })
          return
        }
        const models = await discover(ctx, request)
        reply(res, 200, { models })
      } catch (error) {
        if (error instanceof RequestError) {
          reply(res, error.status, { error: error.message })
          return
        }
        ctx.logger.warn('models-import: interrogation failed: %s', error)
        reply(res, 500, { error: 'internal failure; see the server log' })
      }
    },
  }))
}
