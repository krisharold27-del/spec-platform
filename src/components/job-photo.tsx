'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * One job photo on the job card.
 *
 * ── Why this is a client component for the sake of one handler ───────────────────────────────────
 *
 * A photo is fetched from a route that checks the business owns the record, so it can legitimately
 * answer 404 — the file store is not connected yet, the blob was removed, the network dropped on a
 * phone in a basement. The browser's answer to that is a broken-image icon and a box that collapses
 * to nothing, which drags the rest of the card around with it.
 *
 * That matters more here than it looks. This card is what somebody opens when a client is disputing
 * a variation, and a broken frame reads as "SPEC lost your photo". The honest version says which
 * photo it was and that the picture could not be loaded, keeping the caption and the name — the
 * evidence chain is still there even when the image is not.
 *
 * The box holds its shape either way, so a page of photos does not rearrange itself as they arrive.
 */
export function JobPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  /*
    ── The failure that happens before React is listening ───────────────────────────────────────

    `onError` alone is not enough. The browser starts fetching the image while it is still parsing
    the HTML, so a 404 can land BEFORE hydration attaches the handler — and then nothing ever fires
    and the broken frame stays. It is the ordinary case, not the rare one: the server rendered the
    page, so the image request is already in flight by the time this component is alive.

    So the first thing it does is ask the element how it went. `complete` with no `naturalWidth` is
    an image the browser has finished with and has nothing to show.
  */
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-lg border border-ink/10 bg-cream px-2 text-center text-xs text-ink-light">
        Picture could not be loaded
      </div>
    );
  }

  return (
    <div className="aspect-square w-full overflow-hidden rounded-lg border border-ink/10 bg-cream">
      {/* eslint-disable-next-line @next/next/no-img-element -- streamed from a route that checks the
          business first; the optimiser would need a public URL, which is the one thing a customer's
          site photo must never have. */}
      <img
        ref={img}
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
