'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope, isTopOfChart } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';

/**
 * Deciding an approval.
 *
 * Two rules from the rule book do the work here. A decision at board level is made by the board —
 * there is no delegating it and no acting for somebody else. And a decline is a real outcome: the
 * thing stays off, its KPIs stay manual, and the request is closed with a name and a date against
 * it rather than sitting in the queue forever.
 */
async function decide(formData: FormData, state: 'approved' | 'declined') {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);

  const id = String(formData.get('approvalId') ?? '');
  if (!id) return;

  const [approval] = await db.select().from(schema.approvals)
    .where(and(eq(schema.approvals.id, id), eq(schema.approvals.tenantId, user.tenantId)));
  if (!approval || approval.state !== 'waiting') return;

  const scope = await getScope(user);
  // Board-level decisions belong to the top of the chart; administration is a separate right and
  // never widens what somebody may decide.
  if (approval.decidedByLevel === 'board' && !isTopOfChart(scope)) {
    throw new Error('That decision belongs to the board.');
  }
  if (approval.decidedByLevel === 'administrator' && !scope.canAdminister) {
    throw new Error('That decision needs an administrator.');
  }

  await db.update(schema.approvals)
    .set({ state, decidedBy: user.name, decidedAt: new Date().toISOString() })
    .where(eq(schema.approvals.id, approval.id));

  // An approved connection is the one kind that changes something elsewhere: it is what lets the
  // system start feeding numbers at all.
  if (state === 'approved' && approval.kind === 'connection' && approval.refId) {
    await db.update(schema.systemConnections)
      .set({ status: 'invited' })
      .where(and(
        eq(schema.systemConnections.id, approval.refId),
        eq(schema.systemConnections.tenantId, user.tenantId),
      ));
  }

  revalidatePath('/inbox');
  revalidatePath('/connections');
}

export async function approve(formData: FormData) { await decide(formData, 'approved'); }
export async function decline(formData: FormData) { await decide(formData, 'declined'); }
