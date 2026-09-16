'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { addIntake } from '@/lib/review-engine';
import { assertWritable } from '@/lib/plan';

/**
 * Somebody says what they would change.
 *
 * Open to every signed-in person, which makes it the widest write path in the product — so it is
 * also the one most worth being careful about. Three things it does not do:
 *
 *   It does not touch a scorecard. Nothing written here can affect what anybody is measured on,
 *   which is what makes it safe to be honest in.
 *   It does not accept a visitor. A look-around business is read-only everywhere, and this is not
 *   the exception.
 *   It does not rewrite what they said. The text is stored as typed.
 */
export async function say(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const text = String(form.get('text') ?? '').trim();
  // Eight characters, matching the front door's problem box. Shorter than that is a slip, not a
  // thought, and a list full of "test" teaches everybody the box is a joke.
  if (text.length < 8) redirect('/intake');

  const { matched } = await addIntake({
    tenantId: user.tenantId,
    byName: user.name || user.email,
    text: text.slice(0, 1000),
  });

  revalidatePath('/intake');
  revalidatePath('/org/automation');
  redirect(`/intake?said=${matched ? 'matched' : 'new'}`);
}
