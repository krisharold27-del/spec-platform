'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { LADDER, MOST_A_CEILING_MAY_BE, ceilingsToStore } from '@/lib/ceilings';
import { revokeGrant } from '@/lib/rights';
import { mayChangeAdministrator } from '@/lib/administrators';
import { refuseTo } from '@/lib/refuse';

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

/**
 * Take back rights over somebody else's branch.
 *
 * The other half of Kris's rule, 19 September: *"if rights are needed then the admin must approve
 * this"*. An approval that can never be undone is not a decision, it is a one-way door — and the
 * person who granted it is usually not the person who eventually needs to close it.
 *
 * `revokeGrant` stamps a date rather than deleting the row, and is tenant-scoped on every clause: a
 * grant id arriving from a form is somebody else's text until the query proves otherwise, and this
 * is the table that decides who reads whose numbers.
 */
export async function revokeRights(form: FormData) {
  const user = await administrator();
  const grantId = String(form.get('grantId') ?? '');
  if (!grantId) return;

  await revokeGrant(user.tenantId, grantId);

  // Everywhere that asks scope a question. A right taken back has to stop working on the next page
  // somebody opens, not whenever a cache happens to expire.
  for (const path of ['/settings', '/org', '/team', '/inbox', '/my-page']) revalidatePath(path);
}

/**
 * Hand administration to somebody else, or take it back.
 *
 * Kris, 24 September: *"original person to sign up begins as an admin but they can change that to
 * someone else if they wish."* The first half was already true; the second half had no path at all
 * — access was written once by `assignPerson` and nothing in SPEC could change it afterwards. See
 * lib/administrators for the rules and for the one state they exist to make unreachable.
 */
export async function setAdministrator(form: FormData) {
  const user = await administrator();
  const subjectId = String(form.get('userId') ?? '');
  const makeAdministrator = form.get('make') === 'on';
  if (!subjectId) return;

  /*
    Read the seats fresh and decide from them, rather than trusting anything the form said about who
    currently holds what. Two administrators stepping down in the same minute is exactly how a
    business reaches nobody, and the count has to come from the database at the moment of the write.
  */
  const seats = await db.select({
    id: schema.users.id, name: schema.users.name, email: schema.users.email, access: schema.users.access,
  }).from(schema.users).where(eq(schema.users.tenantId, user.tenantId));

  const decision = mayChangeAdministrator(seats, user.id, subjectId, makeAdministrator);
  if (!decision.ok) refuseTo('/settings', decision.reason);

  await db.update(schema.users).set({ access: decision.access })
    .where(and(eq(schema.users.id, subjectId), eq(schema.users.tenantId, user.tenantId)));

  // Every screen that asks who somebody is. Rights taken back have to stop working on the next page
  // opened, not whenever a cache happens to expire.
  for (const path of ['/settings', '/admin', '/org', '/team', '/inbox', '/my-page']) revalidatePath(path);
}
