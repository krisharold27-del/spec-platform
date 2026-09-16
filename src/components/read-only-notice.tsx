'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * "That wasn't saved, and here is why" — shown after a refused write.
 *
 * A write SPEC declines on purpose used to arrive as the generic failure page: "Something went wrong
 * on our end, not yours", with a reference ID. Both halves untrue. lib/plan now sends the person
 * back to the page they were on with a reason in the address, and this is what reads it.
 *
 * It is a client component because the reason travels in the query string, which a shared server
 * component has no way to see — only a page does, and this has to work on every page without each
 * one having to remember.
 */
const SAID: Record<string, { text: string; href: string; action: string }> = {
  lapsed: {
    text: 'That change was not saved. This business is read-only until the payment is sorted — nothing has been deleted, and everything comes back the moment it is.',
    href: '/journey',
    action: 'Fix payment',
  },
  look: {
    text: 'That was not saved, because this is a look around. Set up your own business to keep what you change — it takes about a minute, and you keep the business you have been looking at.',
    href: '/look/decide',
    action: 'Set up my business',
  },
};

export function ReadOnlyNotice() {
  const why = useSearchParams().get('readonly');
  const said = why ? SAID[why] : undefined;
  if (!said) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm text-ink">
      <p>{said.text}</p>
      <Link href={said.href} className="shrink-0 rounded-md bg-rust px-3 py-1.5 text-sm font-semibold text-cream hover:bg-rust-600">
        {said.action}
      </Link>
    </div>
  );
}
