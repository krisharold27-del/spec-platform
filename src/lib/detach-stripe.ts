/**
 * Taking the Stripe marks off a business, so it can then be deleted.
 *
 * Kris, 17 September: *"yes build the admin control to clear hall contracting"*.
 *
 * ── What this is, and what it deliberately is not ────────────────────────────────────────────────
 *
 * `deleteBusiness` refuses outright for any business Stripe has ever heard of. That is the strongest
 * guard SPEC has, and it is strong on purpose: the other guards protect against a slip, and this one
 * protects against being WRONG ABOUT WHAT A BUSINESS IS. A test business and a paying customer look
 * identical in a list.
 *
 * So this is not a way past that guard. It is a separate, smaller act — remove the Stripe marks —
 * after which the ordinary delete applies with every one of its guards intact. Two deliberate
 * actions, each with its own typed confirmation, rather than one button that does both.
 *
 * ── It asks Stripe. It does not take anybody's word ──────────────────────────────────────────────
 *
 * The obvious implementation is a button that nulls two columns, and it would have cleared Hall
 * Contracting in an afternoon. It would also be a hole exactly the shape of the guard: whoever
 * presses it is asserting "this was only a test", which is the assertion the guard exists because
 * people get wrong.
 *
 * So the question "is this real money?" is put to Stripe, and the answer decides. Four facts settle
 * it, and `mayDetach` below is the whole rule:
 *
 *   Which mode SPEC's own key is in — test or live.
 *   Whether Stripe can find the customer at all.
 *   Whether any subscription on it is still running.
 *   Whether any invoice has ever actually been paid IN LIVE MODE.
 *
 * ── The one that is easy to get backwards ────────────────────────────────────────────────────────
 *
 * "Stripe cannot find it, so it is safe" is wrong, and dangerously so. A test-mode key cannot see
 * live customers either — so against test keys, "not found" is how a REAL paying customer looks.
 *
 * Not-found only means safe when SPEC is holding a LIVE key, because then the search covered the
 * only place real money can be. Held the other way round it is the worst mistake this file could
 * make, so it is a named refusal with its own sentence rather than a branch somebody has to spot.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { getStripe } from './stripe';

/** What Stripe says. Gathered by `stripeFactsFor`, decided by `mayDetach`. */
export interface StripeFacts {
  /** Which mode SPEC's own key is in. `null` when there is no key at all. */
  mode: 'live' | 'test' | null;
  /** Could Stripe find the customer or subscription this business has stored? */
  found: boolean;
  /** Statuses of every subscription on that customer, as Stripe reports them. */
  subscriptions: string[];
  /** Has any invoice ever been paid in LIVE mode? Test-mode payments are not money. */
  paidLive: boolean;
  /** Stripe could not be reached or answered with an error. Not knowing is never a yes. */
  unreachable?: boolean;
}

export type DetachRefusal =
  | 'no_marks'
  | 'not_configured'
  | 'unreachable'
  | 'still_subscribed'
  | 'has_really_paid'
  | 'cannot_see_live'
  | 'name_mismatch'
  | 'own_business'
  | 'not_found';

/**
 * A subscription in any of these states is a live commercial relationship, whatever anybody in the
 * room believes. `canceled` and `incomplete_expired` are the two that are genuinely over.
 */
const RUNNING = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];

/**
 * May the Stripe marks come off? Pure, so every combination can be tested without a Stripe account.
 *
 * Written as a list of reasons to say no, and a single way to say yes. That ordering is deliberate:
 * a function shaped "return true unless…" grows a hole every time somebody adds a case and forgets
 * one, and this is not a function that may grow holes.
 */
export function mayDetach(facts: StripeFacts): { ok: true } | { ok: false; refusal: DetachRefusal } {
  if (facts.mode === null) return { ok: false, refusal: 'not_configured' };
  if (facts.unreachable) return { ok: false, refusal: 'unreachable' };

  // Money that actually changed hands. Nothing else in this function outranks it.
  if (facts.paidLive) return { ok: false, refusal: 'has_really_paid' };

  // A running subscription is a customer, whatever the row is called.
  if (facts.subscriptions.some(s => RUNNING.includes(s))) return { ok: false, refusal: 'still_subscribed' };

  /*
    Not found, on a TEST key, is exactly what a real live customer looks like — the key cannot see
    live objects at all. Refusing here is the point of the whole file.
  */
  if (!facts.found && facts.mode === 'test') return { ok: false, refusal: 'cannot_see_live' };

  return { ok: true };
}

/** What each refusal means, in the words the screen shows. */
export const DETACH_SAID: Record<DetachRefusal, string> = {
  no_marks: 'That business has never been through Stripe, so there is nothing to take off. It can be deleted as it is.',
  not_configured:
    'Stripe is not set up on this deployment, so there is no way to check whether this is a real customer. '
    + 'Nothing was changed.',
  unreachable:
    'Stripe did not answer, so SPEC cannot tell whether this is a real customer. Nothing was changed — '
    + 'try again in a minute.',
  still_subscribed:
    'Stripe says this business still has a running subscription. Cancel it in Stripe first, and say so '
    + 'out loud to somebody. Nothing was changed.',
  has_really_paid:
    'This business has actually paid — Stripe has a settled invoice against it in live mode. That is a real '
    + 'customer and its records stay. Nothing was changed.',
  cannot_see_live:
    'SPEC is holding a TEST Stripe key, and a test key cannot see live customers — so "no such customer" '
    + 'here would also be what a real paying customer looks like. Refused on purpose. Try again once the '
    + 'live key is in.',
  name_mismatch: 'The name did not match, so nothing was changed. It has to be typed exactly.',
  own_business: 'That is the business you are signed into. Switch to another one first.',
  not_found: 'That business is not there — it may already have been deleted.',
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   Asking Stripe, and doing it.
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

export interface Marks {
  id: string;
  name: string;
  customerId: string | null;
  subscriptionId: string | null;
}

/** The two columns that make `deleteBusiness` refuse, and the name it will ask to have typed. */
export async function marksOn(tenantId: string): Promise<Marks | null> {
  const [t] = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      customerId: schema.tenants.stripeCustomerId,
      subscriptionId: schema.tenants.stripeSubscriptionId,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  return t ?? null;
}

/**
 * Put the question to Stripe.
 *
 * Every failure answers `unreachable` rather than guessing. Not knowing whether somebody is a
 * paying customer is not a reason to carry on — it is the one situation where carrying on is
 * indefensible.
 */
export async function stripeFactsFor(marks: Marks): Promise<StripeFacts> {
  const stripe = getStripe();
  if (!stripe) return { mode: null, found: false, subscriptions: [], paidLive: false };

  // The key says which mode SPEC is in, and the mode decides what "not found" is allowed to mean.
  const mode: 'live' | 'test' = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'live' : 'test';

  try {
    let found = false;
    const subscriptions: string[] = [];
    let paidLive = false;

    if (marks.customerId) {
      const customer = await stripe.customers.retrieve(marks.customerId).catch(err => {
        // A customer Stripe has no record of is the ordinary case here, and is not a failure.
        if ((err as { code?: string })?.code === 'resource_missing') return null;
        throw err;
      });
      if (customer && !(customer as { deleted?: boolean }).deleted) {
        found = true;
        const subs = await stripe.subscriptions.list({ customer: marks.customerId, status: 'all', limit: 100 });
        subscriptions.push(...subs.data.map(s => s.status));
        /*
          Settled invoices only, and only in live mode. A test-mode invoice marked paid is not money
          and never was; treating it as money is what would have kept Hall Contracting for ever.
        */
        const invoices = await stripe.invoices.list({ customer: marks.customerId, status: 'paid', limit: 100 });
        paidLive = invoices.data.some(i => i.livemode && (i.amount_paid ?? 0) > 0);
      }
    }

    // A subscription id with no customer id, or a customer Stripe has forgotten: ask directly.
    if (!found && marks.subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(marks.subscriptionId).catch(err => {
        if ((err as { code?: string })?.code === 'resource_missing') return null;
        throw err;
      });
      if (sub) {
        found = true;
        subscriptions.push(sub.status);
      }
    }

    return { mode, found, subscriptions, paidLive };
  } catch (err) {
    console.error('[detach] Stripe did not answer:', err);
    return { mode, found: false, subscriptions: [], paidLive: false, unreachable: true };
  }
}

export type DetachOutcome =
  | { ok: true; name: string; facts: StripeFacts }
  | { ok: false; refusal: DetachRefusal };

/**
 * Take the Stripe marks off, having asked Stripe first.
 *
 * The name must be typed exactly, as with the delete — because this is the act that makes the
 * delete possible, and a control that is one press away from removing a business's records should
 * cost the same as removing them.
 */
export async function detachFromStripe(
  tenantId: string,
  typedName: string,
  signedIntoTenantId: string,
): Promise<DetachOutcome> {
  const marks = await marksOn(tenantId);
  if (!marks) return { ok: false, refusal: 'not_found' };
  if (marks.name.trim() !== typedName.trim()) return { ok: false, refusal: 'name_mismatch' };
  if (tenantId === signedIntoTenantId) return { ok: false, refusal: 'own_business' };
  if (!marks.customerId && !marks.subscriptionId) return { ok: false, refusal: 'no_marks' };

  const facts = await stripeFactsFor(marks);
  const verdict = mayDetach(facts);
  if (!verdict.ok) return verdict;

  await db
    .update(schema.tenants)
    .set({ stripeCustomerId: null, stripeSubscriptionId: null })
    .where(eq(schema.tenants.id, tenantId));

  return { ok: true, name: marks.name, facts };
}
