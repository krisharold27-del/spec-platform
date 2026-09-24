'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { isToken, isVariationAnswer, mayAnswer } from '@/lib/customer-page';

/**
 * The two things a customer may do, and the fence around them.
 *
 * ── These run with no signed-in user ─────────────────────────────────────────────────────────────
 *
 * Everything else that writes in SPEC starts by asking who is signed in. Nobody is signed in here,
 * so the token IS the authority — and that means every one of these has to find the job BY TOKEN
 * and work only on what it finds. A job id from the form would let anybody who has one link write
 * to any job in any business, which is the whole risk of a page without a sign-in, in one mistake.
 *
 * So: no id is ever accepted from the page, the token is validated for shape before it touches the
 * database, and each action changes only the columns a customer is allowed to change.
 */

const jobFor = async (token: unknown) => {
  const t = String(token ?? '');
  if (!isToken(t)) return null;
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.customerToken, t));
  return job ?? null;
};

/** The customer picks one of the times they were offered. */
export async function pickSlot(formData: FormData) {
  const job = await jobFor(formData.get('token'));
  if (!job) return;
  /* Only before the work starts. A slot changed mid-job is a crew standing in the wrong street. */
  if (!['enquiry', 'quoted', 'won', 'scheduled'].includes(job.stage)) return;

  const slot = String(formData.get('slot') ?? '').slice(0, 60);
  if (!slot) return;

  await db.update(schema.jobs)
    .set({ bookedSlot: slot, stage: 'scheduled', stageAt: new Date().toISOString() })
    .where(eq(schema.jobs.id, job.id));
  revalidatePath(`/customer/${job.customerToken}`);
  revalidatePath('/jobs');
}

/**
 * The customer approves the extra work, or asks for a call.
 *
 * "Call me first" is not a decline, and it is not recorded as one. Almost nobody hesitating over an
 * extra cost wants to refuse the work outright — they want two minutes on the phone, and a button
 * that says so is what turns a variation into an AGREED variation rather than an argument at
 * invoicing. SPEC will not bill an unagreed variation (see `maySend` in lib/billing-job), so this
 * is the moment that decides whether that money is ever collected.
 */
export async function answerVariation(formData: FormData) {
  const job = await jobFor(formData.get('token'));
  if (!job) return;

  const answer = String(formData.get('answer') ?? '');
  if (!isVariationAnswer(answer)) return;

  const [variation] = await db.select().from(schema.jobBills)
    .where(and(
      eq(schema.jobBills.tenantId, job.tenantId),
      eq(schema.jobBills.jobId, job.id),
      eq(schema.jobBills.kind, 'variation'),
    ));
  if (!mayAnswer(variation ?? null, job.stage)) return;

  await db.update(schema.jobBills).set({
    state: answer === 'approved' ? 'agreed' : 'draft',
    /* Who agreed to it and when — the record that makes it billable later. */
    agreedBy: answer === 'approved' ? job.client : null,
    agreedAt: answer === 'approved' ? new Date().toISOString() : null,
    /*
      A request for a call goes on the description, never into a "declined" state. The bill's states
      are draft/agreed/sent/paid/declined, and `declined` means the customer said no to the work —
      writing "call me" there would lose the job SPEC could still have.
    */
    what: answer === 'call_me'
      ? `${variation.what} — the customer asked for a call before approving.`.slice(0, 400)
      : variation.what,
  }).where(eq(schema.jobBills.id, variation.id));

  revalidatePath(`/customer/${job.customerToken}`);
  revalidatePath('/jobs');
}
