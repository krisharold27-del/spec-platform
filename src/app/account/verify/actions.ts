'use server';
import { redirect } from 'next/navigation';
import { getCurrentUser, sendEmailLink } from '@/lib/auth';
import { safeNext } from '@/lib/auth-redirect';

export async function sendConfirmLink(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const next = safeNext(String(formData.get('next') ?? ''), '/setup/business');
  try {
    await sendEmailLink(user.email, 'confirm', next);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    redirect(`/account/verify?next=${encodeURIComponent(next)}&error=${status === 429 ? 'ratelimited' : 'failed'}`);
  }
  redirect(`/account/verify?sent=1`);
}
