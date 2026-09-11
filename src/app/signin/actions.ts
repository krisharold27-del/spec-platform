'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { signInWithPassword, signOut } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { createThrottle } from '@/lib/throttle';

// Ten tries per address per network in fifteen minutes — plenty for a person, useless for guessing.
const attempts = createThrottle(15 * 60_000, 10_000, 10);

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) redirect('/signin?error=wrong');

  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  if (!attempts.allow(`${ip}|${email}`)) redirect('/signin?error=wait');

  if (!(await signInWithPassword(email, password))) redirect('/signin?error=wrong');
  redirect(DEFAULT_AFTER_SIGN_IN);
}

export async function doSignOut() { await signOut(); redirect('/signin'); }
