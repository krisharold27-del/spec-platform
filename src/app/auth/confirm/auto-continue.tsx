'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Continues straight away when the page opens in a real browser — one click from the email. A link
 * scanner fetches the page without running it, so it cannot spend the link. The fallback button
 * appears only if nothing has happened after a few seconds (scripts off), so it is never pressed
 * while the first attempt is still working.
 */
export function AutoContinue({ action, tokenHash, type, next }: {
  action: (formData: FormData) => Promise<void>; tokenHash: string; type: string; next: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!sent.current) { sent.current = true; form.current?.requestSubmit(); }
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <form ref={form} action={action} className="mt-8">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm text-ink-light">One moment…</p>
      <noscript><button className="btn-primary mt-4 w-full py-2.5">Continue</button></noscript>
      {slow && <button className="btn-primary mt-4 w-full py-2.5">Continue</button>}
    </form>
  );
}
