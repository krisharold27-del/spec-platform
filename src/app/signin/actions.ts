'use server';
import { redirect } from 'next/navigation';
import { findUserByEmail, sendMagicLink, signOut } from '@/lib/auth';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) redirect('/signin?unknown=1');

  // Supabase throws when the auth email can't be sent (bad SMTP credentials, provider
  // outage, rate limit). Never let that escape the server action — an uncaught throw here
  // renders Next's generic error page instead of telling the user what happened.
  let outcome: 'sent' | 'ratelimited' | 'failed' = 'sent';
  try {
    await sendMagicLink(email, '/journey');
  } catch (err) {
    const { status, code, message } = (err ?? {}) as { status?: number; code?: string; message?: string };
    outcome = status === 429 || code === 'over_email_send_rate_limit' ? 'ratelimited' : 'failed';
    console.error('[signin] magic-link send failed', { email, status, code, message });
  }

  redirect(outcome === 'sent' ? '/signin?sent=1' : `/signin?error=${outcome}`);
}

export async function doSignOut() { await signOut(); redirect('/signin'); }
