'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { kindOf } from '@/lib/boards-live';
import { createBoard, commentOnBoard } from '@/lib/boards-live-data';

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
  if (!title) redirect('/boards?needs=title');

  const id = await createBoard({
    tenantId: user.tenantId,
    title,
    kind: kindOf(String(form.get('kind') ?? '')),
    summary: String(form.get('summary') ?? '').trim(),
    createdBy: user.name,
  });
  revalidatePath('/boards');
  redirect(`/boards?board=${id}`);
}

export async function sayOnBoard(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const boardId = String(form.get('boardId') ?? '');
  const text = String(form.get('text') ?? '').trim();
  if (!boardId || !text) redirect(boardId ? `/boards?board=${boardId}` : '/boards');

  await commentOnBoard({ tenantId: user.tenantId, boardId, authorName: user.name, text });
  revalidatePath('/boards');
  redirect(`/boards?board=${boardId}`);
}
