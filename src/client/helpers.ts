/**
 * Capability-field helpers over the structurally-open model rows the Models
 * page edits: a row is a llm-pi-ai `models` entry plus whatever else the
 * settings document carries, and fields this page does not edit survive every
 * change instead of being dropped by a rebuild.
 *
 * @module dsh-models-import/client/helpers
 */

/** One model row: the `id` plus every profile field, known or not. */
export type ModelRow = Record<string, unknown> & { id: string }

/** The thinking levels a llm-pi-ai `reasoningEfforts` declaration may offer. */
export const THINKING_LEVELS: readonly string[] = [
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
] as const

/** Whether the row declares image input (`input` modalities include `image`). */
export function visionOf(row: ModelRow): boolean {
  return Array.isArray(row.input) && row.input.includes('image')
}

/**
 * The row's declared thinking levels. `undefined` when it declares none (no
 * `reasoningEfforts` field, or the explicit `false` that disables reasoning
 * for a catalog model).
 */
export function effortsOf(row: ModelRow): Set<string> | undefined {
  const value = row.reasoningEfforts
  if (value === false || value === undefined || value === null) return undefined
  if (typeof value !== 'object') return undefined
  const levels = new Set<string>()
  for (const key of Object.keys(value)) {
    if ((THINKING_LEVELS as readonly string[]).includes(key)) levels.add(key)
  }
  return levels.size > 0 ? levels : undefined
}

/**
 * Rebuild a row from an explicit field patch: an emptied/absent optional
 * field leaves the row (so the route's or catalog's own default answers),
 * and every field the patch does not name survives untouched.
 */
export function patchRow(row: ModelRow, patch: Record<string, unknown>): ModelRow {
  const cleared = new Set(
    Object.entries(patch).filter(([, value]) => value === undefined || value === '').map(([key]) => key),
  )
  const next = Object.fromEntries(
    Object.entries({ ...row, ...patch }).filter(([key]) => !cleared.has(key)),
  )
  return next as ModelRow
}

/** Set or clear the image modality. */
export function setVision(row: ModelRow, on: boolean): ModelRow {
  if (!on) return patchRow(row, { input: undefined })
  return patchRow(row, { input: ['text', 'image'] })
}

/**
 * Set the declared thinking levels. An empty set removes the declaration (no
 * thinking offered); `off` is spelled as the valueless key pi-ai expects.
 */
export function setEfforts(row: ModelRow, levels: ReadonlySet<string>): ModelRow {
  if (levels.size === 0) {
    // The compat dialect rides with the declaration; without levels it is
    // inert and would outlive the toggle that put it there.
    return patchRow(patchRow(row, { reasoningEfforts: undefined }), { compat: undefined })
  }
  const efforts: Record<string, string | null> = {}
  for (const level of levels) efforts[level] = level === 'off' ? null : level
  return patchRow(row, { reasoningEfforts: efforts })
}
