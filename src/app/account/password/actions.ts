'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) redirect('/account/password?error=short');
  const supabase = await createClient();
  // Cannot set a password against a service that is not there. Say so rather than throwing.
  if (!supabase) redirect('/account/password?error=failed');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[account/password] update failed', { status: error.status, code: error.code });
    redirect('/account/password?error=failed');
  }
  redirect('/journey');
}
