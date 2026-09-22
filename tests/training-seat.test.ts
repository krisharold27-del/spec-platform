import { describe, it, expect } from 'vitest';
import { eligibleForTrainingSeat, TRAINING_SEAT_ON_SALE, SEAT_PRICES, trainingSeatPrice, PACKAGES } from '../src/lib/pricing';
import { seatBill, planState, FREE_SEATS } from '../src/lib/plan';

/**
 * The training seat — a leadership seat, upgraded per person, to unlock SPEC's own training
 * material for the role.
 *
 * ── What it used to be ───────────────────────────────────────────────────────────────────────────
 *
 * A$44 for frontline leaders only — supervisors and team leaders, decided by role LEVEL — held back
 * entirely while the material did not exist: *"happy to remove the 44 from the plan for the short
 * term and start cleanly... leave it as a price for the future - i havent finished the supervisor
 * training pack anyway."*
 *
 * ── What changed it ──────────────────────────────────────────────────────────────────────────────
 *
 * The material exists now (`lib/training-library`'s twelve modules), and the slot the retired
 * Basic/Advanced tier had briefly reused — the $227 leadership-with-AI price — was itself retired
 * the same day it shipped. Kris, 22 September: *"i think the 227 price can stay but change to full
 * training system price — so all training materials become available for the role — we as SPEC are
 * constantly building our training materials so they can turn the seat to a leadership and training
 * seat and that then makes it 227."* Asked scope and timing, he confirmed: per-person, on now.
 *
 * Eligibility broadens with it — from role LEVEL (`supervisor` only) to seat KIND
 * (`seatKindFor` === `'leadership'`), the same question billing already asks, so eligibility can
 * never disagree with what a person is actually charged as.
 */

const t = (plan: string) => ({ id: 'x', plan, startDate: '2026-01-01' });

/*
  Derived from the table rather than written out, deliberately.

  `tests/pricing.test.ts` owns the twelve published numbers and states every one of them
  literally, so a table change is caught there once. These tests are about the ARITHMETIC on top of
  it — who is charged which rate, and which seat the free one comes off — and hard-coding totals
  here meant design 15 broke nine of them for saying nothing about the maths at all.
*/
const LEADER = SEAT_PRICES.aud.leadership;   // 134
const TEAM = SEAT_PRICES.aud.team;           // 17
const TRAINING = SEAT_PRICES.aud.leadershipWithTraining; // 227

describe('who may be put on the training seat', () => {
  it('is a leadership seat, decided the same way billing decides one', () => {
    expect(eligibleForTrainingSeat({ title: 'Site Supervisor', hasDirectReports: true })).toBe(true);
    expect(eligibleForTrainingSeat({ title: 'Site Supervisor', hasDirectReports: false }), 'title alone says leader').toBe(true);
    expect(eligibleForTrainingSeat({ title: 'Electrician', hasDirectReports: true }), 'the chart alone says leader').toBe(true);
    expect(eligibleForTrainingSeat({ title: 'Electrician', hasDirectReports: false }), 'a team member is not').toBe(false);
  });

  it('IS ON, per person, now', () => {
    expect(TRAINING_SEAT_ON_SALE).toBe(true);
  });

  /*
    Design 15 retired the A$44 training seat, and the slot it moved into — the leadership seat with
    the AI on it, at A$227 — was itself retired 22 September, the same day it shipped: Kris, looking
    at the built result, *"i also feel like i don't want to have 2 different prices... make it
    simple."* `PACKAGES.seat_training` is kept, unpublished, at the same price as the plain seat —
    see the note on it in lib/pricing — rather than deleted, because the key is stored on
    businesses. It is a separate thing from the per-person training seat above: a `Package` is a
    whole-business choice, and the training seat is a per-person one, so the two do not disagree.
  */
  it('and the slot the OLD tier moved into is retired as well, unpublished at the plain seat price', () => {
    expect(PACKAGES.seat_training.aud).toBe(PACKAGES.seat.aud);
    expect(PACKAGES.seat_training.publishPrice).toBe(false);
  });
});

describe('what the training seat actually costs', () => {
  it('is the same figures the retired Advanced/AI leadership price had', () => {
    expect(TRAINING).toBe(227);
    expect(trainingSeatPrice('aud')).toBe(227);
    expect(trainingSeatPrice('nzd')).toBe(305);
    expect(trainingSeatPrice('gbp')).toBe(149);
  });
});

describe('a bill made of three kinds of seat', () => {
  /*
    ── The two kinds changed, and the bill did not follow ───────────────────────────────────────

    These used to be PLAIN and TRAINING seats. Design 15 replaced that model with LEADERSHIP and
    TEAM seats and lib/pricing followed, but `seatBill` kept asking the old question — so the
    product held four seat prices and could reach exactly one of them, the leadership price, and
    counted every person in every business at it.

    The numbers below are the ones that were wrong: a business of forty with six leaders would have
    been billed 39 × A$134 = A$5,226 a month instead of 5 × A$134 + 34 × A$17 = A$1,248. Four times
    over, on the screen a customer reads before pressing pay, and looking entirely reasonable.
  */
  it('CHARGES THE LEADERSHIP RATE ONLY FOR THE PEOPLE WHO LEAD', () => {
    // Forty people, six of them leading somebody, one seat free.
    const bill = seatBill(40, 6, 'aud');
    expect(bill.leadership).toBe(6);
    expect(bill.team).toBe(33);
    expect(bill.training).toBe(0);
    expect(bill.leadership + bill.team + FREE_SEATS).toBe(40);
    expect(bill.monthlyCost).toBe(6 * LEADER + 33 * TEAM);
  });

  it('AND IS NOWHERE NEAR THE LEADERSHIP RATE FOR EVERYBODY, which is what it used to be', () => {
    const bill = seatBill(40, 6, 'aud');
    expect(bill.monthlyCost, 'the fault this was written for').toBeLessThan(39 * LEADER);
    expect(bill.monthlyCost, 'nor the team rate for everybody').toBeGreaterThan(39 * TEAM);
  });

  /*
    The third kind: some of the leadership seats are also on the training upgrade, at the dearer
    price. Never counted twice — `bill.leadership` is the PLAIN leadership count, and `bill.training`
    is separate from it, so `bill.leadership + bill.training` is the total number of leaders, the
    same total `countLeadershipSeats` would report on its own.
  */
  it('charges the training rate for a leadership seat put on it, and the plain rate for the rest', () => {
    // Forty people, six leaders, two of the six on the training upgrade.
    // `bill.leadership` is every billed leadership seat, plain and trained together (6); `bill.training`
    // is the trained subset of it (2) — never added on top, which is why the cost uses only four at
    // the plain rate.
    const bill = seatBill(40, 6, 'aud', 2);
    expect(bill.leadership).toBe(6);
    expect(bill.training).toBe(2);
    expect(bill.team).toBe(33);
    expect(bill.monthlyCost).toBe(4 * LEADER + 2 * TRAINING + 33 * TEAM);
  });

  it('never charges a trained seat that is not also counted as a leader', () => {
    // trainingSeats can never exceed leadershipSeats — the training seat is a leadership seat, first.
    const bill = seatBill(10, 2, 'aud', 9);
    expect(bill.training).toBeLessThanOrEqual(2);
    expect(bill.leadership + bill.training).toBe(bill.leadership + Math.min(9, 2));
  });

  /*
    The free seat comes off a team seat, not off the dearer ones — the less generous reading, and
    the same choice the old version made. Taking it off a trained leadership seat would hand back
    A$227 to make a point about A$17.
  */
  it('takes the free seat off a team seat, not off either leadership rate', () => {
    expect(seatBill(2, 1, 'aud').monthlyCost).toBe(LEADER);
    expect(seatBill(2, 1, 'aud').team).toBe(0);
    expect(seatBill(2, 1, 'aud').leadership).toBe(1);
  });

  it('and off a plain leadership seat before a trained one, when there is no team seat to take it from', () => {
    // Two leaders, one trained, nobody else — the free seat comes off the plain one, leaving only
    // the trained seat billed. `bill.leadership` is the total leadership count billed (plain and
    // trained together), which is why it still reads 1 even though the plain seat itself is free.
    const bill = seatBill(2, 2, 'aud', 1);
    expect(bill.leadership).toBe(1);
    expect(bill.training).toBe(1);
    expect(bill.monthlyCost).toBe(TRAINING);
  });

  it('but the first seat is still free when every seat is a leadership seat', () => {
    // Which is every business on its first day: one person, who leads it.
    expect(seatBill(1, 1, 'aud').monthlyCost).toBe(0);
    expect(seatBill(3, 3, 'aud').monthlyCost).toBe(2 * LEADER);
  });

  it('a business of one pays nothing whichever seat they are on', () => {
    expect(seatBill(1, 0, 'aud').monthlyCost).toBe(0);
    expect(seatBill(0, 0, 'aud').monthlyCost).toBe(0);
  });

  it('never invents leaders who do not exist', () => {
    // More leaders than people is not a bill, it is a bug upstream. Cap rather than throw.
    expect(seatBill(3, 9, 'aud').leadership).toBe(2);
    expect(seatBill(3, 9, 'aud').team).toBe(0);
    expect(seatBill(3, 9, 'aud').monthlyCost).toBe(2 * LEADER);
  });

  it('bills in the region’s own prices, never converted', () => {
    expect(seatBill(5, 2, 'gbp').monthlyCost)
      .toBe(2 * SEAT_PRICES.gbp.leadership + 2 * SEAT_PRICES.gbp.team);
    expect(seatBill(5, 2, 'gbp', 1).monthlyCost)
      .toBe(1 * SEAT_PRICES.gbp.leadership + 1 * SEAT_PRICES.gbp.leadershipWithTraining + 2 * SEAT_PRICES.gbp.team);
  });

  /*
    One price per seat kind now, so there is nothing left for `planState` to choose between — the
    Basic/Advanced question this test used to check ("prices a business at Basic until its own
    administrator chooses Advanced") was retired 22 September along with the tier. See the note on
    `SEAT_PRICES` in lib/pricing.
  */
  it('PRICES EVERY BUSINESS THE SAME WAY, there being only one price to be on', () => {
    expect(planState(t('basic'), 40, 'aud', 6).monthlyCost).toBe(6 * LEADER + 33 * TEAM);
  });

  it('reaches the plan state, so the page shows the real number', () => {
    const s = planState(t('basic'), 40, 'aud', 6, 2);
    expect(s.seats).toBe(40);
    expect(s.leadershipSeats).toBe(6);
    expect(s.trainingSeats).toBe(2);
    expect(s.teamSeats).toBe(33);
    expect(s.monthlyCost).toBe(4 * LEADER + 2 * TRAINING + 33 * TEAM);
  });

  it('holds at twenty thousand seats', () => {
    const bill = seatBill(20_000, 2_000, 'aud');
    expect(bill.monthlyCost).toBe(2_000 * LEADER + 17_999 * TEAM);
  });
});
