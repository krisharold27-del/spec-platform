'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { getScope } from '@/lib/scope';
import { refuseTo } from '@/lib/refuse';
import { STORED_AREAS, isComplianceArea } from '@/lib/compliance';

const refresh = () => {
  // People too: licences shown here are the same rows that gate Clear to Work there.
  for (const p of ['/compliance', '/people', '/my-page']) revalidatePath(p);
};

async function manager() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

/** Record something that has to be kept current — a policy, a certificate, an audit, a contract. */
export async function addItem(form: FormData) {
  const user = await manager();
  const kind = String(form.get('kind') ?? '');
  const title = String(form.get('title') ?? '').trim();
  if (!title) return;

  /*
    Only the four areas this table holds. Licences live in `obligations` and breaches are corrective
    actions — writing either here would be the second copy the whole page is built to avoid.
  */
  if (!isComplianceArea(kind) || !STORED_AREAS.includes(kind)) {
    refuseTo('/compliance', 'That is held somewhere else in SPEC and is only read here.');
  }

  const ownerRoleId = String(form.get('ownerRoleId') ?? '').trim();
  let owner: string | null = null;
  if (ownerRoleId) {
    const scope = await getScope(user);
    owner = scope.roles.some(r => r.id === ownerRoleId) ? ownerRoleId : null;
  }

  const now = new Date().toISOString();
  await db.insert(schema.complianceItems).values({
    id: randomUUID(), tenantId: user.tenantId, kind, title,
    covers: String(form.get('covers') ?? '').trim() || null,
    expiresAt: String(form.get('expiresAt') ?? '').trim() || null,
    reference: String(form.get('reference') ?? '').trim() || null,
    ownerRoleId: owner,
    createdAt: now, updatedAt: now,
  });
  refresh();
}

/** Renew it: a new date, and the old one stops being the answer. */
export async function renewItem(form: FormData) {
  const user = await manager();
  const id = String(form.get('id') ?? '');
  const expiresAt = String(form.get('expiresAt') ?? '').trim();
  if (!id || !expiresAt) return;

  const [row] = await db.select().from(schema.complianceItems)
    .where(and(eq(schema.complianceItems.id, id), eq(schema.complianceItems.tenantId, user.tenantId)));
  if (!row) return;

  await db.update(schema.complianceItems)
    .set({ expiresAt, satisfiedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(schema.complianceItems.id, id));
  refresh();
}

/**
 * Mark a one-off done — a certificate lodged, an audit held.
 *
 * Separate from renewing, because they are different facts. A policy that is renewed has a new
 * expiry; a certificate that is lodged has no expiry at all and is simply finished.
 */
export async function satisfyItem(form: FormData) {
  const user = await manager();
  const id = String(form.get('id') ?? '');
  const reference = String(form.get('reference') ?? '').trim();
  if (!id) return;

  const [row] = await db.select().from(schema.complianceItems)
    .where(and(eq(schema.complianceItems.id, id), eq(schema.complianceItems.tenantId, user.tenantId)));
  if (!row) return;

  const now = new Date().toISOString();
  await db.update(schema.complianceItems)
    .set({ satisfiedAt: now, reference: reference || row.reference, updatedAt: now })
    .where(eq(schema.complianceItems.id, id));
  refresh();
}
