/**
 * Transactional email via Resend — invites, "board output ready", and (from /admin) the copy for a
 * stuck-on-a-step nudge. See docs/SPEC_GoLive_and_Operations.md §6.
 *
 * Magic-link sign-in emails are NOT sent from here — Supabase Auth sends those itself
 * (supabase.auth.signInWithOtp, wired up in src/lib/auth.ts back in B4 step 1). Sending a second,
 * competing "sign in" email from Resend would just confuse people about which link to click, so
 * that item from the original build prompt is deliberately not duplicated here.
 *
 * Without RESEND_API_KEY set (e.g. a fresh local checkout), sends are logged and skipped rather
 * than failing the action that triggered them — the same "degrade, don't break" pattern as
 * board-output.ts without ANTHROPIC_API_KEY.
 */
import { Resend } from 'resend';

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

const wrap = (body: string) => `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:520px">${body}</div>`;

export async function sendInviteEmail(opts: { to: string; name: string; businessName: string; roleTitle: string }) {
  const url = `${appUrl()}/signin`;
  await send(
    opts.to,
    `You've been added to ${opts.businessName} on SPEC`,
    wrap(`<p>Hi ${opts.name},</p><p>You've been assigned the <b>${opts.roleTitle}</b> role at <b>${opts.businessName}</b> on SPEC.</p><p><a href="${url}">Sign in</a> with this email address (${opts.to}) — we'll send you a one-time link, no password needed.</p>`),
    `Hi ${opts.name},\n\nYou've been assigned the ${opts.roleTitle} role at ${opts.businessName} on SPEC.\n\nSign in at ${url} with this email address (${opts.to}) — we'll send you a one-time link, no password needed.`,
  );
}

export async function sendBoardOutputReadyEmail(opts: { to: string; businessName: string; period: string; periodId: string }) {
  const url = `${appUrl()}/board/${opts.periodId}`;
  await send(
    opts.to,
    `${opts.businessName}: ${opts.period} board output is ready`,
    wrap(`<p>The board output for <b>${opts.period}</b> has been generated from this month's scorecards and gates.</p><p><a href="${url}">Read it</a> and approve it for the board.</p>`),
    `The board output for ${opts.period} has been generated from this month's scorecards and gates.\n\nRead it and approve it for the board: ${url}`,
  );
}

/** Plain text a human sends by hand from /admin — not sent automatically (see docs §6: "one email from you"). */
export function stuckOnStepNudgeTemplate(opts: { name: string; businessName: string; stepTitle: string; stepHref: string }) {
  const url = `${appUrl()}${opts.stepHref}`;
  const subject = `Quick check-in on ${opts.businessName}'s SPEC setup`;
  const body = `Hi ${opts.name},\n\nI noticed ${opts.businessName} has been sitting on "${opts.stepTitle}" for a while (${url}). Is something in the way, or would a hand get it moving?\n\nHappy to jump on a call if that's easier.`;
  return { subject, body };
}
