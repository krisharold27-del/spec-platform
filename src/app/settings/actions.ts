'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';

/**
 * Company settings.
 *
 * Administration, not management: these belong to an administrator, and changing one never widens
 * what that administrator can see or manage. Both settings change how a month is read, which is why
 * neither is buried in a preferences pane.
 */
async function administrator() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  assertAdministrator(await getScope(user));
  await assertWritable(user.tenantId);
  return user;
}

/** How often the board sits. Monthly is the rhythm; quarterly is the outer limit. */
export async function setCadence(formData: FormData) {
  const user = await administrator();
  const value = String(formData.get('cadence') ?? '');
  if (value !== 'monthly' && value !== 'quarterly') return;
  await db.update(schema.tenants).set({ boardCadence: value }).where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/settings');
  revalidatePath('/setup/board');
}

/**
 * Basic or Advanced. Dropping to Basic does not delete anything — connected systems simply stop
 * being read, and their KPIs go back to being confirmed by a person, which is a complete way to run
 * SPEC rather than a degraded one.
 */
export async function setTier(formData: FormData) {
  const user = await administrator();
  const value = String(formData.get('tier') ?? '');
  if (value !== 'basic' && value !== 'advanced') return;
  await db.update(schema.tenants).set({ tier: value }).where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/settings');
  revalidatePath('/today');
  revalidatePath('/connections');
}
