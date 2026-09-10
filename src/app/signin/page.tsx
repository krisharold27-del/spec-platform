import { Footer } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { signIn } from './actions';

const MESSAGES: Record<string, string> = {
  wrong: "Email or password doesn't match.",
  wait: 'Too many tries. Wait a few minutes.',
  link: 'That link has expired. Ask for a new one.',
  '1': 'That link has expired. Ask for a new one.',
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ known?: string; error?: string }> }) {
  const sp = await searchParams;
  const note = sp.known ? "You're already on SPEC. Sign in." : sp.error ? MESSAGES[sp.error] ?? null : null;
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Sign in</h1>
      {note && <p className="mt-4 text-sm text-rust-dark">{note}</p>}
      <form action={signIn} className="mt-6 space-y-3">
        <input name="email" type="email" required autoComplete="email" placeholder="Your email" aria-label="Your email" className="w-full rounded border px-3 py-2.5" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" className="w-full rounded border px-3 py-2.5" />
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
