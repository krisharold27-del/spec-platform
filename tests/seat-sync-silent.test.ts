import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifySeats, syncSubscriptionSeats, checkSubscription, compareSubscription, forgetSeenSubscription,
  planState, seatBill, reconcileSubscriptionItems, type SeatChart, type SeatSyncDeps, type SeatSyncStripe,
} from '../src/lib/plan';
import {
  STRIPE_PRICES, lineItemsFor, stripePriceId, divergentPriceOverrides, describeSubscriptionLine,
} from '../src/lib/pricing';
import { lines, type HealthFacts } from '../src/lib/site-health';

/**
 * 23 September: on JBI (three people — two leaders, one team seat) the free seat moved to the first
 * leadership seat, /billing showed A$151 (1 × leadership + 1 × team), the live subscription still
 * charged 2 × leadership, and two presses of Save on /billing left it there with nothing in the
 * logs. These tests pin down every way that could happen silently.
 */

const SAVED_ENV = { ...process.env };
afterEach(() => {
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_SEAT_MONTHLY', 'STRIPE_PRICE_TEAM_SEAT_MONTHLY', 'STRIPE_PRICE_SEAT_TRAINING_MONTHLY']) {
    if (SAVED_ENV[k] === undefined) delete process.env[k]; else process.env[k] = SAVED_ENV[k];
  }
  vi.restoreAllMocks();
});

/** JBI's shape: a GM, a leader reporting to the GM, and an Ops Admin with nobody under her. */
function jbi(extra: Partial<SeatChart> = {}): SeatChart {
  return {
    people: [
      { id: 'u-gm', seatKindOverride: null, trainingSeat: false },
      { id: 'u-lead', seatKindOverride: null, trainingSeat: false },
      { id: 'u-admin', seatKindOverride: null, trainingSeat: false },
    ],
    roles: [
      { id: 'r-gm', title: 'General Manager', reportsTo: null, active: true, isTeam: false },
      { id: 'r-lead', title: 'Operations Manager', reportsTo: 'r-gm', active: true, isTeam: false },
      { id: 'r-admin', title: 'Ops Admin', reportsTo: 'r-gm', active: true, isTeam: false },
      ...(extra.roles ?? []),
    ],
    placements: [
      { roleId: 'r-gm', userId: 'u-gm', staffId: null },
      { roleId: 'r-lead', userId: 'u-lead', staffId: null },
      { roleId: 'r-admin', userId: 'u-admin', staffId: null },
      ...(extra.placements ?? []),
    ],
    staffOwner: extra.staffOwner ?? new Map(),
  };
}

const LEADER_X2 = [{ id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 2 }];

describe('classifySeats — one count for /billing, the checkout and the subscription sync', () => {
  it('JBI is two leaders and one team seat, and the target is 1 × leader + 1 × team', () => {
    const c = classifySeats(jbi());
    expect(c).toMatchObject({ seats: 3, leadership: 2, training: 0 });
    expect(c.kinds.get('u-admin')).toBe('team');
    expect(lineItemsFor(seatBill(c.seats, c.leadership))).toEqual([
      { price: STRIPE_PRICES.leader, quantity: 1 },
      { price: STRIPE_PRICES.team, quantity: 1 },
    ]);
  });

  /*
    THE SILENT NO-OP. A role once drafted under Ops Admin and then removed is deactivated, not
    deleted, and keeps its reporting line. The old count read every role, so Ops Admin "had a direct
    report" for the bill while /billing (active roles only) itemised her as team. The sync's target
    came out as 2 × leader — exactly what Stripe already charged — so it found nothing to change and
    returned without a word.
  */
  it('a REMOVED role reporting to somebody does not make them a leader', () => {
    const chart = jbi({ roles: [{ id: 'r-gone', title: 'Admin Assistant', reportsTo: 'r-admin', active: false, isTeam: false }] });
    const c = classifySeats(chart);
    expect(c.kinds.get('u-admin')).toBe('team');
    expect(c.leadership).toBe(2);
    const target = lineItemsFor(seatBill(c.seats, c.leadership));
    expect(reconcileSubscriptionItems(LEADER_X2, target)).toEqual([
      { id: 'si_leader', quantity: 1 },
      { price: STRIPE_PRICES.team, quantity: 1 },
    ]);
  });

  it('what the old all-roles count produced for the same chart — the no-op, for the record', () => {
    // Treat the removed role as live and the old answer falls out: three leaders, target = Stripe.
    const old = classifySeats(jbi({ roles: [{ id: 'r-gone', title: 'Admin Assistant', reportsTo: 'r-admin', active: true, isTeam: false }] }));
    expect(old.leadership).toBe(3);
    expect(reconcileSubscriptionItems(LEADER_X2, lineItemsFor(seatBill(old.seats, old.leadership)))).toEqual([]);
  });

  it('somebody whose only open placement is on a removed role is a team seat, like anybody unplaced', () => {
    const chart = jbi();
    chart.roles = chart.roles.map(r => (r.id === 'r-lead' ? { ...r, active: false } : r));
    expect(classifySeats(chart).kinds.get('u-lead')).toBe('team');
  });

  it("a team node's members are team seats whatever the node is called — unless overridden", () => {
    const chart = jbi({
      roles: [{ id: 'r-crew', title: 'Supervisors', reportsTo: 'r-lead', active: true, isTeam: true }],
      placements: [{ roleId: 'r-crew', userId: 'u-crew', staffId: null }],
    });
    chart.people = [...chart.people, { id: 'u-crew', seatKindOverride: null, trainingSeat: false }];
    expect(classifySeats(chart).kinds.get('u-crew')).toBe('team');
    chart.people = chart.people.map(p => (p.id === 'u-crew' ? { ...p, seatKindOverride: 'leadership' } : p));
    expect(classifySeats(chart).kinds.get('u-crew')).toBe('leadership');
  });

  it('a person on two roles gets the same answer whichever order the database returns them', () => {
    const chart = jbi({ placements: [{ roleId: 'r-lead', userId: 'u-admin', staffId: null }] });
    const reversed = { ...chart, placements: [...chart.placements].reverse() };
    expect(classifySeats(chart).kinds.get('u-admin')).toBe('leadership');
    expect(classifySeats(reversed).kinds.get('u-admin')).toBe('leadership');
  });

  it('a staff-linked placement counts when the person has no placement of their own', () => {
    const chart = jbi();
    chart.placements = [
      ...chart.placements.filter(p => p.userId !== 'u-lead'),
      { roleId: 'r-lead', userId: null, staffId: 's-lead' },
    ];
    chart.staffOwner = new Map([['s-lead', 'u-lead']]);
    expect(classifySeats(chart).kinds.get('u-lead')).toBe('leadership');
  });

  it('an override wins over the chart, and training is counted only on a leadership seat', () => {
    const chart = jbi();
    chart.people = chart.people.map(p => (p.id === 'u-lead' ? { ...p, seatKindOverride: 'team', trainingSeat: true } : p));
    const c = classifySeats(chart);
    expect(c.kinds.get('u-lead')).toBe('team');
    expect(c).toMatchObject({ leadership: 1, training: 0 });
  });

  it('planState carries head counts, so /billing itemises from the bill rather than its own list', () => {
    const s = planState({ id: 't', plan: 'basic', startDate: '2026-09-01', stripeSubscriptionId: 'sub_1' }, 3, 'aud', 2);
    expect(s).toMatchObject({ leadershipHeads: 2, teamHeads: 1, monthlyCost: 151 });
  });
});

describe('stripePriceId — a leftover price setting', () => {
  it('on a LIVE key, an override naming another price is ignored, and says so', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_PRICE_SEAT_MONTHLY = 'price_stale_from_before_the_handoff';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(stripePriceId('leader', 'STRIPE_PRICE_SEAT_MONTHLY')).toBe(STRIPE_PRICES.leader);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('STRIPE_PRICE_SEAT_MONTHLY'));
    expect(lineItemsFor({ leadership: 1, team: 1 })[0].price).toBe(STRIPE_PRICES.leader);
  });

  it('on a TEST key the override still works — that is what it is for', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_SEAT_MONTHLY = 'price_test_leader';
    expect(stripePriceId('leader', 'STRIPE_PRICE_SEAT_MONTHLY')).toBe('price_test_leader');
  });

  it('/status names a divergent override (never its value) and is silent when there is none', () => {
    delete process.env.STRIPE_PRICE_SEAT_MONTHLY;
    delete process.env.STRIPE_PRICE_TEAM_SEAT_MONTHLY;
    delete process.env.STRIPE_PRICE_SEAT_TRAINING_MONTHLY;
    expect(divergentPriceOverrides()).toEqual([]);
    process.env.STRIPE_PRICE_TEAM_SEAT_MONTHLY = STRIPE_PRICES.team; // same as SPEC's own: not divergent
    process.env.STRIPE_PRICE_SEAT_MONTHLY = 'price_secretish_value';
    expect(divergentPriceOverrides()).toEqual(['STRIPE_PRICE_SEAT_MONTHLY']);

    const facts: HealthFacts = {
      required: {}, optional: {}, database: { status: 'ok' }, schema: { status: 'ok' },
      priceOverrides: divergentPriceOverrides(),
    };
    const line = lines(facts).find(l => l.what === 'Seat prices')!;
    expect(line.says).toContain('STRIPE_PRICE_SEAT_MONTHLY');
    expect(JSON.stringify(line)).not.toContain('price_secretish_value');
    expect(lines({ ...facts, priceOverrides: [] }).find(l => l.what === 'Seat prices')).toBeUndefined();
  });
});

/** A Stripe stand-in that remembers what it was asked to do. */
function fakeStripe(items: { id: string; price: string; quantity: number }[], opts: { failUpdate?: string } = {}) {
  const updates: { id: string; items: unknown }[] = [];
  const stripe: SeatSyncStripe = {
    subscriptions: {
      retrieve: async () => ({ status: 'active', items: { data: items.map(i => ({ id: i.id, price: { id: i.price }, quantity: i.quantity })) } }),
      update: async (id, params) => {
        if (opts.failUpdate) throw new Error(opts.failUpdate);
        updates.push({ id, items: params.items });
        return {};
      },
    },
  };
  return { stripe, updates };
}

function deps(over: Partial<SeatSyncDeps>): SeatSyncDeps & { logged: string[]; errors: string[] } {
  const logged: string[] = [];
  const errors: string[] = [];
  return {
    stripe: () => null,
    subscriptionIdOf: async () => 'sub_jbi',
    counts: async () => ({ seats: 3, leadership: 2, training: 0 }),
    log: l => logged.push(l),
    error: l => errors.push(l),
    ...over,
    logged, errors,
  };
}

describe('syncSubscriptionSeats — every ending is logged and returned', () => {
  it('no key on the deployment: says so, rather than returning without a word', async () => {
    const d = deps({ stripe: () => null });
    expect(await syncSubscriptionSeats('t-jbi', d)).toEqual({ status: 'no_stripe' });
    expect(d.logged.join('\n')).toMatch(/\[seat-sync\] tenant=t-jbi skipped: no STRIPE_SECRET_KEY/);
  });

  it('no subscription id on the business: says so', async () => {
    const d = deps({ stripe: () => fakeStripe(LEADER_X2).stripe, subscriptionIdOf: async () => null });
    expect((await syncSubscriptionSeats('t-jbi', d)).status).toBe('no_subscription');
    expect(d.logged.join('\n')).toMatch(/skipped: the business has no subscription id/);
  });

  it("JBI's case: leader × 2 becomes leader × 1 + team × 1, and the update is logged", async () => {
    const f = fakeStripe(LEADER_X2);
    const d = deps({ stripe: () => f.stripe });
    const out = await syncSubscriptionSeats('t-jbi', d);
    expect(out.status).toBe('updated');
    expect(f.updates).toEqual([{ id: 'sub_jbi', items: [{ id: 'si_leader', quantity: 1 }, { price: STRIPE_PRICES.team, quantity: 1 }] }]);
    expect(d.logged.join('\n')).toMatch(/updated: sub=sub_jbi .*leaders=2 .*stripe=price_1UHK06GjbPN3KVS7Erx7Aeum×2/);
  });

  it('already in step: logs the target and what the subscription charges, and changes nothing', async () => {
    const f = fakeStripe([
      { id: 'si_leader', price: STRIPE_PRICES.leader, quantity: 1 },
      { id: 'si_team', price: STRIPE_PRICES.team, quantity: 1 },
    ]);
    const d = deps({ stripe: () => f.stripe });
    expect((await syncSubscriptionSeats('t-jbi', d)).status).toBe('in_step');
    expect(f.updates).toEqual([]);
    expect(d.logged.join('\n')).toMatch(/in step: .*target=.*×1 \+ .*×1/);
  });

  it('a stale leader price in the environment on a live key does not leak into the push', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_x';
    process.env.STRIPE_PRICE_SEAT_MONTHLY = 'price_stale_from_before_the_handoff';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fakeStripe(LEADER_X2);
    await syncSubscriptionSeats('t-jbi', deps({ stripe: () => f.stripe }));
    expect(JSON.stringify(f.updates)).not.toContain('price_stale_from_before_the_handoff');
    expect(f.updates[0].items).toContainEqual({ id: 'si_leader', quantity: 1 });
  });

  it('Stripe refusing is logged as FAILED with the reason, and never thrown at the chart edit', async () => {
    const f = fakeStripe(LEADER_X2, { failUpdate: 'The price specified is inactive.' });
    const d = deps({ stripe: () => f.stripe });
    const out = await syncSubscriptionSeats('t-jbi', d);
    expect(out).toMatchObject({ status: 'failed', subscriptionId: 'sub_jbi', reason: 'The price specified is inactive.' });
    expect(d.errors.join('\n')).toMatch(/\[seat-sync\] tenant=t-jbi FAILED sub=sub_jbi .*inactive/);
  });
});

describe('checkSubscription — /billing asks whether the live subscription agrees with the page', () => {
  const counts = { seats: 3, leadership: 2, training: 0 };

  it("JBI after the rule change: differs, and says so in seats, not price ids", async () => {
    forgetSeenSubscription('sub_a');
    const f = fakeStripe(LEADER_X2);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const check = await checkSubscription('sub_a', counts, { stripe: () => f.stripe });
    expect(check.status).toBe('differs');
    if (check.status !== 'differs') return;
    expect(check.stripe.map(describeSubscriptionLine)).toEqual(['2 leadership seats']);
    expect(check.target.map(describeSubscriptionLine)).toEqual(['1 leadership seat', '1 team seat']);
  });

  it('asks the payment system once a minute at most', async () => {
    forgetSeenSubscription('sub_b');
    const f = fakeStripe(LEADER_X2);
    const retrieve = vi.spyOn(f.stripe.subscriptions, 'retrieve');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await checkSubscription('sub_b', counts, { stripe: () => f.stripe, now: 1_000_000 });
    await checkSubscription('sub_b', counts, { stripe: () => f.stripe, now: 1_030_000 });
    expect(retrieve).toHaveBeenCalledTimes(1);
    await checkSubscription('sub_b', counts, { stripe: () => f.stripe, now: 1_070_000 });
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('never holds the page up: a slow answer is "unknown", not a wait', async () => {
    forgetSeenSubscription('sub_c');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slow: SeatSyncStripe = {
      subscriptions: { retrieve: () => new Promise(() => {}), update: async () => ({}) },
    };
    const check = await checkSubscription('sub_c', counts, { stripe: () => slow, timeoutMs: 20 });
    expect(check.status).toBe('unknown');
  });

  it('a price the code does not know is named as one, never guessed at', () => {
    expect(compareSubscription([{ id: 'si', price: 'price_old', quantity: 2 }], counts).status).toBe('differs');
    expect(describeSubscriptionLine({ price: 'price_old', quantity: 2 })).toBe('2 seats at a price SPEC no longer uses');
  });
});

describe('/billing wiring — a save there can no longer vanish', () => {
  // Read as text: these are server components and a server action, and what matters is the wiring.
  const page = readFileSync('src/app/billing/page.tsx', 'utf8');
  const actions = readFileSync('src/app/org/actions.ts', 'utf8');
  const setSeatKind = actions.slice(actions.indexOf('export async function setSeatKind'), actions.indexOf('export async function removeRole'));

  it('the Save form says it came from /billing, and the action answers there with the sync outcome', () => {
    expect(page).toContain('<input type="hidden" name="from" value="billing" />');
    expect(setSeatKind).toContain('redirect(`/billing?seat_sync=${outcome.status}`)');
    expect(setSeatKind).toContain("redirect(`/billing?cannot=");
    for (const s of ['updated', 'in_step', 'no_subscription', 'no_stripe', 'failed']) expect(page).toContain(`'seat_sync=${s}'`);
  });

  it('the itemised bill comes from the same count as the total and the sync, not from the list', () => {
    expect(page).toContain('plan.leadershipHeads');
    expect(page).not.toMatch(/seatRows\.filter\([^)]*\)\.length/);
    expect(page).toContain('counts.kinds.get(');
  });

  it('the live subscription is compared on load, off the critical path, with a fix beside it', () => {
    expect(page).toMatch(/<Suspense fallback=\{null\}>\s*<SubscriptionAgreement/);
    expect(page).toContain('action={resyncSubscription}');
  });
});
