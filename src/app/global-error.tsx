'use client';

/**
 * When the layout itself breaks.
 *
 * error.tsx catches a page failing inside the app's shell. This catches the shell failing — the
 * root layout, the fonts, the stylesheet — which is the one failure that leaves nothing else
 * standing. It has to render its own <html> and <body>, and it cannot rely on any styling having
 * loaded, so everything here is inline and nothing is imported.
 *
 * It should essentially never be seen. That is exactly why it exists: the rarest failure is the one
 * nobody has written a page for, and the alternative is a browser error screen with SPEC's name
 * nowhere on it.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-AU">
      <body style={{ margin: 0, background: '#f5ead8', color: '#201e1d', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <main style={{ maxWidth: '32rem', margin: '0 auto', padding: '5rem 1.5rem' }}>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#645c50' }}>SPEC</div>
          <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0 0', fontWeight: 600 }}>SPEC could not start</h1>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', lineHeight: 1.6, color: '#645c50' }}>
            This is our end, not yours, and nothing has been lost. It is the rarest kind of fault and
            it is being recorded.
          </p>
          <p style={{ marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={reset}
              style={{ border: 0, borderRadius: '999px', background: '#c67139', color: '#fff', padding: '0.6rem 1.2rem', fontSize: '0.875rem', cursor: 'pointer' }}
            >
              Try again
            </button>
          </p>
          <p style={{ marginTop: '2rem', fontSize: '0.875rem', lineHeight: 1.6, color: '#645c50' }}>
            {/* A plain anchor, not next/link: the router is part of what may have failed. */}
            <a href="/status" style={{ color: '#a8552a' }}>Check whether SPEC is working</a> — no
            sign-in needed.
          </p>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#645c50' }}>
              Reference: <span style={{ fontFamily: 'ui-monospace, monospace', color: '#201e1d' }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
