'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) redirect('/account/password?error=short');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/signin');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error('[account/password] update failed', { status: error.status, code: error.code });
    redirect('/account/password?error=failed');
  }
  redirect('/journey');
}
