'use server';
import { redirect } from 'next/navigation';
import { findUserByEmail, sendMagicLink, signOut } from '@/lib/auth';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const user = await findUserByEmail(email);
  if (!user) redirect('/signin?unknown=1');
  await sendMagicLink(email, '/journey');
  redirect('/signin?sent=1');
}
export async function doSignOut() { await signOut(); redirect('/signin'); }
