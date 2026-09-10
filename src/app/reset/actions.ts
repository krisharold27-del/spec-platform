'use server';
import { redirect } from 'next/navigation';
import { findUserByEmail, sendSetPasswordLink } from '@/lib/auth';

/**
 * Sends a set-password link to an address on SPEC. Says the same thing whether or not the address
 * has an account, so this form cannot be used to find out who is on SPEC.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/reset');
  if (await findUserByEmail(email)) {
    try {
      await sendSetPasswordLink(email);
    } catch (err) {
      if ((err as { status?: number })?.status === 429) redirect('/reset?error=ratelimited');
      console.error('[reset] set-password email failed', (err as Error).message);
      redirect('/reset?error=failed');
    }
  }
  redirect('/reset?sent=1');
}
