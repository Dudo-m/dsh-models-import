/**
 * dsh-models-import, browser half.
 *
 * This package ships a vendored, capability-extended copy of the stock Models
 * settings page (`@deepseek-ai/dsh-client-ui-settings-models`): the same
 * section id, the same provider cards and onboarding entries, with two
 * extensions —
 *
 * - the per-provider "fetch available models" action first asks this plugin's
 *   host route, which reads the gateway `capabilities` extensions of an
 *   OpenAI-compatible listing and adopts them (vision, thinking levels,
 *   thinking dialect) alongside ids and capacities, falling back to the stock
 *   discovery when the extended lookup cannot answer;
 * - a model row's disclosure edits the capability fields (thinking levels,
 *   image input) beside the capacities.
 *
 * The composition layer (cordis.patch.yml) disables the stock `ui-settings-models`
 * roster row so exactly one Models page registers.
 *
 * @module dsh-models-import/client
 */
export { apply, inject } from './settings-models/index.ts'
