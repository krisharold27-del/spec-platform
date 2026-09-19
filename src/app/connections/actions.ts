'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getScope, assertAdministrator } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { fileUnder, categoryName, isSensitive } from '@/lib/systems';
import { refuseTo } from '@/lib/refuse';

/**
 * Connecting a system.
 *
 * Sensitive categories — anything carrying pay, personal records or the ledger — never connect on
 * a GM's say-so. They raise a request the board decides, with the exact data scope written on it,
 * because "the board felt they approved it" is not the same as the board approving it.
 */
async function administrator() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  assertAdministrator(await getScope(user));
  await assertWritable(user.tenantId);
  return user;
}

export async function connectSystem(formData: FormData) {
  const user = await administrator();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  /*
    Filed, not merely chosen. A name that says financials or payroll cannot be stored under a
    lighter category — see `fileUnder`. That was one dropdown between the board and the ledger.
  */
  const category = fileUnder(String(formData.get('category') ?? ''), name);
  const ownerName = String(formData.get('ownerName') ?? '').trim() || null;
  const ownerEmail = String(formData.get('ownerEmail') ?? '').trim() || null;

  const id = randomUUID();
  const sensitive = isSensitive(category);
  await db.insert(schema.systemConnections).values({
    id, tenantId: user.tenantId, name, category,
    ownerName, ownerEmail, ownerIsSelf: !ownerEmail,
    // A sensitive system sits disconnected until the board says otherwise. It is never connected
    // first and approved afterwards.
    status: 'requested',
    createdAt: new Date().toISOString(),
  });

  if (sensitive) {
    await db.insert(schema.approvals).values({
      id: randomUUID(), tenantId: user.tenantId, kind: 'connection',
      title: `${categoryName(category)} — ${name}`,
      detail: scopeFor(category),
      blocks: 'Blocks: the KPIs this system would feed stay manual, and anything it alone can measure stays not tracked.',
      decidedByLevel: 'board',
      requestedBy: user.name,
      requestedAt: new Date().toISOString(),
      refId: id,
    });
  }
  revalidatePath('/connections');
  revalidatePath('/inbox');
}

/** Exactly what the board is being asked to allow. Read only, always, and named in plain words. */
function scopeFor(category: string): string {
  switch (category) {
    case 'financials':
      return 'Invoices, gross profit and the profit and loss. Read only.';
    case 'payroll':
      return 'Personal records, pay, starters and leavers. Read only.';
    case 'safety':
      return 'Incidents, inductions and training records. Read only.';
    case 'crm':
      return 'Quotes, conversions and client records. Read only.';
    case 'job_management':
      return 'Jobs, timesheets and billable hours. Read only.';
    default:
      return 'Whatever this system holds that a KPI reads. Read only.';
  }
}

/** Disconnect. The KPIs it fed fall back to being confirmed by a person, which is a complete mode. */
export async function disconnectSystem(formData: FormData) {
  const user = await administrator();
  const id = String(formData.get('connectionId') ?? '');
  if (!id) return;
  // isNull(personalFor): an administrator runs the business's connections, not anybody's mailbox.
  // Without this, a well-meaning tidy-up of the connections list could disconnect a person's email.
  await db.update(schema.systemConnections)
    .set({ status: 'requested', lastSyncAt: null })
    .where(and(
      eq(schema.systemConnections.id, id),
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));
  revalidatePath('/connections');
}

/**
 * Mark a non-sensitive system live.
 *
 * Real credential exchange belongs to each connector and is not modelled here; this is the step
 * that says the business has done it. A sensitive system cannot reach this path at all — it goes
 * through the board.
 */
export async function markLive(formData: FormData) {
  const user = await administrator();
  const id = String(formData.get('connectionId') ?? '');
  if (!id) return;

  const [connection] = await db.select().from(schema.systemConnections)
    .where(and(eq(schema.systemConnections.id, id), eq(schema.systemConnections.tenantId, user.tenantId)));
  if (!connection) return;

  if (isSensitive(connection.category)) {
    const approved = await db.select().from(schema.approvals)
      .where(and(eq(schema.approvals.tenantId, user.tenantId), eq(schema.approvals.refId, id)));
    if (!approved.some(a => a.state === 'approved')) {
      refuseTo('/connections', 'That category needs the board to approve it first.');
    }
  }

  /*
    `lastSyncAt` stays NULL, because nothing has been read.

    It used to be stamped with the moment somebody pressed this button, and My Page printed it as
    "last read <date>" — a date that meant "when a person clicked", presented as when a number
    arrived. The wording was torn out on 18 September; the write that produced it was not, so the
    column still held a plausible-looking lie waiting for the next screen to print.

    The first real connector is what sets this, when it has actually read something.
  */
  await db.update(schema.systemConnections)
    .set({ status: 'live' })
    .where(eq(schema.systemConnections.id, id));
  revalidatePath('/connections');
  revalidatePath('/my-page');
}
