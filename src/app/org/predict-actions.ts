'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { readTheChart, approvePrediction, denyPrediction } from '@/lib/predict-data';

/**
 * Approve, deny, or ask for a fresh reading.
 *
 * Approving creates a role, so it is a manage-level act — the same bar as drawing one by hand. A
 * proposal that could be approved by anybody with a seat would be a way around who gets to change
 * the shape of the business.
 */

async function manager() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

export async function readChart() {
  const user = await manager();
  const added = await readTheChart(user.tenantId);
  revalidatePath('/org');
  // The count is in the URL so the page can say "nothing new" out loud. A reading that finds a
  // complete chart should read as a result, not as a button that did nothing.
  redirect(`/org?read=${added}`);
}

export async function approveRole(form: FormData) {
  const user = await manager();
  const id = String(form.get('id') ?? '');
  if (id) await approvePrediction(user.tenantId, id, user.name || user.email || null);
  revalidatePath('/org');
  revalidatePath('/setup');
  redirect('/org');
}

export async function denyRole(form: FormData) {
  const user = await manager();
  const id = String(form.get('id') ?? '');
  if (id) await denyPrediction(user.tenantId, id, user.name || user.email || null);
  revalidatePath('/org');
  redirect('/org');
}
