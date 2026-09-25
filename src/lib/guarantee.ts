import type Stripe from 'stripe';

/**
 * The Simple Guarantee, paid automatically — "if it's not simple, that month is free".
 *
 * Kris, 25 September: *"Make the Simple Guarantee AUTOMATIC: when a business logs that something
 * wasn't simple, SPEC automatically applies a credit for that month's subscription in Stripe …
 * once per business per month, records it, and tells the business in plain English."* Until then a
 * claim was logged and listed on /admin, and the month only came off the bill if somebody went into
 * Stripe and did it by hand — which the site check of the same day named as a promise nothing kept.
 *
 * ── How the month comes off ──────────────────────────────────────────────────────────────────────
 *
 * A credit on the Stripe CUSTOMER's balance (a negative balance transaction) for one month of what
 * their subscription charges. Stripe takes a customer's balance off the next invoice by itself, so
 * nothing here touches an invoice, a subscription or a price, and a credit can never turn into money
 * paid out. It is the cleanest of the two options Kris named: a coupon would have to be created,
 * attached, and then removed again before it discounted a second month.
 *
 * ── Never twice ─────────────────────────────────────────────────────────────────────────────────
 *
 * Three guards, because the promise is "once per business per month" and a double credit is money:
 *   1. `guarantee_credits` is unique on (tenant, month) — the row is claimed BEFORE Stripe is asked.
 *   2. Every create carries the idempotency key `simple-guarantee:<tenant>:<month>`, so a retry
 *      inside Stripe's idempotency window returns the first credit instead of making another.
 *   3. Before creating, the customer's own balance transactions are read for one already tagged with
 *      this month — which still holds after the idempotency window has passed, or if the row was lost.
 *
 * The Stripe client is passed in, never fetched here, so the tests drive the real Stripe library
 * against a stand-in for Stripe's API and see exactly the requests production would send.
 */

export const GUARANTEE_KIND = 'simple_guarantee';

/** Stripe's idempotency key for one business's one month. */
export const guaranteeKey = (tenantId: string, month: string): string => `simple-guarantee:${tenantId}:${month}`;

/** What a month of this subscription charges, in the currency's smallest unit. Monthly prices only. */
export function monthlyCharge(sub: Pick<Stripe.Subscription, 'currency' | 'items'>): { amount: number; currency: string } | null {
  let amount = 0;
  for (const item of sub.items?.data ?? []) {
    const price = item.price;
    if (!price?.recurring || price.recurring.interval !== 'month' || (price.recurring.interval_count ?? 1) !== 1) continue;
    amount += (price.unit_amount ?? 0) * (item.quantity ?? 1);
  }
  return amount > 0 ? { amount, currency: sub.currency } : null;
}

export type CreditResult =
  | { outcome: 'applied'; amount: number; currency: string; transactionId: string }
  | { outcome: 'already'; amount: number; currency: string; transactionId: string }
  | { outcome: 'nothing_to_credit'; reason: string };

/**
 * Put one month back on the customer's balance, unless this month is already there.
 * Throws on a Stripe failure; the caller records it and tries again next time.
 */
export async function creditInStripe(
  stripe: Stripe,
  a: { tenantId: string; month: string; customerId: string; subscriptionId: string },
): Promise<CreditResult> {
  const existing = await stripe.customers.listBalanceTransactions(a.customerId, { limit: 100 });
  const found = existing.data.find(t =>
    t.metadata?.kind === GUARANTEE_KIND && t.metadata?.month === a.month && t.metadata?.tenantId === a.tenantId);
  if (found) return { outcome: 'already', amount: -found.amount, currency: found.currency, transactionId: found.id };

  const sub = await stripe.subscriptions.retrieve(a.subscriptionId);
  const charge = monthlyCharge(sub);
  if (!charge) return { outcome: 'nothing_to_credit', reason: 'The subscription has no monthly charge to take off.' };

  const txn = await stripe.customers.createBalanceTransaction(a.customerId, {
    amount: -charge.amount,
    currency: charge.currency,
    description: `Simple Guarantee — ${a.month} on us`,
    metadata: { kind: GUARANTEE_KIND, tenantId: a.tenantId, month: a.month },
  }, { idempotencyKey: guaranteeKey(a.tenantId, a.month) });
  return { outcome: 'applied', amount: charge.amount, currency: charge.currency, transactionId: txn.id };
}

/* ── The record, and the whole claim ────────────────────────────────────────────────────────────── */

export type CreditStatus = 'pending' | 'applied' | 'free' | 'failed';

export interface CreditRow {
  tenantId: string;
  month: string;
  status: CreditStatus;
  amount: number;
  currency: string | null;
  stripeTransactionId: string | null;
  error: string | null;
}

/** Where claims are kept. Production is `guarantee_credits`; the tests use memory. */
export interface CreditStore {
  /** Claim the month. Returns false when a row for this business and month already exists. */
  claim(tenantId: string, month: string, reportedBy: string): Promise<boolean>;
  find(tenantId: string, month: string): Promise<CreditRow | null>;
  settle(tenantId: string, month: string, set: Partial<Omit<CreditRow, 'tenantId' | 'month'>>): Promise<void>;
}

export interface Billing { customerId: string | null; subscriptionId: string | null }

export type ClaimOutcome = 'applied' | 'free' | 'already' | 'failed';
export const isClaimOutcome = (v: unknown): v is ClaimOutcome =>
  v === 'applied' || v === 'free' || v === 'already' || v === 'failed';

/**
 * A business said something was not simple: take the month off, once.
 *
 * `applied` — credited now. `free` — nothing to take off (no paid subscription), recorded all the
 * same. `already` — this month was on us before. `failed` — Stripe could not be reached or refused;
 * recorded as failed, shown on /admin, and tried again the next time the business tells SPEC.
 */
export async function claimGuarantee(deps: {
  store: CreditStore;
  stripe: Stripe | null;
  billing: Billing;
  tenantId: string;
  month: string;
  reportedBy: string;
  /** /admin's "Try again": also resume a claim left pending by an interrupted request. */
  resumePending?: boolean;
}): Promise<ClaimOutcome> {
  const { store, stripe, billing, tenantId, month } = deps;
  const fresh = await store.claim(tenantId, month, deps.reportedBy);
  if (!fresh) {
    const row = await store.find(tenantId, month);
    if (row && (row.status === 'applied' || row.status === 'free')) return 'already';
    // Pending is somebody else's claim still in flight — theirs to finish, not a second one to start.
    if (row && row.status === 'pending' && !deps.resumePending) return 'already';
    // A failed claim is tried again; the Stripe guards stop it doubling.
  }

  if (!billing.customerId || !billing.subscriptionId) {
    await store.settle(tenantId, month, { status: 'free', amount: 0, error: null });
    return 'free';
  }
  if (!stripe) {
    await store.settle(tenantId, month, { status: 'failed', error: 'Billing is not configured on this deployment.' });
    return 'failed';
  }
  try {
    const r = await creditInStripe(stripe, { tenantId, month, customerId: billing.customerId, subscriptionId: billing.subscriptionId });
    if (r.outcome === 'nothing_to_credit') {
      await store.settle(tenantId, month, { status: 'free', amount: 0, error: r.reason });
      return 'free';
    }
    await store.settle(tenantId, month, {
      status: 'applied', amount: r.amount, currency: r.currency, stripeTransactionId: r.transactionId, error: null,
    });
    return r.outcome;
  } catch (e) {
    await store.settle(tenantId, month, { status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 300) });
    return 'failed';
  }
}

/** What the business is told. Plain words; the thanks is the point. */
export function guaranteeMessage(outcome: ClaimOutcome, month: string): string {
  switch (outcome) {
    case 'applied':
    case 'free':
      return 'That month’s on us — thanks for telling us.';
    case 'already':
      return `${monthName(month)} is already on us — thanks for telling us. It’s logged so it gets fixed.`;
    case 'failed':
      return `Thanks for telling us — it’s logged so it gets fixed. ${monthName(month)} is on us; the credit didn’t go through just now, and SPEC will put it on your account.`;
  }
}

/** "2026-09" → "September 2026". */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return names[m - 1] ? `${names[m - 1]} ${y}` : month;
}

/** "-13400, aud" → "A$134.00" — for the admin list. */
export function creditLabel(amount: number, currency: string | null): string {
  const cur = (currency ?? '').toUpperCase();
  const sym: Record<string, string> = { AUD: 'A$', NZD: 'NZ$', CAD: 'C$', USD: 'US$', GBP: '£', EUR: '€' };
  return `${sym[cur] ?? (cur ? cur + ' ' : '')}${(amount / 100).toFixed(2)}`;
}
