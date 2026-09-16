import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  CLAUDE_MODEL, ANTHROPIC_VERSION, anthropicHeaders, checkClaudeReading, forgetClaudeCheck,
} from '../src/lib/claude';

/*
  ── Five callers, one model ──────────────────────────────────────────────────────────────────────

  SPEC asks Claude in five places: the front-door diagnosis, the category mapping, the predicted
  roles, the KPI cascade and the board pack's written draft. Each one used to name its own model.

  On 16 September 2026 — the day the API key was being turned on for the first time — four of them
  said `claude-sonnet-5` and the board pack still said `claude-sonnet-4-5`. Nothing failed. Both are
  real models, both would have answered, every test stayed green, and the board pack would have
  quietly been the only output in the product written by a different model than the rest, for no
  reason anybody had decided.

  That is the failure this codebase keeps finding in itself: not a break, a DRIFT — a duplicated
  fact that stops agreeing with itself and has no way of saying so. The fix is one constant. This
  test is the part that keeps it one.
*/

const LIB = 'src/lib';
const files = readdirSync(LIB).filter(f => f.endsWith('.ts'));
const source = (f: string) => readFileSync(`${LIB}/${f}`, 'utf8');

describe('every call to Claude uses the same model', () => {
  /* The list is derived, not written down, so a sixth caller added tomorrow is held to this too. */
  const callers = files.filter(f => source(f).includes('api.anthropic.com'));

  it('finds the callers at all', () => {
    // If this drops to zero the rest of the file silently proves nothing.
    expect(callers.length, 'no file calls the Anthropic API — has it moved?').toBeGreaterThanOrEqual(5);
  });

  it('lets no file name a model of its own', () => {
    for (const f of files) {
      if (f === 'claude.ts') continue; // The one place a model name is allowed to appear.
      const hits = [...source(f).matchAll(/'claude-[a-z0-9.-]+'/g)].map(m => m[0]);
      expect(hits, `${f} names a Claude model directly — import CLAUDE_MODEL from './claude'`).toEqual([]);
    }
  });

  it('lets no file write out the API version header of its own', () => {
    for (const f of files) {
      if (f === 'claude.ts') continue;
      expect(source(f), `${f} writes its own anthropic-version header`).not.toContain('anthropic-version');
    }
  });

  it('sends the model and the version the constants say', () => {
    for (const f of callers) {
      expect(source(f), `${f} does not send CLAUDE_MODEL`).toContain('model: CLAUDE_MODEL');
      expect(source(f), `${f} does not use the shared headers`).toContain('anthropicHeaders(key)');
    }
  });
});

describe('the constants themselves', () => {
  it('names a real, current model', () => {
    expect(CLAUDE_MODEL).toMatch(/^claude-/);
    // 4-5 is the specific version that had drifted; naming it stops the drift coming back the
    // same way twice, which is the only way drift ever comes back.
    expect(CLAUDE_MODEL, 'claude-sonnet-4-5 is the model the board pack drifted to').not.toBe('claude-sonnet-4-5');
  });

  it('can still be overridden without a deploy', () => {
    // Kris changes models in the Vercel settings box, not by waiting for me. The constant is the
    // default, not a cage — so the file must read the environment variable.
    expect(readFileSync('src/lib/claude.ts', 'utf8')).toContain('process.env.ANTHROPIC_MODEL');
  });

  it('sends the key as a header and nowhere else', () => {
    const h = anthropicHeaders('sk-test-not-a-real-key');
    expect(h['x-api-key']).toBe('sk-test-not-a-real-key');
    expect(h['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(h['content-type']).toBe('application/json');
  });

  /*
    ── The one paid call a stranger can make ──────────────────────────────────────────────────────

    Four of the five callers are behind a sign-in, so their spending is bounded by paying customers
    doing their jobs. The fifth is the front door's problem box, and it is open to the internet on
    purpose: the free reading before anybody gives up an email address is the entire argument of the
    landing page, and putting it behind a form would be removing the thing that works.

    Open to the internet and spending money is a combination that has to keep its cap. The cap is
    one paid read per cookie, twelve an hour from any one address, and after that everyone still
    gets a reading — the deterministic one — rather than being turned away.

    A refactor that drops the `spent` branch would not fail anything. The endpoint would keep
    working, the readings would get better, and the only symptom would arrive on a bill.
  */
  it('caps the one endpoint that spends money for people who are not signed in', () => {
    const route = readFileSync('src/app/api/enquiry/route.ts', 'utf8');
    expect(route, 'the front door no longer throttles by address').toContain('createThrottle');
    expect(route, 'nothing decides whether the free read is spent').toContain('spent');
    expect(route, 'a spent read must fall back to the deterministic one, not to a paid call')
      .toMatch(/spent\s*\?\s*deterministic\(/);
  });

  /*
    The key must never reach a log, a page or an error message.

    A secret that is printed once is a secret that is in a log file forever, and Vercel's logs are
    readable by anybody who can read the project. Every caller already swallows the failure and
    falls back to the deterministic reading; none of them may print what they were holding.
  */
  it('is never logged by any caller', () => {
    for (const f of files) {
      const body = source(f);
      if (!body.includes('ANTHROPIC_API_KEY')) continue;
      for (const line of body.split('\n')) {
        if (!/console\.(log|warn|error|info)/.test(line)) continue;
        expect(line, `${f} logs something next to the API key`).not.toMatch(/\bkey\b/);
      }
    }
  });
});

/*
  ── The probe itself ─────────────────────────────────────────────────────────────────────────────

  This decides what /status tells Kris about whether SPEC is doing the thing the front door
  promises. Four failures reach it and they need four different answers, one of which — "Anthropic
  could not be reached" — must never be reported as a fault of ours.
*/
describe('asking whether a reading would actually work', () => {
  const answering = (status: number, body = '') => {
    globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
  };

  let realFetch: typeof fetch;
  let hadKey: string | undefined;
  beforeEach(() => {
    realFetch = globalThis.fetch;
    hadKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-not-a-real-key';
    forgetClaudeCheck();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (hadKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = hadKey;
    forgetClaudeCheck();
  });

  it('says nothing about a key it has not got, and does not call out to find out', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response('', { status: 200 }); }) as typeof fetch;
    expect((await checkClaudeReading()).state).toBe('no_key');
    expect(called, 'no key means no reason to spend a call finding out').toBe(false);
  });

  it('says ok only when a real call came back', async () => {
    answering(200, '{"content":[]}');
    expect((await checkClaudeReading()).state).toBe('ok');
  });

  it('calls a 401 what it is', async () => {
    answering(401, '{"type":"error"}');
    expect((await checkClaudeReading()).state).toBe('refused');
  });

  it('tells an empty account apart from a dead key', async () => {
    answering(400, '{"type":"error","error":{"message":"Your credit balance is too low to access the Claude API"}}');
    expect((await checkClaudeReading()).state).toBe('no_credit');
  });

  it('names the model when the model is the problem', async () => {
    answering(404, '{"type":"error","error":{"type":"not_found_error"}}');
    const r = await checkClaudeReading();
    expect(r.state).toBe('no_model');
    expect(r.detail, 'so somebody can see what to correct it to').toContain(CLAUDE_MODEL);
  });

  /*
    Being asked to slow down means the key is good and the service is busy. Reporting that as a
    fault sends somebody to replace a key that was never the problem.
  */
  it('does not treat a rate limit as a fault', async () => {
    answering(429);
    expect((await checkClaudeReading()).state).toBe('busy');
  });

  /*
    The cry-wolf case, and the expensive one. A proxy, a gateway or a sandbox answers 403 to a
    request it will not forward, which looks exactly like Anthropic refusing a key. It has to carry
    Anthropic's own error shape before anybody is told their key is dead.
  */
  it('will not call a key dead on a 403 that did not come from Anthropic', async () => {
    answering(403, 'Forbidden');
    expect((await checkClaudeReading()).state).toBe('unreachable');

    forgetClaudeCheck();
    answering(403, '{"type":"error","error":{"type":"authentication_error"}}');
    expect((await checkClaudeReading()).state).toBe('refused');
  });

  it('says nobody can tell rather than guessing, when the call throws', async () => {
    globalThis.fetch = (async () => { throw new Error('socket hang up'); }) as typeof fetch;
    expect((await checkClaudeReading()).state).toBe('unreachable');
  });

  /*
    /status is public and has no sign-in, by design. An unremembered probe would be a paid call for
    every visitor — the exact open-to-the-internet-and-spending-money shape the front door is so
    careful about.
  */
  it('does not spend a call per visitor', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response('{}', { status: 200 }); }) as typeof fetch;

    const start = Date.UTC(2026, 8, 16, 9, 0, 0);
    for (let i = 0; i < 50; i++) await checkClaudeReading(start + i * 1000);
    expect(calls, 'fifty people opening /status in a minute is one call').toBe(1);

    // But it does not go stale forever: a key fixed at lunchtime shows as fixed.
    await checkClaudeReading(start + 20 * 60_000);
    expect(calls).toBe(2);
  });

  it('asks the model everything else asks', async () => {
    let sent: Record<string, unknown> = {};
    globalThis.fetch = (async (_u: unknown, init: { body?: string }) => {
      sent = JSON.parse(init.body ?? '{}');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await checkClaudeReading();
    expect(sent.model, 'a probe against a different model proves nothing about the real calls')
      .toBe(CLAUDE_MODEL);
    expect(sent.max_tokens, 'one token: a real call, and not one worth costing').toBe(1);
  });
});
