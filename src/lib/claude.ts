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

/*
  ── Is the reading actually working? Asked, not assumed ────────────────────────────────────────────

  The status page used to answer this by checking whether ANTHROPIC_API_KEY was set, and then saying
  "Working. A problem typed in plain words gets read properly."

  That is the same mistake the email line already made once and was fixed for: it said invitations
  could be sent about a key that had been deleted an hour earlier. A page that reports the presence
  of a SETTING instead of the working of a THING is confidently wrong at exactly the moment somebody
  is relying on it — and here it is worse than usual, because every caller degrades so gracefully.
  A dead key produces no error anywhere. The product quietly serves the simple reading, says so, and
  looks completely healthy. Nobody would ever find out from using it.

  Four things break this, and they need four different answers:

    the key was deleted, replaced or mistyped   → 401, replace it
    the Console has no credit on it             → 400, top it up
    ANTHROPIC_MODEL names a model that is gone  → 404, fix the setting
    Anthropic is having a moment                → not our fault, must never be reported as one

  Only the last is not actionable, and telling somebody to replace a perfectly good key because a
  network was in the way is the cry-wolf failure in its most expensive form.
*/
export type ClaudeReadiness = 'no_key' | 'ok' | 'refused' | 'no_credit' | 'no_model' | 'busy' | 'unreachable';

export interface ClaudeCheck { state: ClaudeReadiness; detail?: string }

/*
  Why this is remembered, when the status page deliberately remembers nothing else.

  Checking Resend costs nothing — it is a GET against a list of domains. There is no free equivalent
  here: the only question worth asking is "would a real call work", and the only way to ask it is to
  make one. /status is public and has no sign-in by design, so an unremembered answer would be a
  paid call for every visitor, which is precisely the open-to-the-internet-and-spending-money shape
  the front door is so careful about.

  So: one probe every fifteen minutes per server instance, and the answer in between is the last
  real answer, with the page saying when it was asked. The call itself is one token — the smallest
  thing the API will accept — which is a few cents a year, and it proves what nothing cheaper can:
  the key is accepted, the model exists, and there is credit to pay for it.
*/
const PROBE_EVERY_MS = 15 * 60_000;
let lastProbe: { at: number; result: ClaudeCheck } | null = null;

/** Forget the remembered answer. Tests only — a probe cached across tests proves nothing. */
export function forgetClaudeCheck(): void { lastProbe = null; }

export async function checkClaudeReading(now = Date.now()): Promise<ClaudeCheck> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { state: 'no_key' };
  if (lastProbe && now - lastProbe.at < PROBE_EVERY_MS) return lastProbe.result;

  const result = await probe(key);
  lastProbe = { at: now, result };
  return result;
}

async function probe(key: string): Promise<ClaudeCheck> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: anthropicHeaders(key),
      // One token. Enough to be a real call and prove a real call would work; not enough to cost
      // anything worth thinking about.
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (res.ok) return { state: 'ok' };

    // 401 is Anthropic's own answer for a key it does not accept. Taken at face value.
    if (res.status === 401) return { state: 'refused' };

    // 429 means the key works perfectly and we asked too often. Not a fault to fix.
    if (res.status === 429) return { state: 'busy' };

    const body = await res.text().catch(() => '');

    /*
      A 403 is not proof of anything on its own — same reasoning as the Resend check. A corporate
      egress proxy, a filtering gateway or a sandbox answers 403 to a request it will not forward,
      and that is indistinguishable from Anthropic refusing the key. It has to carry Anthropic's
      error shape before it is reported as a refusal.
    */
    if (res.status === 403) {
      const fromAnthropic = /"type"\s*:\s*"(authentication_error|permission_error)"/.test(body);
      return fromAnthropic
        ? { state: 'refused' }
        : { state: 'unreachable', detail: 'Something between SPEC and Anthropic refused the request.' };
    }

    if (/credit balance|insufficient|billing/i.test(body)) return { state: 'no_credit' };
    if (res.status === 404 || /not_found_error|model/i.test(body)) {
      return { state: 'no_model', detail: `The model asked for was "${CLAUDE_MODEL}".` };
    }
    return { state: 'unreachable', detail: `Anthropic answered ${res.status}.` };
  } catch {
    // A timeout or a refused connection. Nobody can say whether the key is good, so nobody says.
    return { state: 'unreachable' };
  }
}
