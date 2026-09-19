'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { kindOf, stepStateOf } from '@/lib/boards-live';
import { createBoard, commentOnBoard, addKpiToBoard, removeKpiFromBoard, moveStep, addStep } from '@/lib/boards-live-data';
import { getScope } from '@/lib/scope';
import { refuseTo } from '@/lib/refuse';

/**
 * Starting a board, and saying something on one.
 *
 * Open to everybody with a seat, deliberately. A board is the thing a team makes together, and the
 * person who knows the rate is wrong is usually not the person who would be allowed to change it —
 * the same asymmetry the intake box exists for. `assertWritable` still applies, so a visitor looking
 * around writes nothing and a business whose payment failed is read-only.
 */

export async function newBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const title = String(form.get('title') ?? '').trim();
  // A board with no name is a board nobody will ever find again. Nothing is created.
  if (!title) redirect('/mirrors?needs=title');

  const id = await createBoard({
    tenantId: user.tenantId,
    title,
    kind: kindOf(String(form.get('kind') ?? '')),
    summary: String(form.get('summary') ?? '').trim(),
    createdBy: user.name,
  });
  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${id}`);
}

export async function sayOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const text = String(form.get('text') ?? '').trim();
  if (!boardId || !text) redirect(boardId ? `/mirrors?board=${boardId}` : '/mirrors');

  await commentOnBoard({ tenantId: user.tenantId, boardId, authorName: user.name, text });
  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${boardId}`);
}

/**
 * Put one of the business's KPIs onto a mirror, or take it off again.
 *
 * ── Why a KPI on a mirror is a pointer and not a number ──────────────────────────────────────────
 *
 * Kris, 19 September: mirrors should work *"same as Artifacts in claude"* — live, not a printout —
 * and *"align to key kpi's in the business"*.
 *
 * So this stores the criterion, not its value. Every open reads it again for whatever month is
 * being looked at, which is what makes changing the month on a mirror mean something and what stops
 * a mirror ever disagreeing with the scorecard it is about.
 *
 * ── Who may ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The role has to be inside the viewer's own part of the chart, checked with the same `canSee` the
 * scorecards use. A mirror is a conversation object that people share, and without this it would be
 * a way to publish somebody else's numbers to a room they never agreed to be in.
 */
export async function putKpiOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  /*
    One control, two facts.

    The picker is a single select, and a measure is only meaningful with the role it belongs to —
    so the option carries both, joined. Neither is trusted: the action checks the role is in this
    viewer's scope, and the write checks the criterion really belongs to that role in this business.
  */
  const [criterionId = '', roleId = ''] = String(form.get('criterionId') ?? '').split('|');
  const back = `/mirrors?board=${encodeURIComponent(boardId)}`;
  if (!boardId || !criterionId || !roleId) redirect(back);

  const scope = await getScope(user);
  if (!scope.canSee(roleId)) {
    refuseTo(back, 'That measure belongs to a part of the chart you cannot see, so SPEC will not put it on a mirror.');
  }

  const { added } = await addKpiToBoard({ tenantId: user.tenantId, boardId, criterionId, roleId });
  revalidatePath('/mirrors');
  if (!added) refuseTo(back, 'That measure is already on this mirror.');
  redirect(back);
}

export async function takeKpiOffBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const criterionId = String(form.get('criterionId') ?? '');
  if (!boardId || !criterionId) redirect('/mirrors');

  // Only what the mirror SHOWS is changed. The measure, its target and its history are untouched.
  await removeKpiFromBoard({ tenantId: user.tenantId, boardId, criterionId });
  revalidatePath('/mirrors');
  redirect(`/mirrors?board=${encodeURIComponent(boardId)}`);
}

/**
 * Moving a step on a plan, and adding one.
 *
 * Kris, 19 September: *"so the King of the Mountain mirror must be interactive"*. A plan a team is
 * looking at in a meeting could not be changed in that meeting — the states were on the screen in
 * words and the only way to move one was to edit a row of JSON.
 *
 * Open to anybody with a seat, like commenting, and for the same reason: the person who knows a
 * step is stuck is usually not the person allowed to change anything else about it. `assertWritable`
 * still applies, so a look-around writes nothing and a lapsed business is read-only.
 */
export async function moveStepOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const text = String(form.get('text') ?? '');
  const back = `/mirrors?board=${encodeURIComponent(boardId)}`;
  if (!boardId || !text) redirect('/mirrors');

  await moveStep({
    tenantId: user.tenantId,
    boardId,
    text,
    state: stepStateOf(String(form.get('state') ?? '')),
  });
  revalidatePath('/mirrors');
  redirect(back);
}

export async function addStepToBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const back = `/mirrors?board=${encodeURIComponent(boardId)}`;
  if (!boardId) redirect('/mirrors');

  const { added } = await addStep({
    tenantId: user.tenantId,
    boardId,
    text: String(form.get('text') ?? ''),
    // Whoever is adding it, unless they name somebody. A step with no owner is how a plan rots.
    owner: String(form.get('owner') ?? '') || user.name,
  });
  revalidatePath('/mirrors');
  if (!added) {
    refuseTo(back, 'That step needs some words, and cannot be one already on this plan.');
  }
  redirect(back);
}
