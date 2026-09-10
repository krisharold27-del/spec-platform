import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { safeNext } from '@/lib/auth-redirect';
import { sendConfirmLink } from './actions';

export const dynamic = 'force-dynamic';

/** Asked once, the first time someone adds a person: prove the email is theirs before seats are given out. */
export default async function Verify({ searchParams }: { searchParams: Promise<{ sent?: string; next?: string; error?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      {sp.sent ? (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Check your email</h1>
          <p className="mt-3 text-sm text-ink-light">Click the link and you&apos;re straight back here.</p>
        </>
      ) : (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">One quick check</h1>
          <p className="mt-3 text-sm text-ink-light">Before you add people, confirm {user.email} is yours. Once only.</p>
          {sp.error && <p className="mt-3 text-sm text-rust-dark">{sp.error === 'ratelimited' ? 'One was sent a moment ago. Check your email.' : "That didn't send. Try again."}</p>}
          <form action={sendConfirmLink} className="mt-6">
            <input type="hidden" name="next" value={safeNext(sp.next, '/setup/business')} />
            <SubmitButton pending="Sending…">Email me a link</SubmitButton>
          </form>
        </>
      )}
      <Footer />
    </main>
  );
}
