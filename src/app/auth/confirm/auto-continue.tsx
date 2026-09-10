'use client';
import { useEffect, useRef } from 'react';

/**
 * Signs the person straight in when the page opens in a real browser — one click from the email.
 * A link scanner fetches the page without running it, so it still cannot spend the link; the
 * button remains for the rare browser with scripts off.
 */
export function AutoContinue({ action, tokenHash, type, next }: {
  action: (formData: FormData) => Promise<void>; tokenHash: string; type: string; next: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.requestSubmit(); }, []);
  return (
    <form ref={form} action={action} className="mt-8">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm text-ink-light">Signing you in…</p>
      <button className="btn-primary mt-4 w-full py-2.5">Continue</button>
    </form>
  );
}
