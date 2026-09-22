'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator, isTopOfChart } from '@/lib/scope';
import { assertWritable, setSeatTier, type SeatTier } from '@/lib/plan';

export async function requestProgram() {
  const user = await requireManager();
  await db.update(schema.tenants).set({ programRequestedAt: new Date().toISOString() }).where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/journey');
}

/**
 * "Do you want SPEC AI powered?" — an administrator's own answer, not a signup default.
 *
 * Paying for the business is administration (the same reasoning `checkout/route.ts` already uses):
 * `isTopOfChart` keeps GMs created before the administrator level existed (stored as `full`) able
 * to set it, alongside a true administrator.
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
  revalidatePath('/journey');
  revalidatePath('/my-page');
}
