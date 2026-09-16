'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { decideTask, answerThreeQuestions, type Decision } from '@/lib/review-engine';
import { mayReadAutomationReview, type ReviewLevel } from '@/lib/automation';

const DECISIONS: Decision[] = ['approved', 'parked', 'rejected', 'proposed'];

/**
 * The gate, asked again on every write.
 *
 * Shared by both actions below rather than written twice, because a guard that exists in two places
 * is a guard that will exist in one of them after the next refactor.
 */
async function theDecider() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const scope = await getScope(user);
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  const level = (mine?.level === 'gm' || mine?.reportsToRoleId === null ? 'gm' : mine?.level) as ReviewLevel | undefined;
  if (!mayReadAutomationReview(level)) redirect('/today');
  return user;
}

/**
 * Approve, park or reject one candidate.
 *
 * Approving IS the build queue — there is no second table, because a queue that can disagree with
 * the list it came from is a queue that will.
 *
 * A rejection needs a reason and the engine enforces it rather than the form suggesting it. A no
 * with no reason cannot be revisited by anybody later; it can only be re-argued from scratch, which
 * is how a good idea gets rejected twice and a bad one approved on the third attempt.
 */
export async function decide(form: FormData) {
  const user = await theDecider();

  const taskId = String(form.get('taskId') ?? '');
  const raw = String(form.get('decision') ?? '');
  const decision = DECISIONS.includes(raw as Decision) ? (raw as Decision) : null;
  if (!taskId || !decision) redirect('/org/automation');

  const result = await decideTask({
    tenantId: user.tenantId,
    taskId,
    decision,
    reason: String(form.get('reason') ?? '') || null,
    by: user.email,
  });

  revalidatePath('/org/automation');
  redirect(result.ok ? '/org/automation?saved=1' : '/org/automation?needsreason=1');
}

/**
 * The three questions, for a role nobody has written a task list against.
 *
 * "What do you do each week, what takes the longest, what do you hate doing." Enough to start, and
 * the last two carry pain — because the person doing the work is the only reliable source for how
 * much it hurts, and pain is what breaks the tie between two candidates that save the same time.
 */
export async function describeRole(form: FormData) {
  const user = await theDecider();
  const roleId = String(form.get('roleId') ?? '');
  if (!roleId) redirect('/org/automation');

  await answerThreeQuestions({
    tenantId: user.tenantId,
    roleId,
    weekly: String(form.get('weekly') ?? ''),
    longest: String(form.get('longest') ?? ''),
    hated: String(form.get('hated') ?? ''),
  });

  revalidatePath('/org/automation');
  redirect('/org/automation?saved=1');
}
