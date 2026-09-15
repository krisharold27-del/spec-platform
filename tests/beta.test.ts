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
