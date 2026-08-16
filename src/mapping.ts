/**
 * Parsing an OpenAI-compatible `GET /v1/models` listing and mapping its
 * gateway extensions into the fields a dsh `llm-pi-ai` provider profile
 * understands.
 *
 * The listing entries are OpenAI-shaped (`id`, `object`, `owned_by`) plus a
 * gateway `capabilities` object — the extension several model routers and
 * gateways answer with. dsh's own model discovery reads only the plain
 * OpenAI fields (id / context / output), so the capability metadata —
 * vision, reasoning, thinking dialect, tool support — is what this plugin
 * recovers:
 *
 * | gateway capabilities        | llm-pi-ai model entry                       |
 * |------------------------------|---------------------------------------------|
 * | capabilities.vision          | input: ['text', 'image']                    |
 * | capabilities.reasoning/thinking | reasoningEfforts (with `off` when the   |
 * |                              | gateway says thinking can be disabled)      |
 * | capabilities.thinkingFormat  | compat.thinkingFormat (only spellings pi-ai |
 * |                              | can dispatch; others fall back to its       |
 * |                              | URL-derived guess)                          |
 * | capabilities.contextWindow / | contextWindow                               |
 * | context_length               |                                             |
 * | capabilities.maxOutput /     | maxTokens                                   |
 * | max_completion_tokens        |                                             |
 *
 * `capabilities.tools`, `search`, `pdf`, `audioInput`, … have no
 * llm-pi-ai configuration target; they ride along as display badges only.
 *
 * @module dsh-models-import/mapping
 */

/**
 * The reasoning-dispatch wire formats a llm-pi-ai profile can name
 * (`compat.thinkingFormat`). Everything else the gateway might report
 * (`gemini-budget`, `claude-adaptive`, …) is left unset rather than guessed.
 */
const NAMEABLE_THINKING_FORMATS: ReadonlySet<string> = new Set([
  'openai',
  'deepseek',
  'openrouter',
  'together',
  'zai',
  'qwen',
  'string-thinking',
  'ant-ling',
])

/** The thinking levels a llm-pi-ai `reasoningEfforts` declaration may offer. */
export const THINKING_LEVELS: readonly string[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
] as const

/** One gateway capabilities object, all fields optional and unvalidated. */
interface RawCapabilities {
  vision?: unknown
  reasoning?: unknown
  thinking?: unknown
  agentic?: unknown
  tools?: unknown
  search?: unknown
  pdf?: unknown
  audioInput?: unknown
  videoInput?: unknown
  imageOutput?: unknown
  audioOutput?: unknown
  thinkingFormat?: unknown
  thinkingCanDisable?: unknown
  thinkingRange?: unknown
  contextWindow?: unknown
  maxOutput?: unknown
  upstreamProvider?: unknown
}

/** One listing entry as the gateway writes it, before any narrowing. */
interface RawListingEntry {
  id?: unknown
  object?: unknown
  owned_by?: unknown
  capabilities?: unknown
  context_length?: unknown
  context_window?: unknown
  max_completion_tokens?: unknown
  max_tokens?: unknown
  max_output_tokens?: unknown
}

/** The capability facts the settings page shows as badges. */
export interface CapabilityView {
  vision: boolean
  reasoning: boolean
  tools: boolean
  search: boolean
  /** The gateway-reported thinking dialect, when it names one. */
  thinkingFormat?: string
  /** Whether the gateway says thinking can be turned off. */
  thinkingCanDisable?: boolean
}

/**
 * A model the settings page can adopt: display facts plus the ready-made
 * llm-pi-ai entry (`entry`) the import writes, so client and host agree on
 * the mapping without the browser re-deriving it.
 */
export interface CapabilityModel {
  id: string
  contextWindow?: number
  maxTokens?: number
  caps: CapabilityView
  /** The llm-pi-ai `models` entry this model maps onto. */
  entry: ModelEntryDraft
}

/** The llm-pi-ai model-entry fields this plugin produces. */
export interface ModelEntryDraft {
  id: string
  contextWindow?: number
  maxTokens?: number
  /** `['text', 'image']` when the gateway reports vision. */
  input?: ('text' | 'image')[]
  /** Selectable thinking levels; `off: null` spells "send nothing". */
  reasoningEfforts?: Record<string, string | null>
  compat?: { thinkingFormat: string }
}

/** A positive integer field, or `undefined` when absent or unusable. */
function capacity(...candidates: readonly unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) return candidate
  }
  return undefined
}

/** A non-empty string field, or `undefined`. */
function label(...candidates: readonly unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return undefined
}

/** A boolean field, or `undefined` when the gateway does not say. */
function flag(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Map one listing entry. Returns `undefined` for an entry without a usable id
 * (skipped rather than failing the whole listing, matching dsh's own
 * discovery) and drops duplicate ids after the first occurrence.
 */
export function mapEntry(raw: RawListingEntry): CapabilityModel | undefined {
  const id = label(raw.id)
  if (id === undefined) return undefined
  const capsRaw = (raw.capabilities ?? {}) as RawCapabilities
  const vision = flag(capsRaw.vision) === true
  // Gateways report the thinking capability as `reasoning` for some routes
  // and `thinking` for others; either spelling means the model can think.
  const reasoning = flag(capsRaw.reasoning) === true || flag(capsRaw.thinking) === true
  const thinkingFormat = label(capsRaw.thinkingFormat)
  const thinkingCanDisable = flag(capsRaw.thinkingCanDisable)
  const contextWindow = capacity(capsRaw.contextWindow, raw.context_window, raw.context_length)
  const maxTokens = capacity(capsRaw.maxOutput, raw.max_output_tokens, raw.max_completion_tokens, raw.max_tokens)

  const entry: ModelEntryDraft = {
    id,
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    ...vision ? { input: ['text', 'image'] as ('text' | 'image')[] } : {},
  }
  if (reasoning) {
    // Default offer: plain `high`, plus `off` when the gateway says thinking
    // is optional — the levels stay editable per model on the settings page.
    const efforts: Record<string, string | null> = thinkingCanDisable === true
      ? { off: null, high: 'high' }
      : { high: 'high' }
    entry.reasoningEfforts = efforts
    if (thinkingFormat !== undefined && NAMEABLE_THINKING_FORMATS.has(thinkingFormat)) {
      entry.compat = { thinkingFormat }
    }
  }
  return {
    id,
    ...contextWindow === undefined ? {} : { contextWindow },
    ...maxTokens === undefined ? {} : { maxTokens },
    caps: {
      vision,
      reasoning,
      tools: flag(capsRaw.tools) === true || flag(capsRaw.agentic) === true,
      search: flag(capsRaw.search) === true,
      ...thinkingFormat === undefined ? {} : { thinkingFormat },
      ...thinkingCanDisable === undefined ? {} : { thinkingCanDisable },
    },
    entry,
  }
}

/**
 * Parse a listing body into de-duplicated, endpoint-ordered models.
 * Throws on a body without a `data` array — the caller turns that into a
 * failure naming the endpoint, exactly like dsh's own discovery.
 */
export function parseListing(body: unknown): CapabilityModel[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) {
    throw new Error('the endpoint\'s model listing has no "data" array')
  }
  const models: CapabilityModel[] = []
  const seen = new Set<string>()
  for (const raw of data) {
    const mapped = mapEntry((raw ?? {}) as RawListingEntry)
    if (mapped === undefined || seen.has(mapped.id)) continue
    seen.add(mapped.id)
    models.push(mapped)
  }
  return models
}
