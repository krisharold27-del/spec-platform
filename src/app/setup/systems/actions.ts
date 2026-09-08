'use server';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { guessCategory } from '@/lib/systems';

/**
 * Record a system the client runs.
 *
 * The person setting SPEC up is often not the person who administers the accounting package, so
 * this asks whose system it is rather than assuming. Naming someone else invites them for this one
 * job — it does not make them a SPEC user or add a billable seat.
 */
export async function addConnection(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/setup/systems?error=name');

  const category = String(formData.get('category') ?? '') || guessCategory(name);
  const ownerIsSelf = formData.get('owner') !== 'someone_else';
  const ownerName = ownerIsSelf ? null : String(formData.get('ownerName') ?? '').trim() || null;
  const ownerEmail = ownerIsSelf ? null : String(formData.get('ownerEmail') ?? '').trim().toLowerCase() || null;

  // Naming someone else without a way to reach them would leave the connection stranded.
  if (!ownerIsSelf && !ownerEmail) redirect('/setup/systems?error=owner');

  await db.insert(schema.systemConnections).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    name,
    category,
    ownerIsSelf,
    ownerName,
    ownerEmail,
    status: ownerIsSelf ? 'requested' : 'invited',
    createdAt: new Date().toISOString(),
  });

  redirect('/setup/systems?added=1');
}

export async function removeConnection(formData: FormData) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  const id = String(formData.get('id') ?? '');
  await db.delete(schema.systemConnections)
    .where(and(eq(schema.systemConnections.id, id), eq(schema.systemConnections.tenantId, user.tenantId)));
  redirect('/setup/systems');
}
