'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { refuseTo } from '@/lib/refuse';
import { fingerprint, type Action } from '@/lib/recommends';
import { recommendationFor, logDecision, carryOut } from '@/lib/recommends-data';

/** Only ever back to a screen inside SPEC. */
function safe(path: string): string {
  return path.startsWith('/') && !path.startsWith('//') ? path : '/virtual-gm';
}

/**
 * "Ready to do this?" — Yes or Not yet.
 *
 * The recommendation is worked out again here from the business's own rows, never taken from the
 * form, and it must be the one that was shown: a Yes to last week's numbers cannot carry out this
 * week's. Then SPEC does exactly the action it named, and logs the decision with the numbers it was
 * based on.
 */
export async function decide(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  const topic = String(formData.get('topic') ?? '');
  const answer = String(formData.get('answer') ?? '');
  const shown = String(formData.get('fingerprint') ?? '');
  const back = safe(String(formData.get('back') ?? '/virtual-gm'));
  if (answer !== 'yes' && answer !== 'not_yet') refuseTo(back, 'That answer was not one SPEC offered.');

  const rec = await recommendationFor(user.tenantId, topic, user);
  if (!rec) refuseTo(back, 'SPEC has no recommendation by that name.');
  if (fingerprint(rec) !== shown) {
    refuseTo(back, 'The numbers changed since that was shown. Here is the recommendation as it stands now.');
  }

  if (answer === 'not_yet') {
    await logDecision({ tenantId: user.tenantId, userName: user.name, rec, answer: 'not_yet' });
    revalidatePath(back.split('?')[0]);
    redirect(back);
  }

  const action: Action | undefined = rec.kind === 'recommend' ? rec.action
    : rec.kind === 'missing' ? rec.interest?.action : undefined;
  if (!action) refuseTo(back, 'There is nothing to do on this one.');

  // A fix accepted in the meeting needs somebody to own it. An action with no owner is not an action.
  const owner = String(formData.get('owner') ?? '').trim().slice(0, 80);
  if (action.type === 'meeting_action' && !owner) refuseTo(back, 'Name who owns it, then say yes.');

  let outcome: 'done' | 'failed' = 'done';
  try {
    await carryOut(user.tenantId, user.name, action, { owner, user });
  } catch {
    outcome = 'failed';
  }
  await logDecision({ tenantId: user.tenantId, userName: user.name, rec, answer: 'yes', action, outcome });
  if (outcome === 'failed') refuseTo(back, 'SPEC could not do that just now. Nothing was changed — try again.');

  revalidatePath(back.split('?')[0]);
  if (action.type === 'start_switch') redirect(`/switch?area=${action.area}`);
  redirect(back);
}
