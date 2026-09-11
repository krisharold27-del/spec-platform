'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope, isTopOfChart } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';

/**
 * Handing the month up, and closing it.
 *
 * Two deliberate acts by two different people, kept apart on purpose. Submitting says "this is
 * finished as far as I am concerned"; signing says "the business accepts it". Locking follows the
 * signature rather than a date, because a month is closed by a person deciding it is closed.
 */

async function periodFor(tenantId: string, periodId: string) {
  const [period] = await db.select().from(schema.periods)
    .where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, tenantId)));
  return period ?? null;
}

/** Submit the month for sign-off. Business-wide, so it belongs to the top of the chart. */
export async function submitPeriod(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  const scope = await getScope(user);
  if (!isTopOfChart(scope)) throw new Error('Only the top of the org chart submits the month.');
  await assertWritable(user.tenantId);

  const period = await periodFor(user.tenantId, String(formData.get('periodId') ?? ''));
  if (!period || period.status !== 'open') return;

  await db.update(schema.periods)
    .set({ status: 'submitted', submittedBy: user.name, submittedAt: new Date().toISOString() })
    .where(eq(schema.periods.id, period.id));
  revalidatePath('/scoring');
}

/**
 * Reopen a submitted month.
 *
 * Submitting is not a trap. Something wrong found after submission is corrected before the
 * signature, not written up as an amendment afterwards — that is only how a LOCKED month is
 * corrected, because a locked month is history and history is never rewritten.
 */
export async function reopenPeriod(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  const scope = await getScope(user);
  if (!isTopOfChart(scope)) throw new Error('Only the top of the org chart reopens the month.');
  await assertWritable(user.tenantId);

  const period = await periodFor(user.tenantId, String(formData.get('periodId') ?? ''));
  if (!period || period.status !== 'submitted') return;

  await db.update(schema.periods)
    .set({ status: 'open', submittedBy: null, submittedAt: null })
    .where(eq(schema.periods.id, period.id));
  revalidatePath('/scoring');
}

/**
 * Sign the month. Signing is never delegable — it is one of the two things in SPEC that must be
 * done by the person whose name goes on it. Locking is the separate act that follows.
 */
export async function signPeriod(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  const scope = await getScope(user);
  if (!isTopOfChart(scope)) throw new Error('Only the top of the org chart signs the month.');
  await assertWritable(user.tenantId);

  const period = await periodFor(user.tenantId, String(formData.get('periodId') ?? ''));
  if (!period || period.status !== 'submitted') return;

  await db.update(schema.periods)
    .set({ signedBy: user.name, signedAt: new Date().toISOString() })
    .where(eq(schema.periods.id, period.id));
  revalidatePath('/scoring');
}
