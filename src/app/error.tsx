'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * When a page breaks.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * There was no error page at all. Any unhandled exception on any screen showed Next.js's own
 * production fallback: a bare grey "Application error: a server-side exception has occurred" and a
 * hexadecimal digest. To a customer that is indistinguishable from the product being dead — and to
 * an owner deciding whether to trust SPEC with their business, it is worse than a page saying
 * something honest, because it suggests nobody was expecting anything to ever go wrong.
 *
 * One screen failing is not the product being down, and the difference has to be visible. So this
 * says what happened, says what is still working, and gives a way back — because the most likely
 * truth is that everything except this one page is fine.
 *
 * The digest is shown deliberately. It is the only handle on which failure this was, and somebody
 * reading it out is the difference between "it broke" and a fix. It is not a secret: it identifies
 * an error, it does not describe one.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Straight to the platform's logs, where it can be found later against the digest below.
    console.error('[page error]', error.digest ?? '(no digest)', error.message);
  }, [error]);

  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl text-ink">This page did not load</h1>

      <p className="mt-4 text-sm leading-6 text-ink-light">
        Something went wrong on our end, not yours. Nothing you were doing caused it and nothing has
        been lost.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-primary text-sm">Try again</button>
        <Link href="/my-page" className="btn-secondary text-sm">Back to my page</Link>
      </div>

      <p className="mt-8 text-sm leading-6 text-ink-light">
        The rest of SPEC is almost certainly working — one screen failing is not the product being
        down. You can check that for yourself at{' '}
        <Link href="/status" className="text-rust-700 underline">status</Link>, which needs no
        sign-in and tests things rather than assuming them.
      </p>

      {error.digest && (
        <p className="mt-6 text-xs text-ink-light">
          If you tell us this, we can find exactly what happened:{' '}
          <span className="font-mono text-ink">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
