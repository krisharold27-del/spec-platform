'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { refuseTo } from '@/lib/refuse';
import { seatFor } from '@/lib/seat-of';
import { maySeeMoney } from '@/lib/sight';
import { REVIEWS } from '@/lib/angus';

/**
 * Money — every write on the Angus Shield screen.
 *
 * All three are leadership-only, checked on the SERVER rather than by the buttons being absent: the
 * page hides them from a team member, and a hidden button is one devtools window away from being
 * pressed. Money is the one area where that distinction has actually cost businesses money.
 */

const SCREEN = '/money';
const now = () => new Date().toISOString();

async function leader() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const seat = await seatFor(user);
  if (!maySeeMoney(seat)) refuseTo(SCREEN, 'money');
  return user;
}

/**
 * Which financial system the figures come from.
 *
 * A SETTING, which is the whole architecture of Angus Shield. Turning it on writes one column —
 * there is no credential to store, no consent to obtain and no organisation to pick, because it is
 * the same database this statement is running against.
 */
export async function chooseSource(fd: FormData) {
  const user = await leader();
  const source = String(fd.get('source') ?? '');
  if (source !== 'angus' && source !== 'connector') redirect(SCREEN);

  await db.update(schema.tenants)
    .set({ financeSource: source })
    .where(eq(schema.tenants.id, user.tenantId));

  revalidatePath(SCREEN);
  redirect(SCREEN);
}

/**
 * Switch, or stay.
 *
 * Both are recorded, and that is the point of recording "stay": it is what stops SPEC asking again.
 * *"Never forced"* has to mean something in the code or it is a line in a brochure.
 */
export async function answerSwitch(fd: FormData) {
  const user = await leader();
  const answer = String(fd.get('answer') ?? '');
  if (answer !== 'switch' && answer !== 'stay') redirect(SCREEN);

  await db.update(schema.tenants)
    .set({
      angusAnswer: answer,
      angusAnsweredAt: now(),
      /*
        Switching sets the source here and nothing else yet. The move itself — chart of accounts,
        customers, balances, six months of history, reconciled to the cent — is a job that has to
        run and report, not a column flip, and it is deliberately not pretended otherwise: a button
        that says everything moved when nothing did would be the worst failure this product could
        have.
      */
      ...(answer === 'switch' ? { financeSource: 'angus' } : {}),
    })
    .where(eq(schema.tenants.id, user.tenantId));

  revalidatePath(SCREEN);
  redirect(SCREEN);
}

/**
 * The owner signs a review off.
 *
 * Signing is what turns a finding into a decision with a date on it, and only signed reviews reach
 * the board pack. A review with no finding cannot be signed — there would be nothing to have
 * agreed with, and a signature against an empty report is exactly the kind of evidence that is
 * worse than none.
 */
export async function signReview(fd: FormData) {
  const user = await leader();
  const reviewKey = String(fd.get('reviewKey') ?? '');
  if (!REVIEWS.some(r => r.key === reviewKey)) redirect(SCREEN);

  const [row] = await db.select()
    .from(schema.financeReviews)
    .where(and(
      eq(schema.financeReviews.tenantId, user.tenantId),
      eq(schema.financeReviews.reviewKey, reviewKey),
    ))
    .orderBy(desc(schema.financeReviews.periodStart))
    .limit(1);

  if (!row || row.finding === null || row.signedAt) redirect(SCREEN);

  await db.update(schema.financeReviews)
    .set({ signedAt: now(), signedBy: user.name })
    .where(and(
      eq(schema.financeReviews.id, row.id),
      eq(schema.financeReviews.tenantId, user.tenantId),
    ));

  revalidatePath(SCREEN);
  revalidatePath('/board');
  redirect(SCREEN);
}
