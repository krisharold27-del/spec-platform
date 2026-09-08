/**
 * Trial and payment state.
 *
 * A business gets the whole system free for three days — including opening a period and scoring it —
 * so they can try it properly without a card and without a payment problem landing on top of the
 * problems they already have. After three days the business goes read-only until they subscribe.
 * Nothing is ever deleted.
 *
 * The trial window is derived from tenants.startDate rather than stored separately, so there is one
 * source of truth and no migration to keep in step.
 */

export const TRIAL_DAYS = 3;

export interface TenantPlan {
  id: string;
  plan: string;
  startDate: string;
}

export interface PlanState {
  /** Paying customer — self-serve Basic or a full Program. */
  paid: boolean;
  /** Inside the free trial window. */
  onTrial: boolean;
  /** Trial ran out and they haven't subscribed. */
  trialExpired: boolean;
  /** Whole days remaining in the trial (0 once it has run out). */
  daysLeft: number;
  /** Subscription lapsed after having been paid. */
  lapsed: boolean;
  /** No writes allowed anywhere in this business. */
  readOnly: boolean;
}

export function planState(tenant: TenantPlan, at: Date = new Date()): PlanState {
  const paid = tenant.plan === 'basic' || tenant.plan === 'program';
  const lapsed = tenant.plan === 'lapsed';

  const started = new Date(tenant.startDate).getTime();
  const endsAt = started + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const msLeft = endsAt - at.getTime();

  const onTrial = !paid && !lapsed && msLeft > 0;
  const trialExpired = !paid && !lapsed && msLeft <= 0;

  return {
    paid,
    onTrial,
    trialExpired,
    daysLeft: onTrial ? Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000))) : 0,
    lapsed,
    readOnly: lapsed || trialExpired,
  };
}

/** Human phrasing for the trial countdown — "3 days left", "1 day left". */
export function trialLabel(state: PlanState): string {
  if (!state.onTrial) return '';
  return state.daysLeft === 1 ? '1 day left' : `${state.daysLeft} days left`;
}

/**
 * Guard for every write path. Server actions are public endpoints, so the check belongs here and
 * not only in the UI that hides the button.
 */
export async function assertWritable(tenantId: string): Promise<void> {
  const { db, schema } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const rows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const tenant = rows[0];
  if (!tenant) throw new Error('Business not found.');
  const state = planState({ id: tenant.id, plan: tenant.plan, startDate: tenant.startDate });
  if (state.trialExpired) throw new Error('Your free trial has ended. Subscribe to keep making changes — nothing has been deleted.');
  if (state.lapsed) throw new Error('This subscription has lapsed. Renew to keep making changes — nothing has been deleted.');
}
