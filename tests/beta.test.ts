import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planState, costLabel, SETTABLE_PLANS, PLAN_MEANING, type TenantPlan } from '../src/lib/plan';

/*
  ── A real business, running SPEC for free while it is being proven on them ──────────────────────

  Kris: "whether we can turn off the payment for them so i can use it as a beta testing ground with
  a real business."

  The thing that makes this worth building rather than shrugging at: NOTHING BILLS TODAY. Stripe has
  never been switched on, so every business is accidentally free. A beta business is free because
  somebody DECIDED it — and the day Stripe is switched on, that decision has to still be there, or
  the first live invoice goes to the person who agreed to be the guinea pig.

  That is the whole difference between free-by-decision and free-because-the-till-is-not-plugged-in.
*/

const tenant = (plan: string): TenantPlan => ({ id: 't', plan, startDate: '2026-09-01' });

describe('a business on a free beta', () => {
  it('is not billed, however many people are in it', () => {
    const forty = planState(tenant('beta'), 40);
    expect(forty.beta).toBe(true);
    expect(forty.billing).toBe(false);
  });

  /* The ordinary case, for contrast: a business with people in it IS billed. */
  it('is the only reason a business with people in it is not billed, apart from the Program', () => {
    expect(planState(tenant('trial'), 40).billing).toBe(true);
    expect(planState(tenant('basic'), 40).billing).toBe(true);
    expect(planState(tenant('program'), 40).billing).toBe(false);
    expect(planState(tenant('beta'), 40).billing).toBe(false);
  });

  /*
    Free is not the same as worthless. A leader who cannot see what they are being given has no
    reason to be glad of it, and nobody can price the arrangement when it ends.
  */
  it('still shows what it would cost', () => {
    const state = planState(tenant('beta'), 12);
    expect(state.monthlyCost).toBeGreaterThan(0);
    const label = costLabel(state);
    expect(label).toContain('Beta');
    expect(label).toContain('free');
    expect(label, 'the figure it would be').toMatch(/\d/);
    expect(label).toContain('12 people');
  });

  it('says only "Beta — free" before anybody is in it', () => {
    expect(costLabel(planState(tenant('beta'), 0))).toBe('Beta — free');
  });

  /*
    Not reusing `program`. It means a consulting engagement with the principal on site, and putting
    "SPEC Program" on the account page of a business that is not on one is a label that is
    convenient and untrue — which is how a customer stops believing the rest of the page.
  */
  it('is not dressed up as the consulting Program', () => {
    expect(costLabel(planState(tenant('beta'), 12))).not.toContain('Program');
    expect(costLabel(planState(tenant('program'), 12))).toBe('SPEC Program');
  });

  /* A beta is free, not suspended. Everything still works. */
  it('can still write — it is free, not lapsed', () => {
    expect(planState(tenant('beta'), 12).readOnly).toBe(false);
    expect(planState(tenant('lapsed'), 12).readOnly).toBe(true);
  });
});

describe('who can put a business on one', () => {
  const action = readFileSync('src/app/admin/actions.ts', 'utf8');
  const page = readFileSync('src/app/admin/page.tsx', 'utf8');

  it('is on a screen rather than in the database', () => {
    expect(page).toContain('setPlan');
    expect(page).toContain('SETTABLE_PLANS');
  });

  /* It decides whether a customer is charged, so it is gated on the same allowlist as the cockpit. */
  it('needs an allowlisted address, checked on the server', () => {
    expect(action).toContain('isAdminEmail');
    expect(action).toContain("redirect('/signin')");
  });

  /* `plan` decides whether somebody is billed. An unrecognised string reaching that column is a
     business in a state nothing can price. */
  it('will not write a plan the product does not know', () => {
    expect(action).toContain('SETTABLE_PLANS.includes');
  });

  /*
    `lapsed` is a CONSEQUENCE — a payment failed, a subscription was cancelled — and it makes a
    business read-only. Something Stripe decides should not be assertable with a dropdown, and a
    customer locked out of their own records by a misclick is a very bad afternoon.
  */
  it('cannot be used to lock a business out of its own records', () => {
    expect(SETTABLE_PLANS).not.toContain('lapsed');
    expect(PLAN_MEANING.lapsed, 'but it is still explained where it appears').toBeTruthy();
  });

  it('says what each plan means on the screen that sets it', () => {
    for (const p of SETTABLE_PLANS) {
      expect(PLAN_MEANING[p], p).toBeTruthy();
    }
    expect(page).toContain('PLAN_MEANING');
  });
});

/*
  ── There has to be a way in ─────────────────────────────────────────────────────────────────────

  Found on 16 September, minutes before the first real payment was due to be taken.

  The journey page showed a business with seats its monthly cost and a **Billing** button. Billing
  opens Stripe's customer portal, which needs a Stripe customer, which only exists once a checkout
  has completed. A business that had never paid clicked it and was silently redirected back to the
  page it started on — no message, no other button anywhere on the site.

  `/api/stripe/checkout` existed, worked, and was reachable from exactly one place: a "Fix payment"
  button shown only when the plan is `lapsed`, a state only a failed subscription can produce.

  **So nobody could ever start paying.** Not a bug in checkout — a missing door. Every test passed,
  because every test checked the rooms rather than whether you could get into the building.
*/
describe('a business that wants to start paying can', () => {
  const withSub = (over: Partial<TenantPlan> = {}): TenantPlan =>
    ({ id: 't', plan: 'trial', startDate: '2026-09-01', ...over });

  it('is offered a way to start when it has seats and has never subscribed', () => {
    const s = planState(withSub(), 12);
    expect(s.needsCheckout, 'nothing would let them pay').toBe(true);
    expect(s.subscribed).toBe(false);
  });

  /* And once they have, the start button goes away and the portal takes over. */
  it('stops offering it once a subscription exists', () => {
    const s = planState(withSub({ plan: 'basic', stripeSubscriptionId: 'sub_123' }), 12);
    expect(s.subscribed).toBe(true);
    expect(s.needsCheckout).toBe(false);
    expect(s.billing).toBe(true);
  });

  /*
    `plan` cannot answer this and must not be asked to. A business is `basic` the moment the webhook
    lands, and also `basic` if an administrator set it by hand; `trial` is what a business with a
    perfectly good card looks like until the first payment clears. Only Stripe's own id knows.
  */
  it('asks Stripe rather than the plan column', () => {
    expect(planState(withSub({ plan: 'basic' }), 12).subscribed, 'basic by hand, never paid').toBe(false);
    expect(planState(withSub({ plan: 'trial', stripeSubscriptionId: 'sub_1' }), 12).subscribed).toBe(true);
  });

  it('never asks a business with nobody in it to pay', () => {
    expect(planState(withSub(), 0).needsCheckout).toBe(false);
  });

  it('never asks a free beta or the Program to pay', () => {
    expect(planState(withSub({ plan: 'beta' }), 12).needsCheckout).toBe(false);
    expect(planState(withSub({ plan: 'program' }), 12).needsCheckout).toBe(false);
  });

  /*
    A lapsed business already has "Fix payment", which is more urgent and goes to the same place.
    Showing both would ask somebody whose payment just failed to choose between two buttons.
  */
  it('does not offer two buttons to somebody whose payment just failed', () => {
    expect(planState(withSub({ plan: 'lapsed' }), 12).needsCheckout).toBe(false);
  });

  /* The button has to exist on the page, not just in the state. */
  it('puts the button on the page, pointing at checkout', () => {
    const page = readFileSync('src/app/billing/page.tsx', 'utf8');
    expect(page).toContain('plan.needsCheckout');
    expect(page).toContain('/api/stripe/checkout');
    expect(page).toContain('Start paying');
  });

  /* And the portal stops bouncing people back with nothing said. */
  it('tells somebody why the portal has nothing to show, instead of reloading the page', () => {
    const portal = readFileSync('src/app/api/stripe/portal/route.ts', 'utf8');
    expect(portal).toContain('no_subscription=1');
    const page = readFileSync('src/app/billing/page.tsx', 'utf8');
    expect(page).toContain('no_subscription');
    expect(page).toContain('Start paying to set one up');
  });
});
