import { Footer } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { requestPasswordReset } from './actions';

/** Forgot your password — or never had one. The only time SPEC emails a link. */
export default async function Reset({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      {sp.sent ? (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Check your email</h1>
          <p className="mt-3 text-sm text-ink-light">Click the link to set a new password.</p>
        </>
      ) : (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Set a new password</h1>
          {sp.error && <p className="mt-4 text-sm text-rust-dark">{sp.error === 'ratelimited' ? 'One was sent a moment ago. Check your email.' : "That didn't send. Try again."}</p>}
          <form action={requestPasswordReset} className="mt-6 space-y-3">
            <input name="email" type="email" required autoComplete="email" placeholder="Your email" aria-label="Your email" className="w-full rounded border px-3 py-2.5" />
            <SubmitButton pending="Sending…">Email me a link</SubmitButton>
          </form>
          <p className="mt-6 text-sm text-ink-light"><a href="/signin" className="underline">Back to sign in</a></p>
        </>
      )}
      <Footer />
    </main>
  );
}
