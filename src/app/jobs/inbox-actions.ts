'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { getTenantById } from '@/lib/queries';
import { createJob } from '@/lib/jobs-data';
import { readEmail, type InboxKind } from '@/lib/email-read';

/*
  From your inboxes: a message in, read, and one Approve. See lib/email-read for why it arrives by hand.
*/

async function writer() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

const back = (extra = ''): never => redirect(`/jobs?tab=pipeline${extra}#inbox`);

/** Put a forwarded or pasted email in front of the pipeline, read. */
export async function addInboxMessage(form: FormData) {
  const user = await writer();
  const text = String(form.get('message') ?? '').slice(0, 20_000).trim();
  if (text.length < 8) back('&cannot=' + encodeURIComponent('Paste the email in — who it is from and what they said.'));

  const tenant = await getTenantById(user.tenantId);
  const read = readEmail(text, tenant?.name ?? '');
  await db.insert(schema.mailboxMessages).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    kind: read.kind,
    fromName: read.from,
    subject: read.subject,
    body: text,
    readLine: read.read,
    reply: read.reply,
    addedBy: user.name,
    addedAt: new Date().toISOString(),
  });
  revalidatePath('/jobs');
  back();
}

/**
 * Approve SPEC's reading. An enquiry or plans opens the job, once; anything else is marked answered.
 * The reply is SPEC's draft — copied from the page and sent from wherever the business already
 * talks to that customer. SPEC sends nothing.
 */
export async function approveInboxItem(form: FormData) {
  const user = await writer();
  const id = String(form.get('id') ?? '').slice(0, 64);
  /* Found in this business and still open, so an id from anywhere else, or a second press, finds nothing. */
  const [item] = await db.select().from(schema.mailboxMessages).where(and(
    eq(schema.mailboxMessages.id, id),
    eq(schema.mailboxMessages.tenantId, user.tenantId),
    isNull(schema.mailboxMessages.doneAt),
  ));
  if (!item) back();

  let jobId: string | null = null;
  if ((item.kind as InboxKind) === 'enquiry' || (item.kind as InboxKind) === 'plans') {
    const tenant = await getTenantById(user.tenantId);
    const read = readEmail(item.body, tenant?.name ?? '');
    const job = read.job ?? { client: item.fromName, title: item.subject, site: '' };
    ({ id: jobId } = await createJob({
      tenantId: user.tenantId, stage: 'enquiry',
      title: job.title, client: job.client, site: job.site,
      createdBy: user.name,
    }));
  }
  await db.update(schema.mailboxMessages)
    .set({ jobId, doneAt: new Date().toISOString(), doneBy: user.name })
    .where(and(eq(schema.mailboxMessages.id, item.id), eq(schema.mailboxMessages.tenantId, user.tenantId)));
  revalidatePath('/jobs');
  back(jobId ? `&job=${jobId}` : '');
}
