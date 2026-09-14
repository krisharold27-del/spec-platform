'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { saveGoals } from '@/lib/goals-data';
import { GOAL_PROMPT_IDS } from '@/lib/goals';

/**
 * Save the goals and go on to the business.
 *
 * Only the known prompt ids are read out of the form — the rest of the payload is ignored rather
 * than trusted, which is the same rule lib/goals-data applies on the way in. Two places, because a
 * posted field name is user input and this is the one that decides what reaches the database.
 */
export async function saveBusinessGoals(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const answers: Record<string, string> = {};
  for (const id of GOAL_PROMPT_IDS) {
    const v = form.get(id);
    if (typeof v === 'string') answers[id] = v;
  }

  await saveGoals(user.tenantId, answers, user.name || user.email || null);

  // The goals are shown on both of these, so neither should serve a stale copy.
  revalidatePath('/setup');
  revalidatePath('/scoring');

  // `stay` keeps somebody on the page when they are editing goals they already set, rather than
  // pushing a returning leader back into the setup run they finished weeks ago.
  if (form.get('stay') === '1') redirect('/setup/goals?saved=1');
  redirect('/setup');
}
