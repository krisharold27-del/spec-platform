/**
 * Which Claude model SPEC asks, in one place.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────────
 *
 * Five places in this codebase call the Anthropic API: the front-door diagnosis (diagnose.ts), the
 * category mapping (mapping.ts), the predicted roles (predict-data.ts), the KPI cascade
 * (cascade-data.ts) and the board pack's written draft (board-output.ts). Each one had written out
 * `process.env.ANTHROPIC_MODEL ?? '...'` for itself.
 *
 * On 16 September 2026, the day the API key was finally being turned on, four of them said
 * `claude-sonnet-5` and the board pack still said `claude-sonnet-4-5`. Nothing was broken — both
 * are real models and both would have answered — which is exactly why it had sat there unnoticed
 * through every test run and every deploy. The board pack is the one output that goes to a room of
 * people, and it would have been the only one written by a different model, for no reason anybody
 * decided.
 *
 * A duplicated constant does not stay duplicated; it drifts, quietly, and the drift is invisible
 * until somebody compares five files by hand. So there is one constant and a test that no file may
 * name a model of its own.
 *
 * ── The environment variable ─────────────────────────────────────────────────────────────────────
 *
 * ANTHROPIC_MODEL still overrides it. That is deliberate: moving to a newer model should be
 * something Kris can do in the Vercel settings box in thirty seconds, without a deploy and without
 * me. The constant is the default, not a cage.
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

/**
 * The version header the Anthropic API requires. Same reasoning as above — it was written out five
 * times too, and a header that is wrong in one place fails in one place only.
 */
export const ANTHROPIC_VERSION = '2023-06-01';

/** The headers every SPEC call to Anthropic sends. `key` is read at the call site, never here. */
export function anthropicHeaders(key: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION };
}
