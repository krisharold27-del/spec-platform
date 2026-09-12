'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { diagnose } from '@/lib/diagnose';
import { logProblem, assign, respond, markDone, signOff } from '@/lib/register-data';

/**
 * The improvement register's writes.
 *
 * Every one goes through `assertWritable`, which is the single chokepoint that keeps a visitor
 * looking around from changing a real business. Logging a problem is the one thing on this page a
 * stranger can reach, so it matters that the guard is here and not remembered.
 */
async function writer() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

/**
 * Somebody typed a problem in plain words.
 *
 * Deliberately forgiving about length at the bottom and firm at the top: a few words is a real
 * problem tersely put, and two thousand characters is a document that belongs somewhere else.
 */
export async function logImprovement(formData: FormData) {
  const user = await writer();
  const text = String(formData.get('text') ?? '').trim().slice(0, 2000);
  if (text.length < 8) return;

  const diagnosis = await diagnose(text);
  await logProblem(user.tenantId, text, diagnosis, user.name);
  revalidatePath('/today');
}

export async function assignImprovement(formData: FormData) {
  const user = await writer();
  const id = String(formData.get('id') ?? '');
  const owner = String(formData.get('owner') ?? '').trim();
  const deadline = String(formData.get('deadline') ?? '').trim() || null;
  if (!id || !owner) return;
  await assign(user.tenantId, id, owner, deadline);
  revalidatePath('/today');
}

/** Accept it, or say it is not yours — which is information, not an escalation. */
export async function respondToImprovement(formData: FormData) {
  const user = await writer();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await respond(user.tenantId, id, formData.get('accepted') === 'yes');
  revalidatePath('/today');
}

export async function markImprovementDone(formData: FormData) {
  const user = await writer();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await markDone(user.tenantId, id);
  revalidatePath('/today');
}

/**
 * Signed off in the weekly meeting.
 *
 * A separate act from marking it done, on purpose — one person deciding their own work is finished
 * is how a register fills up with things that were never actually fixed.
 */
export async function signOffImprovement(formData: FormData) {
  const user = await writer();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await signOff(user.tenantId, id);
  revalidatePath('/today');
}
