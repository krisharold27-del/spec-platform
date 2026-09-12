/**
 * The look around: a real business to walk through, before anybody is asked for anything.
 *
 * You do not pay for a house before seeing inside it. A visitor gets an actual tenant with an org
 * chart, the four questions and a month part-marked — not a video, not a screenshot — and they can
 * move around it exactly as a customer would. Signing up comes after they have seen it, and it
 * KEEPS what they were looking at rather than starting them over.
 *
 * ── How it is kept safe ─────────────────────────────────────────────────────────────────────────
 *
 * The only thing the browser holds is a 256-bit random token that exists nowhere but this tenant's
 * own row. It is not a claim about who somebody is and it cannot be pointed at another business:
 * the lookup is "find the tenant whose secret is exactly this", so a forged value matches nothing.
 *
 * The token is cleared the moment a real person claims the business at sign-up. That is what stops
 * an old browser from still reaching a business once it belongs to a paying customer — the one
 * failure that would matter, and it is closed by deletion rather than by a check somebody has to
 * remember to write.
 *
 * A visitor is READ-ONLY, enforced in lib/plan.assertWritable, which every write already goes
 * through. Walking through a house does not include moving the furniture, and read-only means a
 * visitor can never send an email, invite anybody, or be billed.
 */
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db';

export const LOOK_COOKIE = 'spec_look';

/** Long enough that guessing is not a strategy. */
const newToken = () => randomBytes(32).toString('base64url');

/** A fortnight is longer than anybody browses and short enough that abandoned ones age out. */
const LOOK_DAYS = 14;

export interface Look {
  tenantId: string;
  name: string;
}

/**
 * The business the visitor is currently walking through, or null.
 *
 * `isNotNull(lookId)` is belt and braces on top of matching the token itself: a claimed tenant has
 * no token, so it can never be reached this way even if an old one is replayed.
 */
export async function currentLook(): Promise<Look | null> {
  const token = (await cookies()).get(LOOK_COOKIE)?.value?.trim();
  if (!token) return null;

  const rows = await db
    .select({ id: schema.tenants.id, name: schema.tenants.name })
    .from(schema.tenants)
    .where(and(eq(schema.tenants.lookId, token), isNotNull(schema.tenants.lookId)));

  const row = rows[0];
  return row ? { tenantId: row.id, name: row.name } : null;
}

/**
 * The seat a visitor sits in: the top role of the example business.
 *
 * A visitor who holds no role at all gets bounced off Today to the journey, which is the screen for
 * a business still being built — the opposite of what somebody came to see. Putting them in the
 * General Manager's chair means every page has something real to show them, which is the entire
 * point of letting them in.
 */
export async function lookSeat(tenantId: string): Promise<{ id: string; name: string; email: string } | null> {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .innerJoin(schema.roleAssignments, eq(schema.roleAssignments.userId, schema.users.id))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.roleAssignments.roleId))
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.roles.level, 'gm')));
  return rows[0] ?? null;
}

/** Whether this tenant is still an unclaimed look-around — the read-only test used by writes. */
export async function isLookTenant(tenantId: string): Promise<boolean> {
  const rows = await db
    .select({ lookId: schema.tenants.lookId })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  return Boolean(rows[0]?.lookId);
}

/** Mint a token for a freshly built look-around and put it in the visitor's browser. */
export async function beginLook(tenantId: string): Promise<void> {
  const token = newToken();
  await db.update(schema.tenants).set({ lookId: token }).where(eq(schema.tenants.id, tenantId));
  (await cookies()).set(LOOK_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOOK_DAYS * 24 * 60 * 60,
  });
}

/**
 * Hand the business to the person who just signed up, and take away the visitor's key.
 *
 * Clearing `lookId` is the security-relevant half: from this moment the tenant can only be reached
 * by somebody holding a seat in it. Renaming is the half that makes signing up feel like keeping
 * what you were already looking at rather than starting again.
 */
export async function claimLook(tenantId: string, businessName: string): Promise<void> {
  await db
    .update(schema.tenants)
    .set({ lookId: null, name: businessName, startDate: new Date().toISOString() })
    .where(eq(schema.tenants.id, tenantId));
  (await cookies()).delete(LOOK_COOKIE);
}

/** Give up on a look-around without claiming it. The tenant is left to be swept up later. */
export async function endLook(): Promise<void> {
  (await cookies()).delete(LOOK_COOKIE);
}
