'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { LADDER, MOST_A_CEILING_MAY_BE, ceilingsToStore } from '@/lib/ceilings';

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
  revalidatePath('/my-page');
  revalidatePath('/connections');
}

/**
 * What each level can earn in a month.
 *
 * The published ladder — 250, 500, 750, 1,000, 2,000, 4,000 — halves at each step, and that halving
 * is what makes it explainable in a pay conversation. It is a SUGGESTION: designs/the-rules.md says
 * "Ceilings are defaults, not law."
 *
 * Until now there was nowhere to keep a business's own numbers, so every customer was silently held
 * to SPEC's — a recommendation enforced as a rule nobody agreed to. A trade business in one state
 * and a services business in another do not pay the same.
 *
 * Only what DIFFERS from the ladder is stored, so a business that never touches this moves with the
 * ladder if SPEC ever revises it, rather than being frozen on a copy of today's numbers.
 */
export async function setCeilings(formData: FormData) {
  const user = await administrator();
  const entered: Record<string, number> = {};
  for (const { level } of LADDER) {
    const raw = String(formData.get(`ceiling_${level}`) ?? '').replace(/[^0-9.]/g, '');
    if (raw === '') continue;
    const value = Number(raw);
    // Out of range is ignored rather than clamped: silently paying somebody a number they did not
    // type is worse than leaving the field as it was and letting them see it did not take.
    if (!Number.isFinite(value) || value < 0 || value > MOST_A_CEILING_MAY_BE) continue;
    entered[level] = value;
  }
  await db.update(schema.tenants)
    .set({ ceilings: ceilingsToStore(entered) })
    .where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/settings');
  revalidatePath('/scorecard', 'layout');
}

/** Back to the published ladder. Storing null is what keeps them moving with it. */
export async function resetCeilings() {
  const user = await administrator();
  await db.update(schema.tenants).set({ ceilings: null }).where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/settings');
  revalidatePath('/scorecard', 'layout');
}
