/**
 * Where the sign-in email lands. One press finishes signing in.
 *
 * Why a button and not an automatic sign-in: email security scanners open every link in a message
 * to check it, and a one-time link opened by a scanner is spent before the person clicks it — they
 * arrive at "Email link is invalid or has expired" (otp_expired). Fetching this page spends nothing.
 * It also works on any device: the token travels in the link itself, not in the cookie of the
 * browser that asked for it.
 */
import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { safeNext, emailOtpType } from '@/lib/auth-redirect';
import { confirmSignIn } from './actions';

export const dynamic = 'force-dynamic';

export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const sp = await searchParams;
  const type = emailOtpType(sp.type);
  if (!sp.token_hash || !type) redirect('/signin?error=link');

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Sign in</h1>
      <form action={confirmSignIn} className="mt-8">
        <input type="hidden" name="token_hash" value={sp.token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <button className="btn-primary w-full py-2.5">Sign in to SPEC</button>
      </form>
      <Footer />
    </main>
  );
}
