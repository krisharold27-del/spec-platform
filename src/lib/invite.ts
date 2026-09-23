import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sendInviteEmail } from '@/lib/email';
import { newSeatToken, seatTokenExpiry } from '@/lib/seat';

/**
 * Giving somebody a seat in SPEC — the rule, in one place.
 *
 * ── Why this was pulled out of the Setup screen ──────────────────────────────────────────────────
 *
 * Kris, 19 September: *"i need to know how to invite new people - add their email and send to them -
 * when they click the link they come and set their password straight away - then come into the
 * system and start at their my page"*.
 *
 * All of that was already built, and `scripts/seat-journey.mjs` walks it end to end in a browser.
 * The problem was never the feature. It was that the only door to it is **Setting up → Your
 * business**, and the screen where a leader actually thinks about who works for them — the org
 * chart — had no way to invite anybody at all. A feature nobody can find is not a feature.
 *
 * So the chart gets the same button, and this is the rule both screens call. Written once
 * deliberately: an invitation creates an account, spends a seat and starts a monthly charge, and
 * two copies of that drifting apart is how somebody ends up billed for a seat that was never sent.
 *
 * ── What this does NOT do ───────────────────────────────────────────────────────────────────────
 *
 * It does not decide whether the person asking is allowed. Each screen checks that first, in its
 * own terms — on the chart that means the role has to be inside the caller's own branch, which is
 * Kris's rule that *"only managers can change staff in their business unit"*. Nor does it redirect
 * or revalidate: those are the screen's business, and a library that redirects is a library that
 * decides where somebody ends up.
 */

export type InviteOutcome =
  /** Account made, seat spent, mail away. */
  | { ok: true; sent: true; email: string; name: string }
  /**
   * Everything is real — the account, the token, the seat — but the mail did not leave. The leader
   * has to be told, because reporting "invited" for an email that never went, on a seat that has
   * started being charged, is the version of this that costs somebody a week.
   */
  | { ok: true; sent: false; email: string; name: string }
  | { ok: false; reason: 'no-email' | 'not-placed' | 'already-has-an-account' | 'no-business' };

/**
 * @param staffId   the person, as they already exist on the chart
 * @param email     where the invitation goes
 * @param seatKind  an administrator's explicit choice of which seat this person is billed on —
 *                  'leadership' | 'team' | null. Null (the default) leaves billing reading the
 *                  chart live, exactly as it always has — see `resolveSeatKind` in lib/chart-seats.
 *                  Anybody who is not an administrator has this ignored by the caller before it
 *                  reaches here; this function stores whatever it is handed.
 */
export async function inviteToSeat(
  tenantId: string,
  staffId: string,
  emailRaw: string,
  seatKind: 'leadership' | 'team' | null = null,
): Promise<InviteOutcome> {
  const email = emailRaw.trim().toLowerCase();
  if (!staffId || !email || !email.includes('@')) return { ok: false, reason: 'no-email' };

  const [person] = await db.select().from(schema.staff)
    .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenantId)));
  if (!person) return { ok: false, reason: 'not-placed' };
  if (person.userId) return { ok: false, reason: 'already-has-an-account' };

  const [assignment] = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.staffId, staffId), isNull(schema.roleAssignments.toDate)));
  if (!assignment) return { ok: false, reason: 'not-placed' };

  const [role] = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.id, assignment.roleId), eq(schema.roles.tenantId, tenantId)));
  if (!role) return { ok: false, reason: 'not-placed' };

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) return { ok: false, reason: 'no-business' };

  const now = new Date().toISOString();

  // Reuse an account on this address rather than making a second one for the same person.
  const [existing] = await db.select().from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email)));

  const userId = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(schema.users).values({
      id: userId, tenantId, email, name: person.name,
      access: role.defaultAccess, authUserId: null, invitedAt: now, acceptedAt: null,
      seatKindOverride: seatKind,
    });
  } else if (!existing.invitedAt) {
    await db.update(schema.users).set({ invitedAt: now, seatKindOverride: seatKind ?? existing.seatKindOverride })
      .where(eq(schema.users.id, userId));
  }

  await db.update(schema.staff).set({ userId }).where(eq(schema.staff.id, staffId));

  // Every open placement for this person becomes a live one — somebody holding two roles is
  // invited once, not twice.
  await db.update(schema.roleAssignments).set({ userId })
    .where(and(eq(schema.roleAssignments.staffId, staffId), isNull(schema.roleAssignments.toDate)));

  /*
    A seat has just started being charged — push it onto Stripe now rather than waiting for
    somebody to notice the invoice is short. Best-effort: see the note on `syncSubscriptionSeats`
    in lib/plan.
  */
  const { syncSubscriptionSeats } = await import('./plan');
  await syncSubscriptionSeats(tenantId);

  // Already invited before: their existing link is the one that works. Nothing more to send.
  if (existing?.invitedAt) return { ok: true, sent: true, email, name: person.name };

  // A fresh token per invitation: single use, expiring, bound to this address. See lib/seat.
  const token = newSeatToken();
  await db.update(schema.users)
    .set({ seatToken: token, seatTokenExpires: seatTokenExpiry() })
    .where(eq(schema.users.id, userId));

  /*
    What they are actually joining, said plainly in the email — Kris: *"they see they are joining a
    leadership or team member seat."* The override just stored wins if there is one; otherwise this
    reads the chart, the same as billing does — `resolveSeatKind` is the one place that decides.
  */
  const { resolveSeatKind } = await import('./chart-seats');
  const led = await db.select({ reportsTo: schema.roles.reportsToRoleId })
    .from(schema.roles)
    // Active roles only — a removed role keeps its reporting line but leads nobody (see classifySeats).
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.reportsToRoleId, role.id), eq(schema.roles.active, true)));
  const billedAs = resolveSeatKind({ title: role.title, hasDirectReports: led.length > 0 }, seatKind);

  try {
    await sendInviteEmail({
      to: email, name: person.name, businessName: tenant.name, roleTitle: role.title, token, seatKind: billedAs,
    });
  } catch {
    return { ok: true, sent: false, email, name: person.name };
  }

  return { ok: true, sent: true, email, name: person.name };
}
