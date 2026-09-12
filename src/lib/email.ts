/**
 * Transactional email via Resend — invites, "board output ready", and (from /admin) the copy for a
 * stuck-on-a-step nudge. See docs/SPEC_GoLive_and_Operations.md §6.
 *
 * The sign-in email IS sent from here (sendSignInEmail) whenever the service-role key and Resend are
 * both configured — see sendMagicLink in src/lib/auth.ts. Supabase is then asked only for a token,
 * never to send, so there is still exactly one sign-in email per request.
 *
 * Without RESEND_API_KEY set (e.g. a fresh local checkout), sends are logged and skipped rather
 * than failing the action that triggered them — the same "degrade, don't break" pattern as
 * board-output.ts without ANTHROPIC_API_KEY.
 */
import { Resend } from 'resend';
import { seatUrl, SEAT_TOKEN_DAYS } from './seat';

const key = process.env.RESEND_API_KEY;
const resend = key ? new Resend(key) : null;
const FROM = 'SPEC Business Solutions <manager@specbizhq.com>';

function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!resend) { console.log(`[email skipped — RESEND_API_KEY not set] to=${to} subject="${subject}"`); return; }
  try {
    await resend.emails.send({ from: FROM, to, subject, html, text });
  } catch (err) {
    // Never let a notification failure break the action that triggered it.
    console.error('Resend send failed:', err);
  }
}

export const canSendEmail = () => resend !== null;

/**
 * The sign-in email. Unlike every other send, this one throws on failure: the person is waiting
 * for it, and "check your email" for an email that never went is worse than an error.
 * No business content — the link and nothing else.
 */
export async function sendSignInEmail(opts: { to: string; url: string; subject?: string; button?: string }) {
  if (!resend) throw new Error('Email is not configured.');
  const button = opts.button ?? 'Sign in to SPEC';
  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject ?? 'Your SPEC sign-in link',
    html: wrap(`<p><a href="${opts.url}" style="display:inline-block;background:#B5502F;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${button}</a></p><p style="color:#64748b;font-size:13px">The link works once, for one hour. If you did not ask for it, ignore this email.</p>`),
    text: `${button}: ${opts.url}\n\nThe link works once, for one hour. If you did not ask for it, ignore this email.`,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.name });
}

const wrap = (body: string) => `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:520px">${body}</div>`;

/**
 * Take your seat.
 *
 * Two things were wrong with this email and both would have met every invited person.
 *
 * It linked to a bare `/signin`, which the engine does not allow: the invitation has to be single
 * use, expiring and bound to one address (designs/the-rules.md §11). It now carries a seat token
 * that is all three.
 *
 * And it promised "a one-time link, no password needed" — which stopped being true when sign-up
 * moved to email and password. It described a way in that no longer exists, to somebody who has
 * never seen the product and has no way of telling which of us is wrong.
 */
export async function sendInviteEmail(opts: {
  to: string; name: string; businessName: string; roleTitle: string; token: string;
}) {
  const url = seatUrl(appUrl(), opts.token);
  await send(
    opts.to,
    `Take your seat at ${opts.businessName} on SPEC`,
    wrap(`<p>Hi ${opts.name},</p><p>You've been given the <b>${opts.roleTitle}</b> role at <b>${opts.businessName}</b> on SPEC.</p><p><a href="${url}" style="display:inline-block;background:#B5502F;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Take your seat</a></p><p style="color:#64748b;font-size:13px">The link is yours alone and works once, for ${SEAT_TOKEN_DAYS} days. You'll choose a password when you take it.</p>`),
    `Hi ${opts.name},\n\nYou've been given the ${opts.roleTitle} role at ${opts.businessName} on SPEC.\n\nTake your seat: ${url}\n\nThe link is yours alone and works once, for ${SEAT_TOKEN_DAYS} days. You'll choose a password when you take it.`,
  );
}

/**
 * "Your board pack is ready" — BUILD_SPEC §10: no attachment, no link, no content. Not even the
 * business name or the month: an email is forwarded, and anything in it has left SPEC. The pack is
 * read in SPEC, by signing in.
 */
export async function sendBoardOutputReadyEmail(opts: { to: string }) {
  await send(
    opts.to,
    'Your board pack is ready',
    wrap('<p>Your board pack is ready to read in SPEC.</p>'),
    'Your board pack is ready to read in SPEC.',
  );
}

/** Plain text a human sends by hand from /admin — not sent automatically (see docs §6: "one email from you"). */
export function stuckOnStepNudgeTemplate(opts: { name: string; businessName: string; stepTitle: string; stepHref: string }) {
  const url = `${appUrl()}${opts.stepHref}`;
  const subject = `Quick check-in on ${opts.businessName}'s SPEC setup`;
  const body = `Hi ${opts.name},\n\nI noticed ${opts.businessName} has been sitting on "${opts.stepTitle}" for a while (${url}). Is something in the way, or would a hand get it moving?\n\nHappy to jump on a call if that's easier.`;
  return { subject, body };
}

/**
 * Can SPEC actually send an invitation — right now, from this deployment?
 *
 * `canSendEmail()` only says a key is SET, and that turned out to be a comfortable lie. On
 * 12 September the live site had RESEND_API_KEY present and the key behind it had been deleted an
 * hour earlier, so /status reported "Working. Invitations can be sent." about a key that would be
 * refused the moment anybody invited somebody. A status page that reports the presence of a setting
 * rather than the working of a thing is worse than no status page: it is confidently wrong at
 * exactly the moment somebody is relying on it.
 *
 * So this asks Resend. Three separate ways this fails in practice, and they need different answers:
 *
 *   the key is refused          — deleted, rotated, or pasted wrong
 *   no verified sender domain   — the key is fine and every send still bounces, which is the one
 *                                 nobody predicts
 *   Resend cannot be reached    — say so, and never claim it is broken on that basis
 *
 * It reads a list of domains. It sends nothing, and it cannot: a status check that sends a real
 * email to prove email works is a status check that spams somebody every time it is opened.
 */
export type EmailReadiness = 'ok' | 'no_key' | 'refused' | 'no_verified_domain' | 'unreachable';

/** The domain SPEC sends from — read from FROM so the two can never drift apart. */
export const SENDER_DOMAIN = FROM.slice(FROM.lastIndexOf('@') + 1).replace(/>$/, '');

export async function checkEmailSending(): Promise<{ state: EmailReadiness; detail?: string }> {
  if (!key) return { state: 'no_key' };
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    /*
      A 403 is not proof the key is bad.

      Anything sitting between here and Resend — a corporate egress proxy, a filtering gateway, a
      sandbox — answers 403 to a request it will not forward, and that is indistinguishable from
      Resend rejecting a key. Telling somebody their key has been deleted when the truth is "a
      network is in the way" is the cry-wolf failure in its most expensive form: they would go and
      replace a key that was perfectly fine, and trust the page less next time.

      401 is taken at face value — that is Resend's own answer for a bad key. A 403 has to prove it
      came from Resend by carrying Resend's error shape. Anything else is "could not reach".
    */
    if (res.status === 401) return { state: 'refused' };
    if (res.status === 403) {
      const body = await res.text().catch(() => '');
      const fromResend = /"(message|name|statusCode)"/.test(body) && /api[_ ]?key|unauthor|forbidden|restricted/i.test(body);
      return fromResend
        ? { state: 'refused' }
        : { state: 'unreachable', detail: 'Something between SPEC and the email service refused the request.' };
    }
    if (!res.ok) return { state: 'unreachable', detail: `Resend answered ${res.status}.` };

    const body = (await res.json()) as { data?: { name?: string; status?: string }[] };
    const domains = body.data ?? [];
    const ours = domains.find(d => d.name === SENDER_DOMAIN);
    if (ours?.status === 'verified') return { state: 'ok' };
    return {
      state: 'no_verified_domain',
      detail: ours
        ? `${SENDER_DOMAIN} is in Resend but its status is "${ours.status ?? 'unknown'}", not verified.`
        : `${SENDER_DOMAIN} has not been added to Resend at all.`,
    };
  } catch {
    return { state: 'unreachable' };
  }
}
