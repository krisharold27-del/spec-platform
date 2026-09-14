'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, canManage } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { readTheGoal, adoptCascadeRow, dismissCascadeRow } from '@/lib/cascade-data';

/**
 * Work the goal down the chart, take a row, or drop one.
 *
 * Adopting writes a KPI onto somebody's scorecard, so it is a manage-level act — the same bar as
 * editing one by hand. Anything less would be a way to put a measure on a person without the
 * authority to do it.
 */

async function manager() {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

export async function readGoal() {
  const user = await manager();
  const { added } = await readTheGoal(user.tenantId);
  revalidatePath('/org');
  redirect(`/org?cascade=${added}`);
}

export async function adoptKpi(form: FormData) {
  const user = await manager();
  const id = String(form.get('id') ?? '');
  if (id) await adoptCascadeRow(user.tenantId, id, user.name || user.email || null);
  revalidatePath('/org');
  revalidatePath('/setup');
  revalidatePath('/setup/kpis');
  redirect('/org');
}

export async function dismissKpi(form: FormData) {
  const user = await manager();
  const id = String(form.get('id') ?? '');
  if (id) await dismissCascadeRow(user.tenantId, id, user.name || user.email || null);
  revalidatePath('/org');
  redirect('/org');
}
