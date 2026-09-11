import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { setPassword } from './actions';

export const dynamic = 'force-dynamic';

/** Set or change your password while signed in. No email involved. */
export default async function SetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="label-caps">SPEC</div>
      <h1 className="mt-1 font-serif text-2xl text-ink">Set your password</h1>
      {error && <p className="mt-4 text-sm text-rust-dark">{error === 'short' ? 'At least 8 characters.' : "That didn't save. Try again."}</p>}
      <form action={setPassword} className="mt-6 space-y-3">
        <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="New password (8+ characters)" aria-label="New password" className="w-full rounded border px-3 py-2.5" />
        <SubmitButton pending="Saving…">Save password</SubmitButton>
      </form>
      <Footer />
    </main>
  );
}
