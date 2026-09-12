import Script from 'next/script';
import { Footer } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { PasswordField } from '@/components/password-field';
import { formSecret, issueFormToken, turnstileSiteKey } from '@/lib/bot-check';
import { signUp } from './actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  missing: 'Fill in every box.',
  short: 'Choose a password of at least 8 characters.',
  failed: "That didn't work. Try again.",
  too_fast: 'Press Create again.',
  expired: 'Press Create again.',
  check: 'Press Create again.',
  busy: 'Too many new businesses from this network just now. Try again in an hour.',
  down: 'Setting up is temporarily unavailable — that is our end, not yours. Nothing you typed is wrong. Try again in a few minutes.',
};

/** Three fields and straight in. Everything else is asked inside, once, when it matters. */
export default async function SignUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.expired : null;
  // Arrived here from /signin because their account exists but their business never got built.
  const resuming = sp.resume === '1';
  // Carried from the front door: the business they named, and the problem they typed. The page
  // promised "this problem is waiting in your page", so it travels with them rather than being
  // asked for twice.
  const business = (sp.business ?? '').slice(0, 200);
  const problem = (sp.problem ?? '').slice(0, 2000);
  const siteKey = turnstileSiteKey();
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl text-ink">
        {resuming ? 'Let\u2019s finish setting up' : 'Set up your business'}
      </h1>
      {resuming && (
        <p className="mt-4 rounded-lg bg-cream p-3 text-sm text-ink">
          Your sign-in works — your business just never finished being created. Fill this in with the
          same email and password and it will pick up where it stopped. Nothing is lost.
        </p>
      )}
      {problem && (
        <p className="mt-4 rounded-lg bg-cream p-3 text-sm text-ink">
          This will be waiting in your page: <span className="text-ink-light">{'\u201c'}{problem}{'\u201d'}</span>
        </p>
      )}
      {error && <p className="mt-4 text-sm text-rust-dark">{error}</p>}
      <form action={signUp} className="relative mt-6 space-y-3">
        <input type="hidden" name="form_token" value={issueFormToken(formSecret())} />
        {/* Left empty by people, who never see it; filled in by bots, which fill in everything. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
        </div>
        <input name="name" required autoFocus maxLength={200} autoComplete="name" placeholder="Your name" aria-label="Your name" className="w-full rounded border px-3 py-2.5" />
        <input name="business" required maxLength={200} defaultValue={business} autoComplete="organization" placeholder="Business name" aria-label="Business name" className="w-full rounded border px-3 py-2.5" />
        {problem && <input type="hidden" name="problem" value={problem} />}
        <input name="email" type="email" required maxLength={320} autoComplete="email" inputMode="email" placeholder="Your email" aria-label="Your email" className="w-full rounded border px-3 py-2.5" />
        <PasswordField name="password" autoComplete="new-password" placeholder="Choose a password (8+ characters)" minLength={8} />
        {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-appearance="interaction-only" />}
        <SubmitButton pending="Setting up your business…">Create my business</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-ink-light">Free until you invite someone. No card.</p>
      <p className="mt-6 text-sm text-ink-light">Already on SPEC? <a href="/signin" className="underline">Sign in</a></p>
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      <Footer />
    </main>
  );
}
