import { Footer } from '@/components/ui';
import { signIn } from './actions';

const BAD_LINK = 'That link has expired. Send yourself a new one.';

const MESSAGES: Record<string, string> = {
  ratelimited: 'A link was sent a moment ago. Check your email, or try again in a minute.',
  failed: "The email didn't send. Try again.",
  link: BAD_LINK,
  signup_email: "Your business is set up. Send yourself a link to get in.",
  '1': BAD_LINK,
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ unknown?: string; exists?: string; sent?: string; known?: string; error?: string }> }) {
  const sp = await searchParams;
  const note = sp.unknown
    ? 'No account for that email.'
    : sp.error ? MESSAGES[sp.error] ?? BAD_LINK : null;
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      {sp.sent ? (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Check your email</h1>
          <p className="mt-3 text-sm text-ink-light">Click the link in it and you&apos;re in.</p>
        </>
      ) : (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Sign in</h1>
          {note && <p className="mt-4 text-sm text-rust-dark">{note}</p>}
          <form action={signIn} className="mt-6 space-y-3">
            <input name="email" type="email" required autoComplete="email" placeholder="Your email" aria-label="Your email"
              className="w-full rounded border px-3 py-2.5" />
            <button className="btn-primary w-full py-2.5">Send me a link</button>
          </form>
          <p className="mt-6 text-sm text-ink-light">New? <a href="/signup" className="underline">Start a business</a></p>
        </>
      )}
      <Footer />
    </main>
  );
}
