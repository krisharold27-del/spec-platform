'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator, isTopOfChart } from '@/lib/scope';
import { assertWritable, setSeatTier, type SeatTier } from '@/lib/plan';

/**
 * "Do you want SPEC AI powered?" — an administrator's own answer, not a signup default.
 *
 * Paying for the business is administration (the same reasoning `checkout/route.ts` already uses):
 * `isTopOfChart` keeps GMs created before the administrator level existed (stored as `full`) able
 * to set it, alongside a true administrator.
 *
 * Lives here, not in `journey/actions.ts` — Kris, 22 September, on finding this buried in Journey's
 * setup steps: "put under pricing." See the note on `/billing` in `lib/doors.ts`.
 */
export async function setBusinessSeatTier(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const scope = await getScope(user);
  if (!(user.access === 'administrator' || isTopOfChart(scope))) assertAdministrator(scope);
  await assertWritable(user.tenantId);

  const value = String(formData.get('seat_tier') ?? '');
  if (value !== 'basic' && value !== 'advanced') return;
  await setSeatTier(user.tenantId, value as SeatTier);
  revalidatePath('/billing');
  revalidatePath('/my-page');
}
