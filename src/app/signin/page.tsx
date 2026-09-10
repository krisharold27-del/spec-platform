import { Footer } from '@/components/ui';
import { signIn } from './actions';

const BAD_LINK = "That sign-in link didn't work. Only the newest link works, for one hour. Request a fresh one below and use the email that arrives next.";

const SIGNIN_ERRORS: Record<string, string> = {
  ratelimited: "Too many sign-in emails just went out to that address. Wait a minute, then try again.",
  failed: "We couldn't send the sign-in email just now. Try again in a moment — if it keeps happening, email manager@specbizhq.com.",
  link: BAD_LINK,
  signup_email: "Your business is set up, but the sign-in email didn't go. Enter your email below to get one.",
  // Older callback links still redirect with ?error=1.
  "1": BAD_LINK,
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ unknown?: string; exists?: string; sent?: string; known?: string; error?: string }> }) {
  const sp = await searchParams;
  const signInError = sp.error ? SIGNIN_ERRORS[sp.error] ?? BAD_LINK : null;
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Sign in</h1>
      {sp.unknown && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">No account for that email. Ask your manager to assign you to a role, or <a className="underline" href="/signup">start a business</a>.</p>}
      {sp.exists && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">That email already has a role. Sign in instead.</p>}
      {signInError && <p className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{signInError}</p>}
      {sp.sent ? (
        <p className="mt-8 rounded-lg border bg-emerald-50 p-4 text-sm text-emerald-900">
          {sp.known
            ? <>That email is already on SPEC, so there&apos;s nothing to set up. We&apos;ve sent it a sign-in link — press the button in that email and you&apos;re in.</>
            : <>Check your email — we&apos;ve sent a sign-in link. Press the button in it and you&apos;re in.</>}
          <span className="mt-2 block text-emerald-900/70">You only do this once on each browser; after that you stay signed in.</span>
        </p>
      ) : (
        <form action={signIn} className="mt-8 space-y-4">
          <label className="block text-sm">Work email<input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" /></label>
          <button className="btn-primary w-full py-2.5">Email me a sign-in link</button>
          <p className="text-center text-xs text-ink-light">No password needed — we&apos;ll email you a secure link. New here? <a href="/signup" className="underline">Start a business</a></p>
        </form>
      )}
      <Footer />
    </main>
  );
}
