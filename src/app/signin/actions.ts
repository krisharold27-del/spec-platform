'use server';
import { redirect } from 'next/navigation';
import { findUserByEmail, signInUser, signOut } from '@/lib/auth';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const user = findUserByEmail(email);
  if (!user) redirect('/signin?unknown=1');
  await signInUser(user.id);
  redirect('/journey');
}
export async function doSignOut() { await signOut(); redirect('/signin'); }
