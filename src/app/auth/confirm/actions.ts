'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeNext, emailOtpType } from '@/lib/auth-redirect';
import { markEmailProven } from '@/lib/auth';

/**
 * Spends the one-time sign-in token. Runs in the person's browser — a link scanner fetching the
 * page cannot, so it can no longer use the link up before they do. Using a link sent to the
 * address is what proves the address is theirs.
 */
export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get('token_hash') ?? '');
  const type = emailOtpType(String(formData.get('type') ?? ''));
  const next = safeNext(String(formData.get('next') ?? ''));
  if (!tokenHash || !type) redirect('/signin?error=link');

  const supabase = await createClient();
  if (!supabase) redirect('/signin?error=link');
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data?.user) {
    // Pressed twice, or opened twice: the first press already signed them in. Carry on, not an error.
    const { data: { user: already } } = await supabase.auth.getUser();
    if (already) redirect(next);
    console.error('[auth/confirm] verify failed', { status: error?.status, code: error?.code });
    redirect('/signin?error=link');
  }
  await markEmailProven(data.user.id);
  redirect(next);
}
