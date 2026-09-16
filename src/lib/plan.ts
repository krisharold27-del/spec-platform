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

/**
 * The two ways to run SPEC, decided by one question to the leader — "do you want the power of AI?"
 *
 *   basic    — no connectors, no assistant. Every number is typed in and confirmed by a name.
 *   advanced — systems feed the KPIs, every figure traces to where it came from, and Claude is
 *              available on every page. AI usage is paid for through SPEC.
 *
 * Basic is a complete way to run the whole system, not a crippled one: no feature anywhere is
 * reachable only by connecting something. The difference is where the numbers come from, and
 * whether there is anything to ask.
 */
export type Tier = 'basic' | 'advanced';

export const TIER: Record<Tier, { label: string; blurb: string; consequence: string }> = {
  basic: {
    label: 'SPEC Basic',
    blurb: 'No connectors, no assistant. Every number typed in and confirmed by a named person.',
    consequence: 'Everything still works. You enter each month’s results yourself, and every figure carries the name of whoever confirmed it.',
  },
  advanced: {
    label: 'SPEC Advanced',
    blurb: 'Systems feed the KPIs, every figure is traceable, and Claude is on every page.',
    consequence: 'Numbers arrive on their own from the systems you already run, and you can ask about any of them. AI usage is paid for through SPEC.',
  },
};

export const tierOf = (value: string | null | undefined): Tier => (value === 'advanced' ? 'advanced' : 'basic');

/** Connectors and the assistant are the two things the tier actually gates. Nothing else. */
export const hasConnectors = (tier: Tier) => tier === 'advanced';
export const hasAssistant = (tier: Tier) => tier === 'advanced';

/**
 * Whether a problem gets READ for them — a different question from whether they can log one.
 *
 * Basic is "the platform with no AI support, every number typed by hand", so having Claude work out
 * the causal chain is exactly the thing Basic is defined as not including. But the register itself
 * is not AI: logging a problem, ranking it, giving it an owner, accepting it, signing it off — that
 * is the method, and the method is what a business bought.
 *
 * So Basic gets the whole register and names its own pillars. The difference between the tiers is
 * who does the thinking, never whether the feature exists — the same line the product draws
 * everywhere else, where a business that connects nothing still gets all of it, with more typing.
 */
export const hasDiagnosis = (tier: Tier) => tier === 'advanced';

/**
 * The plans a person can put a business on from /admin.
 *
 * `lapsed` is not here on purpose: it is a CONSEQUENCE — a payment failed or a subscription was
 * cancelled — and it makes a business read-only. Something Stripe decides is not something a button
 * should be able to assert, and a business locked out of its own records by a misclick is a very
 * bad afternoon.
 */
export const SETTABLE_PLANS = ['trial', 'beta', 'basic', 'program'] as const;
export type SettablePlan = (typeof SETTABLE_PLANS)[number];

/** What each one means, in the words the admin screen shows. */
export const PLAN_MEANING: Record<string, string> = {
  trial: 'Free until somebody is invited, then billed per seat.',
  beta: 'Free, by agreement. Nothing is billed however many people are in it.',
  basic: 'Billed per seat, self-serve.',
  program: 'On the consulting engagement — principal on site.',
  lapsed: 'A payment failed or the subscription was cancelled. Read-only.',
};

export interface TenantPlan {
  id: string;
  plan: string;
  startDate: string;
  tier?: string;
  /**
   * Set the first time a checkout completes, and the only reliable sign that a subscription exists.
   *
   * The plan column cannot answer this. A business is `basic` the moment the webhook lands, but it
   * is also `basic` if an administrator set it there by hand, and `trial` is what a business with a
   * perfectly good card looks like right up until the first payment. Only Stripe's own id says
   * whether Stripe has ever heard of them.
   */
  stripeSubscriptionId?: string | null;
}

export interface PlanState {
  /** People with a way into the business. The truth about the business, not the invoice. */
  seats: number;
  /** How many of them are charged for: everyone after the first. See FREE_SEATS. */
  billable: number;
  /** The business's own currency — prices are decided per region, never converted. */
  currency: Currency;
  /** billable seats × the seat price in that currency — NOT every person in the business. */
  monthlyCost: number;
  /** The meter has started: somebody beyond the first person can get in. */
  billing: boolean;
  /** Nothing to pay — an empty business, or one that is still just the person who started it. */
  free: boolean;
  /** On the consulting engagement rather than self-serve. */
  program: boolean;
  /**
   * A real business running SPEC for free while it is being proven on them.
   *
   * Deliberately its own value rather than reusing `program`, which means something specific — a
   * consulting engagement with the principal on site — and would have put "SPEC Program" on the
   * account page of a business that is not on one. A label that is convenient and untrue is how a
   * customer stops believing the rest of the page.
   *
   * It matters more than it looks, because nothing bills today: Stripe has never been switched on,
   * so every business is accidentally free. The day it IS switched on, a beta business would start
   * being charged without anybody deciding to. This is the difference between a business that is
   * free because somebody said so and one that is free because the till is not plugged in.
   */
  beta: boolean;
  /** A payment failed or the subscription was cancelled. */
  lapsed: boolean;
  /**
   * Has this business ever actually subscribed?
   *
   * ── The gap this was written for ─────────────────────────────────────────────────────────────
   *
   * Found 16 September, minutes before the first real payment. The journey page showed a business
   * with seats its monthly cost and a **Billing** button — which opens Stripe's customer portal.
   * The portal needs a Stripe customer, which only exists once a checkout has completed. So a
   * business that had never paid clicked Billing and was silently redirected back to the page it
   * started on, with no message and no other button anywhere.
   *
   * The checkout route existed, worked, and was reachable from exactly one place: a "Fix payment"
   * button shown only when the plan is `lapsed` — a state only a failed subscription can produce.
   *
   * **So there was no way for anybody to start paying.** Not a bug in checkout; a missing door.
   * Every test passed, because every test tested the rooms rather than whether you could get in.
   */
  subscribed: boolean;
  /** Seats to bill, no subscription yet — the state that needs a Start paying button. */
  needsCheckout: boolean;
  /**
   * No writes allowed. Only ever true for a lapsed subscription — never for a business that simply
   * has not paid yet, because until they invite someone they owe nothing.
   */
  readOnly: boolean;
  /** basic or advanced — whether connectors and the assistant are part of this business's SPEC. */
  tier: Tier;
  connectors: boolean;
  assistant: boolean;
}

/**
 * The first seat is free. Billing starts at the second person.
 *
 * ── The decision, and what it reverses ───────────────────────────────────────────────────────────
 *
 * Kris, 16 September: *"yes do the first seat free"*.
 *
 * It settles a contradiction he spotted the day the first payment went through. This file has always
 * said billing starts when somebody is INVITED — and the leader who signs themselves up was never
 * invited by anybody. But `countSeats` counts a way in, not an invitation, and the owner has one. So
 * a business of one was being charged A$26 while the page promised it was free, and both statements
 * were sitting in the same product.
 *
 * `countSeats` is not what changes. An earlier fix deliberately made it count the owner, because a
 * one-person business used to show as free while using the whole system, and a number that is wrong
 * is worse than a number that is generous. `seats` stays the truth — how many people can get in —
 * and this is a separate question: how many of them are charged for.
 *
 * Why it is also the better arrangement, not just the kinder one:
 *
 *   One person alone gets the least out of SPEC. It is a system about roles reporting to each other,
 *   and charging the most per head at the point of least value is backwards.
 *
 *   It moves the first payment to the moment SPEC starts doing work for more than one person, which
 *   is the moment a leader can see what they are paying for.
 *
 *   It costs one seat per business — about 4% at twenty thousand seats, and A$26 of A$1,040 for a
 *   business the size of JBI. The whole of that cost lands on the smallest accounts, which are the
 *   ones least likely to have paid at all.
 *
 * The seat PRICE does not move, so the rule of 8 is untouched.
 */
export const FREE_SEATS = 1;

/** How many of the people in a business are actually charged for. Never negative. */
export const billableSeats = (seats: number) => Math.max(0, seats - FREE_SEATS);

export function planState(tenant: TenantPlan, seats: number, currency: Currency = HOME_CURRENCY): PlanState {
  const program = tenant.plan === 'program';
  const beta = tenant.plan === 'beta';
  const lapsed = tenant.plan === 'lapsed';
  const subscribed = Boolean(tenant.stripeSubscriptionId);
  const tier = tierOf(tenant.tier);
  const billable = billableSeats(seats);
  return {
    seats,
    billable,
    currency,
    // What it WOULD cost, kept even on a beta. A free arrangement somebody cannot see the value of
    // is one they have no reason to be glad of, and one nobody can price when it ends.
    monthlyCost: billable * SEAT_PRICES[currency].seat,
    billing: billable > 0 && !program && !beta,
    free: billable === 0,
    program,
    beta,
    lapsed,
    subscribed,
    /*
      A card is needed and Stripe has never heard of them. Excludes `lapsed` on purpose: that state
      already has its own, more urgent button, and showing both would ask somebody whose payment
      just failed to choose between "Fix payment" and "Start paying".
    */
    needsCheckout: billable > 0 && !program && !beta && !subscribed && !lapsed,
    readOnly: lapsed,
    tier,
    connectors: hasConnectors(tier),
    assistant: hasAssistant(tier),
  };
}

/** "A$130 a month · 5 people" — the two numbers a leader actually wants to see together. */
export function costLabel(state: PlanState): string {
  if (state.program) return 'SPEC Program';
  // The figure stays visible on a beta. "Free" on its own tells somebody nothing about what they
  // are being given, and leaves nothing to price when the arrangement ends.
  if (state.beta) {
    return state.seats > 0
      ? `Beta — free. ${moneyLabel(state.currency, state.monthlyCost)} a month once it ends · ${state.seats} ${state.seats === 1 ? 'person' : 'people'}`
      : 'Beta — free';
  }
  /*
    Two different kinds of free, and saying the wrong one is how a leader stops believing the page.

    An empty business has nobody in it. A business of one has somebody in it and still pays nothing,
    because the first seat is free — and being told "nobody in it yet" while you are plainly in it is
    the sort of small wrongness that makes everything beside it suspect.
  */
  if (state.seats === 0) return 'Free — nobody in it yet';
  if (state.free) return `Free — the first seat is, and so far it is just you. ${seatLabel(state.currency)} a month for each person you add`;
  const people = `${state.seats} ${state.seats === 1 ? 'person' : 'people'}`;
  return `${moneyLabel(state.currency, state.monthlyCost)} a month · ${people}, first seat free`;
}

/**
 * What inviting one more person adds, for the line shown next to an invite button.
 *
 * It takes the seat count because the answer genuinely differs: the first person into a business
 * costs nothing, and telling them otherwise would be asking for money that is not owed.
 */
export function nextSeatLabel(currency: Currency = HOME_CURRENCY, seats = 2): string {
  if (billableSeats(seats + 1) === 0) {
    return 'The first seat is free. Roles with no one in them are always free too.';
  }
  return `Inviting someone adds ${seatLabel(currency)} a month — the first seat is free. Roles with no one in them are always free.`;
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
  return planState({
    id: tenant.id, plan: tenant.plan, startDate: tenant.startDate, tier: tenant.tier,
    // Without this the page cannot tell a business that has paid from one that never could, which
    // is exactly the gap that left the product with no way to start a subscription at all.
    stripeSubscriptionId: tenant.stripeSubscriptionId,
  }, await countSeats(tenantId), currency);
}

/**
 * Is this business read-only because a payment failed?
 *
 * One column of one row. The Shell asks it on every page to put the banner up, and that is a lot of
 * pages, so it deliberately does not go through planStateFor — which also counts seats and works out
 * a price, none of which a banner needs.
 */
export async function isLapsed(tenantId: string): Promise<boolean> {
  const { db, schema } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const row = (await db.select({ plan: schema.tenants.plan }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)))[0];
  return row?.plan === 'lapsed';
}

/**
 * The two reasons SPEC ever refuses to save something. Neither is a fault.
 *
 *   look   — a visitor walking through. Nothing they type was ever going to be kept.
 *   lapsed — a payment failed or a subscription was cancelled. Nothing has been deleted.
 */
export type WriteRefusal = 'look' | 'lapsed';

export const REFUSAL: Record<WriteRefusal, string> = {
  look: 'This is a look around, so nothing is saved. Set up your own business to keep what you change — it takes about a minute.',
  lapsed: 'That change was not saved, because the business is read-only until the payment is sorted. Nothing has been deleted, and everything comes back the moment it is.',
};

/**
 * Send them back to the page they were on, with the reason, instead of throwing.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * Refusing used to throw. Every write in SPEC goes through a server action, and an uncaught error in
 * a server action is rendered by Next as the generic failure page: **"This page did not load —
 * Something went wrong on our end, not yours"**, with a reference ID.
 *
 * So the refusal was correct — the write really was blocked — and the sentence the customer read was
 * a lie in both halves. It was not on our end, and nothing went wrong. Somebody whose card had just
 * expired was told SPEC was broken, on the one screen where they most need to be told the opposite:
 * that their work is safe and this is fixable in two minutes.
 *
 * Kris found it on 16 September, on the throwaway business, minutes after cancelling the test
 * subscription — reference ID 1007727349. The visitor path had exactly the same fault and nobody had
 * ever hit it, because no check had ever tried to write while looking around.
 *
 * The referer is where a form was posted from, and it is written by the browser, so it is checked
 * against our own domain before it is used (see lib/origin — same reasoning, same week). Only the
 * path is kept: anything else could point a person's next step at a website we do not own.
 */
export async function refuseWrite(why: WriteRefusal): Promise<never> {
  let back: string | null = null;
  try {
    const [{ headers }, { isOurs }] = await Promise.all([import('next/headers'), import('./origin')]);
    const referer = (await headers()).get('referer');
    let path = '/my-page';
    if (referer) {
      try {
        const from = new URL(referer);
        // The old query string is dropped on purpose: it stops `?readonly=` stacking up on itself,
        // and a stale parameter reappearing beside this message would be its own small confusion.
        if (isOurs(from.host)) path = from.pathname;
      } catch { /* not an address — keep the default */ }
    }
    back = `${path}?readonly=${why}`;
  } catch {
    /*
      No request to read: a seeding script, or a test calling this directly. There is nowhere to send
      anybody, so the old behaviour stands — and outside a browser an exception is the right answer.
    */
  }
  if (back) {
    // Outside the try. redirect() works by throwing, and catching that would turn a redirect into
    // the exception it exists to replace.
    const { redirect } = await import('next/navigation');
    redirect(back);
  }
  throw new Error(REFUSAL[why]);
}

/**
 * Guard for every write path. Server actions are public endpoints, so the check belongs here and
 * not only in the UI that hides the button.
 */
export async function assertWritable(tenantId: string): Promise<void> {
  /*
    A look-around is read-only, and this is the single place that has to hold.

    Every write in the product already comes through here, so putting the check anywhere else would
    be putting it in the wrong place. Walking through a house does not include moving the furniture
    — and read-only is also what guarantees a visitor can never send an email, invite anybody, or
    reach anything that bills.
  */
  const { isLookTenant } = await import('./look');
  if (await isLookTenant(tenantId)) await refuseWrite('look');

  const state = await planStateFor(tenantId);
  if (state.lapsed) await refuseWrite('lapsed');
}
