'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { getScope, isTopOfChart } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { refuseTo } from '@/lib/refuse';

/**
 * Handing the month up, and closing it.
 *
 * Two deliberate acts by two different people, kept apart on purpose. Submitting says "this is
 * finished as far as I am concerned"; signing says "the business accepts it". Locking follows the
 * signature rather than a date, because a month is closed by a person deciding it is closed.
 *
 * ── These are called from TWO screens now, so they revalidate both ──────────────────────────────
 *
 * They each revalidated `/scoring` alone, which was true while that was the only page they could be
 * pressed from. Kris, 19 September: *"having to visit three screens"* — so Approvals now carries
 * the same three buttons beside the month they act on.
 *
 * With one path revalidated, pressing Submit on Approvals worked and the page came back saying the
 * month was still open: the write landed and the screen denied it, which is indistinguishable from
 * a button that does nothing. Caught by `scripts/signoff-journey.mjs`, which pressed Submit, found
 * no Sign button afterwards, and reported the month had "never reached submitted".
 */
const SCREENS = ['/scoring', '/inbox', '/my-page'] as const;
const refresh = () => { for (const path of SCREENS) revalidatePath(path); };

async function periodFor(tenantId: string, periodId: string) {
  const [period] = await db.select().from(schema.periods)
    .where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, tenantId)));
  return period ?? null;
}

/** Submit the month for sign-off. Business-wide, so it belongs to the top of the chart. */
export async function submitPeriod(formData: FormData) {
  const user = await requireManager();
  const scope = await getScope(user);
  if (!isTopOfChart(scope)) refuseTo('/scoring', 'Only the top of the org chart submits the month.');
  await assertWritable(user.tenantId);

  const period = await periodFor(user.tenantId, String(formData.get('periodId') ?? ''));
  if (!period || period.status !== 'open') return;

  await db.update(schema.periods)
    .set({ status: 'submitted', submittedBy: user.name, submittedAt: new Date().toISOString() })
    .where(eq(schema.periods.id, period.id));
  refresh();
}

/**
 * Reopen a submitted month.
 *
 * Submitting is not a trap. Something wrong found after submission is corrected before the
 * signature, not written up as an amendment afterwards — that is only how a LOCKED month is
 * corrected, because a locked month is history and history is never rewritten.
 */
export async function reopenPeriod(formData: FormData) {
  const user = await requireManager();
  const scope = await getScope(user);
  if (!isTopOfChart(scope)) refuseTo('/scoring', 'Only the top of the org chart reopens the month.');
  await assertWritable(user.tenantId);

  const period = await periodFor(user.tenantId, String(formData.get('periodId') ?? ''));
  if (!period || period.status !== 'submitted') return;

  await db.update(schema.periods)
    .set({ status: 'open', submittedBy: null, submittedAt: null })
    .where(eq(schema.periods.id, period.id));
  refresh();
}

/**
 * Sign the month. Signing is never delegable — it is one of the two things in SPEC that must be
 * done by the person whose name goes on it. Locking is the separate act that follows.
 */
export async function signPeriod(formData: FormData) {
  const user = await requireManager();
  const scope = await getScope(user);
  if (!isTopOfChart(scope)) refuseTo('/scoring', 'Only the top of the org chart signs the month.');
  await assertWritable(user.tenantId);

  const period = await periodFor(user.tenantId, String(formData.get('periodId') ?? ''));
  if (!period || period.status !== 'submitted') return;

  await db.update(schema.periods)
    .set({ signedBy: user.name, signedAt: new Date().toISOString() })
    .where(eq(schema.periods.id, period.id));
  refresh();
}
