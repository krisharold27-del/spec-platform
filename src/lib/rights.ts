import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';

/**
 * Granting somebody rights over a branch they do not sit above — what an approval actually DOES.
 *
 * ── Why this is here and not in the approval screen ──────────────────────────────────────────────
 *
 * Kris, 19 September: *"if rights are needed then the admin must approve this"*.
 *
 * Deciding and granting are two different jobs. The Approvals screen knows who is entitled to press
 * the button; it has no business knowing what a right IS. Keeping the grant here means there is one
 * place in SPEC where somebody's reach over other people's scorecards widens, which is the only way
 * to keep track of that as the product grows.
 *
 * The rule it enforces, which the caller must not have to remember: a grant is idempotent. An
 * administrator who presses Approve twice, or approves two requests for the same branch, does not
 * end up with two live grants — because "revoke it" would then take one away and leave the other,
 * which is a security hole that looks exactly like a fixed one.
 */
export async function grantBranch(opts: {
  tenantId: string;
  userId: string;
  roleId: string;
  /** The administrator, by name, so the record reads without a join. */
  grantedBy: string;
}): Promise<{ granted: boolean }> {
  const live = await db.select().from(schema.roleGrants).where(and(
    eq(schema.roleGrants.tenantId, opts.tenantId),
    eq(schema.roleGrants.userId, opts.userId),
    eq(schema.roleGrants.roleId, opts.roleId),
    isNull(schema.roleGrants.revokedAt),
  ));
  if (live.length) return { granted: false };

  await db.insert(schema.roleGrants).values({
    id: randomUUID(),
    tenantId: opts.tenantId,
    userId: opts.userId,
    roleId: opts.roleId,
    grantedBy: opts.grantedBy,
    grantedAt: new Date().toISOString(),
    revokedAt: null,
  });
  return { granted: true };
}

/**
 * Taking it back.
 *
 * Stamped rather than deleted, for the same reason a placement is closed rather than removed: "who
 * could see the Cobram scorecards in March" is a question a business will eventually have to answer,
 * and a row that has been deleted cannot answer it.
 *
 * Tenant-scoped on every clause. A grant id arriving from a form is somebody else's text until the
 * query proves otherwise, and this is the table that decides who reads whose numbers.
 */
export async function revokeGrant(tenantId: string, grantId: string): Promise<{ revoked: boolean }> {
  const done = await db.update(schema.roleGrants)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(
      eq(schema.roleGrants.id, grantId),
      eq(schema.roleGrants.tenantId, tenantId),
      isNull(schema.roleGrants.revokedAt),
    ))
    .returning({ id: schema.roleGrants.id });
  return { revoked: done.length > 0 };
}
