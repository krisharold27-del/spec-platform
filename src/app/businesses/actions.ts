'use server';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { BUSINESS_COOKIE, myBusinesses } from '@/lib/auth';

/** Open one of your businesses. Only ever one you hold a seat in — the id comes from a form anybody can edit. */
export async function openBusiness(formData: FormData) {
  const tenantId = String(formData.get('tenantId') ?? '');
  const mine = await myBusinesses();
  if (!mine.some(b => b.tenantId === tenantId)) redirect('/businesses');
  (await cookies()).set(BUSINESS_COOKIE, tenantId, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  redirect('/journey');
}
