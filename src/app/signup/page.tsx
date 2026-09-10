import Script from 'next/script';
import { Footer } from '@/components/ui';
import { formSecret, issueFormToken, turnstileSiteKey } from '@/lib/bot-check';
import { signUp } from './actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  missing: 'Fill in all three.',
  too_fast: 'Press Create again.',
  expired: 'Press Create again.',
  check: 'Press Create again.',
  busy: 'Too many new businesses from this network just now. Try again in an hour.',
};

/** Three fields and straight in. Everything else is asked inside, once, when it matters. */
export default async function SignUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.expired : null;
  const siteKey = turnstileSiteKey();
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Set up your business</h1>
      {error && <p className="mt-4 text-sm text-rust-dark">{error}</p>}
      <form action={signUp} className="relative mt-6 space-y-3">
        <input type="hidden" name="form_token" value={issueFormToken(formSecret())} />
        {/* Left empty by people, who never see it; filled in by bots, which fill in everything. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
        </div>
        <input name="name" required maxLength={200} autoComplete="name" placeholder="Your name" aria-label="Your name" className="w-full rounded border px-3 py-2.5" />
        <input name="business" required maxLength={200} autoComplete="organization" placeholder="Business name" aria-label="Business name" className="w-full rounded border px-3 py-2.5" />
        <input name="email" type="email" required maxLength={320} autoComplete="email" placeholder="Your email" aria-label="Your email" className="w-full rounded border px-3 py-2.5" />
        {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-appearance="interaction-only" />}
        <button className="btn-primary w-full py-2.5">Create my business</button>
      </form>
      <p className="mt-4 text-sm text-ink-light">Free until you invite someone. No card.</p>
      <p className="mt-6 text-sm text-ink-light">Already on SPEC? <a href="/signin" className="underline">Sign in</a></p>
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      <Footer />
    </main>
  );
}
