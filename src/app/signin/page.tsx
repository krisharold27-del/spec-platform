import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { PasswordField } from '@/components/password-field';
import { getCurrentUser, signedInWithoutSeat } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { signIn } from './actions';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  wrong: "Email or password doesn't match.",
  wait: 'Too many tries. Wait a few minutes.',
  link: 'That link has expired. Ask for a new one.',
  '1': 'That link has expired. Ask for a new one.',
  // Our outage, said as ours. Never let somebody conclude they have forgotten their own password.
  down: 'Signing in is temporarily unavailable — that is our end, not yours. Nothing is wrong with your details. Try again in a few minutes.',
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ known?: string; error?: string }> }) {
  const sp = await searchParams;

  /*
    Somebody already signed in should never be shown a sign-in form — it reads as though the last
    one did not work.

    The second check is the one that matters. A sign-up that stopped after the account was made but
    before the business existed leaves a person who can authenticate and holds no seat: every page
    finds nobody and sends them here, and this page used to send them straight back. That is an
    unbreakable loop with no explanation, at the exact moment a new customer is deciding whether to
    trust this. Send them somewhere that can finish the job instead.
  */
  if (await getCurrentUser()) redirect(DEFAULT_AFTER_SIGN_IN);
  if (await signedInWithoutSeat()) redirect('/signup?resume=1');
  const note = sp.known ? "You're already on SPEC. Sign in." : sp.error ? MESSAGES[sp.error] ?? null : null;
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl text-ink">Sign in</h1>
      {note && <p className="mt-4 text-sm text-rust-dark">{note}</p>}
      <form action={signIn} className="mt-6 space-y-3">
        <input name="email" type="email" required autoFocus autoComplete="email" inputMode="email" placeholder="Your email" aria-label="Your email" className="w-full rounded border px-3 py-2.5" />
        <PasswordField name="password" autoComplete="current-password" placeholder="Password" />
        <SubmitButton pending="Signing in…">Sign in</SubmitButton>
      </form>
      <div className="mt-6 flex justify-between text-sm text-ink-light">
        <a href="/reset" className="underline">Forgot password?</a>
        <a href="/signup" className="underline">Start a business</a>
      </div>
      <Footer />
    </main>
  );
}
