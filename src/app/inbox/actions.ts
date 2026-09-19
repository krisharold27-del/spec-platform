'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { requireManager } from '@/lib/guard';
import { getScope, isTopOfChart } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { refuseTo } from '@/lib/refuse';
import { grantBranch } from '@/lib/rights';

/**
 * Deciding an approval.
 *
 * Two rules from the rule book do the work here. A decision at board level is made by the board —
 * there is no delegating it and no acting for somebody else. And a decline is a real outcome: the
 * thing stays off, its KPIs stay manual, and the request is closed with a name and a date against
 * it rather than sitting in the queue forever.
 */
async function decide(formData: FormData, state: 'approved' | 'declined') {
  const user = await requireManager();
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
    refuseTo('/inbox', 'That decision belongs to the board.');
  }
  if (approval.decidedByLevel === 'administrator' && !scope.canAdminister) {
    refuseTo('/inbox', 'That decision needs an administrator.');
  }

  await db.update(schema.approvals)
    .set({ state, decidedBy: user.name, decidedAt: new Date().toISOString() })
    .where(eq(schema.approvals.id, approval.id));

  // An approved connection is the one kind that changes something elsewhere: it is what lets the
  // system start feeding numbers at all.
  if (state === 'approved' && approval.kind === 'connection' && approval.refId) {
    // A personal mailbox never goes to the board, so in principle this can never reach one.
    // isNull(personalFor) anyway: a refId is free-form, this is a privacy boundary, and the cost of
    // being certain is one line.
    await db.update(schema.systemConnections)
      .set({ status: 'invited' })
      .where(and(
        eq(schema.systemConnections.id, approval.refId),
        eq(schema.systemConnections.tenantId, user.tenantId),
        isNull(schema.systemConnections.personalFor),
      ));
  }

  /*
    ── An approved rights request is the other kind that changes something elsewhere ─────────────

    Kris, 19 September: *"if rights are needed then the admin must approve this"*. Until the
    administrator presses Approve, the request is a row saying somebody asked and nothing more.
    This is the moment it becomes real, and it is the only place in SPEC where one person's reach
    over another's scorecards widens.

    The requester is matched by NAME because that is what an approval stores, and a business can
    have two people with the same one. So it grants only when exactly one account matches: two
    matches is ambiguous and the wrong guess hands somebody else's crew to the wrong person, which
    is precisely the mistake this whole feature exists to prevent. The approval still records the
    decision, and the administrator is told rather than left believing it landed.
  */
  if (state === 'approved' && approval.kind === 'rights' && approval.refId) {
    const named = (await db.select().from(schema.users)
      .where(eq(schema.users.tenantId, user.tenantId)))
      .filter(u => u.name === approval.requestedBy);

    if (named.length !== 1) {
      refuseTo('/inbox', named.length === 0
        ? `SPEC cannot find an account for ${approval.requestedBy}, so no rights were given. The decision is recorded.`
        : `More than one account is named ${approval.requestedBy}, so SPEC will not guess which one asked. Give the rights from Admin instead. The decision is recorded.`);
    }

    // The role has to be in this business. A refId is free-form and never dereferenced blindly.
    const [role] = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.id, approval.refId), eq(schema.roles.tenantId, user.tenantId)));
    if (role) {
      await grantBranch({
        tenantId: user.tenantId,
        userId: named[0].id,
        roleId: role.id,
        grantedBy: user.name,
      });
    }
  }

  revalidatePath('/inbox');
  revalidatePath('/connections');
  revalidatePath('/org');
  revalidatePath('/team');
}

export async function approve(formData: FormData) { await decide(formData, 'approved'); }
export async function decline(formData: FormData) { await decide(formData, 'declined'); }

/**
 * Choose how loud SPEC is, for yourself.
 *
 * No permission check beyond being signed in, and that is deliberate: this only ever writes to the
 * row of the person making the request. A readonly seat may set its own loudness — the alternative
 * is a business where only managers can stop being emailed, which is nobody's idea of a setting.
 *
 * Not guarded by assertWritable either. A visitor looking around has no row to write to, so there
 * is nothing to stop; and a business whose plan has lapsed must still be able to make its own mail
 * quieter rather than being billed into silence.
 */
export async function setNotifyLevel(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const level = String(formData.get('level') ?? '');
  if (!['quiet', 'normal', 'everything'].includes(level)) return;

  await db.update(schema.users)
    .set({ notifyLevel: level })
    .where(and(eq(schema.users.id, user.id), eq(schema.users.tenantId, user.tenantId)));
  revalidatePath('/inbox');
}
