'use client';

import { useState } from 'react';

/**
 * The invitation link, in the owner's hands.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * Inviting somebody created a single-use link and then only ever emailed it. The person who did the
 * inviting never saw it. So on a deployment with no email service configured, the send was skipped,
 * the person was marked as invited, nothing arrived, and there was **no way whatsoever** to get that
 * person in — with the screen reporting success.
 *
 * That made an email provider a hard dependency for the one thing a business must be able to do:
 * put its people in. It should never have been one. A leader who can see the link can send it the
 * way they already talk to their crew — a text, WhatsApp, Teams, or reading it out over the phone —
 * and email becomes a convenience rather than a gate.
 *
 * It is also the honest answer when email DOES work and still does not arrive. Spam folders exist.
 * "Copy the link and send it yourself" beats "check your junk mail" every time.
 *
 * The link carries a single-use token that expires, is bound to that address, and is cleared the
 * moment the seat is taken — see lib/seat. It is shown only to somebody who could invite in the
 * first place, on a page they had to sign in to reach.
 */
export function SeatLink({ href, name }: { href: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /*
        Clipboard access can be refused — an insecure origin, a locked-down browser. The link is
        already on screen and selectable, so the copy button failing costs nothing; pretending it
        worked would cost them a person who never got invited.
      */
      setCopied(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg bg-cream p-3">
      <p className="text-xs text-ink-light">
        {name}&rsquo;s link. Send it however you normally reach them — text, WhatsApp, or read it out.
        It works whether or not the email arrives.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={href}
          onFocus={e => e.currentTarget.select()}
          aria-label={`Invitation link for ${name}`}
          className="min-w-0 flex-1 rounded border border-ink/15 bg-surface px-2 py-1.5 font-mono text-xs text-ink"
        />
        <button type="button" onClick={copy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
