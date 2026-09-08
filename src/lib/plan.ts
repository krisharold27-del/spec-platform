/**
 * What a business pays, and when the meter starts.
 *
 * The model is deliberately not a trial. A trial puts a clock on someone who has just admitted four
 * things are going wrong, and a clock is the last thing they need. Instead:
 *
 *   Drawing the business — every role, every reporting line, every KPI — is free, and stays free
 *   however long it takes. Nothing expires. Nothing goes read-only.
 *
 *   A seat is billed only when a real person is invited in: a name plus an email attached to a role.
 *   That is the moment SPEC starts doing work for that person, so that is the moment it costs
 *   anything. A five-person business pays for five seats no matter how large the unnamed structure
 *   around them is.
 *
 * Practically this means a leader can map their whole business, negotiate the KPIs, and see exactly
 * what the system will do — before spending a cent or entering a card.
 */

/** Per active named seat, per month, in AUD. */
export const SEAT_PRICE_MONTHLY = 26;

export interface TenantPlan {
  id: string;
  plan: string;
  startDate: string;
}

export interface PlanState {
  /** People invited in — this is what is billed. */
  seats: number;
  /** seats × the seat price. */
  monthlyCost: number;
  /** The meter has started: at least one person has been invited. */
  billing: boolean;
  /** Still free: structure only, nobody invited yet. */
  free: boolean;
  /** On the consulting engagement rather than self-serve. */
  program: boolean;
  /** A payment failed or the subscription was cancelled. */
  lapsed: boolean;
  /**
   * No writes allowed. Only ever true for a lapsed subscription — never for a business that simply
   * has not paid yet, because until they invite someone they owe nothing.
   */
  readOnly: boolean;
}

export function planState(tenant: TenantPlan, seats: number): PlanState {
  const program = tenant.plan === 'program';
  const lapsed = tenant.plan === 'lapsed';
  return {
    seats,
    monthlyCost: seats * SEAT_PRICE_MONTHLY,
    billing: seats > 0 && !program,
    free: seats === 0,
    program,
    lapsed,
    readOnly: lapsed,
  };
}

/** "$130 a month · 5 people" — the two numbers a leader actually wants to see together. */
export function costLabel(state: PlanState): string {
  if (state.program) return 'SPEC Program';
  if (state.free) return 'Free — no one invited yet';
  return `$${state.monthlyCost} a month · ${state.seats} ${state.seats === 1 ? 'person' : 'people'}`;
}

/** What inviting one more person adds, for the line shown next to an invite button. */
export function nextSeatLabel(): string {
  return `Inviting someone adds $${SEAT_PRICE_MONTHLY} a month. Roles with no one in them are always free.`;
}

/**
 * Billable seats: people who have been invited into the business. An invite is the trigger, not
 * acceptance — the seat is doing work from the moment the email goes out, and billing on acceptance
 * would let a business use the system indefinitely by never clicking the link.
 */
export async function countSeats(tenantId: string): Promise<number> {
  const { db, schema } = await import('../db');
  const { eq, and, isNotNull } = await import('drizzle-orm');
  const rows = await db.select().from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), isNotNull(schema.users.invitedAt)));
  return rows.length;
}

export async function planStateFor(tenantId: string): Promise<PlanState> {
  const { db, schema } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)))[0];
  if (!tenant) throw new Error('Business not found.');
  return planState({ id: tenant.id, plan: tenant.plan, startDate: tenant.startDate }, await countSeats(tenantId));
}

/**
 * Guard for every write path. Server actions are public endpoints, so the check belongs here and
 * not only in the UI that hides the button.
 */
export async function assertWritable(tenantId: string): Promise<void> {
  const state = await planStateFor(tenantId);
  if (state.lapsed) throw new Error('This subscription has lapsed. Renew to keep making changes — nothing has been deleted.');
}
