'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext, emailOtpType } from '@/lib/auth-redirect';

/**
 * Spends the one-time sign-in token. Runs only when the person presses the button — a link
 * scanner fetching the page cannot, so it can no longer use the link up before they do.
 */
export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '');
  const type = emailOtpType(String(formData.get('type') ?? ''));
  const next = safeNext(String(formData.get('next') ?? ''));
  if (!tokenHash || !type) redirect('/signin?error=link');

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.error('[auth/confirm] verify failed', { status: error.status, code: error.code });
    redirect('/signin?error=link');
  }
  redirect(next);
}
