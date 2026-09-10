/**
 * Where the sign-in email lands. Opens in a real browser and signs straight in.
 *
 * Why not spend the token on the GET itself: email security scanners open every link in a message,
 * and a one-time link opened by a scanner is spent before the person clicks it ("Email link is
 * invalid or has expired"). Scanners fetch without running scripts, so the sign-in happens in the
 * browser, on load (auto-continue.tsx). Works on any device — the token is in the link itself.
 */
import { redirect } from 'next/navigation';
import { safeNext, emailOtpType } from '@/lib/auth-redirect';
import { confirmSignIn } from './actions';
import { AutoContinue } from './auto-continue';

export const dynamic = 'force-dynamic';

export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const sp = await searchParams;
  const type = emailOtpType(sp.type);
  if (!sp.token_hash || !type) redirect('/signin?error=link');

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="label-caps">SPEC</div>
      <AutoContinue action={confirmSignIn} tokenHash={sp.token_hash} type={type} next={safeNext(sp.next)} />
    </main>
  );
}
