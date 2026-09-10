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

import { SEAT_PRICES, HOME_CURRENCY, moneyLabel, seatLabel, type Currency } from './pricing';

/** Per active named seat, per month, in the home currency (AUD). Other regions: see lib/pricing. */
export const SEAT_PRICE_MONTHLY = SEAT_PRICES[HOME_CURRENCY].seat;

export interface TenantPlan {
  id: string;
  plan: string;
  startDate: string;
}

export interface PlanState {
  /** People with a way into the business — this is what is billed. */
  seats: number;
  /** The business's own currency — prices are decided per region, never converted. */
  currency: Currency;
  /** seats × the seat price in that currency. */
  monthlyCost: number;
  /** The meter has started: at least one person can get in. */
  billing: boolean;
  /** Still free: structure only, nobody with an account yet. */
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

export function planState(tenant: TenantPlan, seats: number, currency: Currency = HOME_CURRENCY): PlanState {
  const program = tenant.plan === 'program';
  const lapsed = tenant.plan === 'lapsed';
  return {
    seats,
    currency,
    monthlyCost: seats * SEAT_PRICES[currency].seat,
    billing: seats > 0 && !program,
    free: seats === 0,
    program,
    lapsed,
    readOnly: lapsed,
  };
}

/** "A$130 a month · 5 people" — the two numbers a leader actually wants to see together. */
export function costLabel(state: PlanState): string {
  if (state.program) return 'SPEC Program';
  if (state.free) return 'Free — nobody in it yet';
  return `${moneyLabel(state.currency, state.monthlyCost)} a month · ${state.seats} ${state.seats === 1 ? 'person' : 'people'}`;
}

/** What inviting one more person adds, for the line shown next to an invite button. */
export function nextSeatLabel(currency: Currency = HOME_CURRENCY): string {
  return `Inviting someone adds ${seatLabel(currency)} a month. Roles with no one in them are always free.`;
}

/**
 * Billable seats: people who can actually get into the business.
 *
 * Counting only invitations was wrong in one important case — the leader who signs themselves up.
 * They were never invited by anyone, so they were never counted, and a one-person business showed
 * as free while using the whole system. A seat is anyone with a way in: invited, accepted, or
 * signed up directly.
 *
 * An invite counts from the moment it is sent rather than when it is accepted, because the seat is
 * doing work from that point — and billing on acceptance would let a business use SPEC indefinitely
 * by simply never clicking the link.
 */
export async function countSeats(tenantId: string): Promise<number> {
  const { db, schema } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const rows = await db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId));
  return rows.filter(u => u.invitedAt || u.acceptedAt || u.authUserId).length;
}

export async function planStateFor(tenantId: string, currency: Currency = HOME_CURRENCY): Promise<PlanState> {
  const { db, schema } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)))[0];
  if (!tenant) throw new Error('Business not found.');
  return planState({ id: tenant.id, plan: tenant.plan, startDate: tenant.startDate }, await countSeats(tenantId), currency);
}

/**
 * Guard for every write path. Server actions are public endpoints, so the check belongs here and
 * not only in the UI that hides the button.
 */
export async function assertWritable(tenantId: string): Promise<void> {
  const state = await planStateFor(tenantId);
  if (state.lapsed) throw new Error('This subscription has lapsed. Renew to keep making changes — nothing has been deleted.');
}
