'use server';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';

/** Support tool: signs the admin's own browser in as another user, via a Supabase Auth magic link generated server-side. */
export async function signInAs(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) redirect('/journey');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/admin');

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/journey` },
  });
  if (error || !data?.properties?.action_link) redirect('/admin?signin_error=1');
  redirect(data.properties.action_link);
}
