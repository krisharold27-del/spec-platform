/**
 * Keeping scripts from creating businesses in bulk at sign-up. Three layers, cheapest first:
 *
 *  1. A trap field people never see. A bot fills in every field; a person leaves it empty.
 *  2. A signed timestamp issued when the form is drawn. A person takes seconds to fill it in; a
 *     script posts instantly, or replays an old form. The signature stops it being forged.
 *  3. Cloudflare Turnstile, when its keys are set — an invisible check that the visitor is a person.
 *
 * Layers 1 and 2 need no account and are always on. None of them asks a person to do anything.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_FILL_MS = 3_000;
export const MAX_AGE_MS = 2 * 60 * 60_000;

/** Server-only. Signs the timestamp; never sent to the browser and never derivable from the token. */
export function formSecret(): string {
  return process.env.FORM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'spec-local-dev';
}

const sign = (ts: string, secret: string) => createHmac('sha256', secret).update(`signup:${ts}`).digest('base64url');

export function issueFormToken(secret: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts, secret)}`;
}

export type FormTokenCheck = 'ok' | 'too_fast' | 'expired' | 'invalid';

/**
 * How much of the three seconds is still to run.
 *
 * ── Why this is a wait and not a refusal ─────────────────────────────────────────────────────────
 *
 * Kris, 17 September: *"consider all possible ways people will not use this properly"*. The first
 * one found was the product's own doing, on the first screen a customer ever sees.
 *
 * Anybody with a password manager, or anybody who simply types quickly, fills in four boxes and
 * presses Create inside three seconds. That was bounced to an empty form reading "Press Create
 * again." — no reason, and everything they had typed gone. The very first thing SPEC did for them
 * was lose their work and explain nothing.
 *
 * The three seconds were never the point; slowing a script down was. So a form filled in too
 * quickly is now HELD for the remainder rather than refused: a person waits a moment they do not
 * notice, and is signed up. A script posting in a loop is slowed to three seconds a go, and still
 * meets the ten-per-fifteen-minutes limit sitting behind it.
 *
 * Only `too_fast` is waited out. A replayed or forged token is still refused outright — that is
 * somebody using an old form, not somebody typing fast.
 *
 * ── The margin, and why the wait was landing one millisecond short ───────────────────────────────
 *
 * The caller sleeps for exactly what this returns and then asks again. Node's `setTimeout` is
 * allowed to fire a whisker early — libuv rounds to whole milliseconds — so the second question was
 * sometimes asked at 2,999ms, came back `too_fast` a second time, and the person was bounced to the
 * form reading **"That form expired"**. Nothing had expired. They had typed quickly, waited three
 * seconds without knowing it, and been told something untrue on the first screen of the product.
 *
 * Caught on 18 September when this suite's own sign-ups started failing intermittently — twice in
 * six runs, which is a rate a real customer meets too.
 *
 * Fifty milliseconds. Unnoticeable to a person, irrelevant to a script being slowed to three
 * seconds a go, and far wider than any timer is wrong by.
 */
export const WAIT_MARGIN_MS = 50;

export function waitOutMs(token: string, secret: string, now = Date.now()): number {
  if (checkFormToken(token, secret, now) !== 'too_fast') return 0;
  return Math.max(0, MIN_FILL_MS - (now - Number(token.split('.')[0]))) + WAIT_MARGIN_MS;
}

export function checkFormToken(token: string, secret: string, now = Date.now()): FormTokenCheck {
  const [ts, mac] = token.split('.');
  if (!ts || !mac || !/^\d+$/.test(ts)) return 'invalid';
  const expected = Buffer.from(sign(ts, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  const age = now - Number(ts);
  if (age < MIN_FILL_MS) return 'too_fast';
  if (age > MAX_AGE_MS) return 'expired';
  return 'ok';
}

export function honeypotTripped(value: FormDataEntryValue | null): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

export const turnstileSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

/**
 * Cloudflare Turnstile. Passes when Turnstile is not configured. If Cloudflare cannot be reached it
 * lets the person through and logs it — a real business must never be locked out of signing up
 * because a third party is down, and layers 1 and 2 still apply.
 */
export async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[signup] Turnstile unreachable, letting the request through', (err as Error).message);
    return true;
  }
}
