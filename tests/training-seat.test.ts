import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canBeTrained, isFrontlineLeader, TRAINING_SEAT_ON_SALE, SEAT_PRICES, PACKAGES, digitRoot, everyPublishedSeatPrice, RULE_OF_EIGHT, pricesObeyingTheRule } from '../src/lib/pricing';
import { seatBill, planState, FREE_SEATS } from '../src/lib/plan';
import { LIBRARY, libraryOrder, libraryMinutes, libraryLine } from '../src/lib/training-library';

/**
 * The A$44, which until 16 September was a number on three screens with nothing behind it.
 *
 * `seat_training` was a column on the BUSINESS, settable from /admin, printed on the pricing page
 * and the landing page — and no line of code charged it or gated anything on it. A business put on
 * "Seat plus training" paid A$26 and received exactly what every other business received.
 *
 * Kris: *"we need to be clear what the $44 price is about — i think we need to make training
 * materials available for front line leaders and so it need to be only $44 for people who are
 * supervisors, team leaders etc"*.
 */

const t = (plan: string, seatTier?: string) => ({ id: 'x', plan, startDate: '2026-01-01', seatTier });

/*
  Derived from the table rather than written out, deliberately.

  `tests/pricing.test.ts` owns the twenty-four published numbers and states every one of them
  literally, so a table change is caught there once. These tests are about the ARITHMETIC on top of
  it — who is charged which rate, and which seat the free one comes off — and hard-coding totals
  here meant design 15 broke nine of them for saying nothing about the maths at all.
*/
const LEADER = SEAT_PRICES.aud.leadership;   // 134
const TEAM = SEAT_PRICES.aud.team;           // 17

describe('who the training seat is for', () => {
  it('frontline leaders, and nobody else', () => {
    expect(isFrontlineLeader('supervisor')).toBe(true);
    expect(isFrontlineLeader('staff'), 'a team member is not a leader').toBe(false);
    expect(isFrontlineLeader('manager'), 'a stream head is above the frontline, not on it').toBe(false);
    expect(isFrontlineLeader('gm')).toBe(false);
  });

  it('refuses anything it does not recognise, rather than guessing', () => {
    expect(isFrontlineLeader(null)).toBe(false);
    expect(isFrontlineLeader(undefined)).toBe(false);
    expect(isFrontlineLeader('')).toBe(false);
    expect(isFrontlineLeader('SUPERVISOR'), 'levels are stored lowercase; a near miss is not a match').toBe(false);
  });

  /*
    Kris, 16 September: "happy to remove the 44 from the plan for the short term and start
    cleanly... leave it as a price for the future - i havent finished the supervisor training pack
    anyway".

    So nobody can be put on it at all while the pack is unfinished, whatever role they hold — and
    the price, the material and the whole two-rate bill stay built and tested behind the switch,
    because deleting them and rebuilding in a month is how a feature comes back worse.
  */
  it('AND NOBODY AT ALL WHILE THE PACK IS UNFINISHED', () => {
    expect(TRAINING_SEAT_ON_SALE, 'the supervisor pack is not finished yet').toBe(false);
    expect(canBeTrained('supervisor'), 'not even a supervisor, until it is on sale').toBe(false);
    expect(canBeTrained('staff')).toBe(false);
  });

  /*
    Design 15 retired the A$44 training seat. It had been published for months and was never
    sellable — the supervisor pack was never finished — and the same slot is now the leadership seat
    with the AI on it, at A$227 — the figure the design drew, which the rule of 8 briefly moved to
    224 and which Stripe now carries live. See RULE_OF_EIGHT in lib/pricing.
  */
  it('but the slot is now the AI seat, and the training seat is gone', () => {
    expect(PACKAGES.seat_training.aud).toBe(227);
    expect(SEAT_PRICES.aud.leadershipWithAi).toBe(227);
    expect(PACKAGES.seat_training.label).toContain('Advanced');
  });
});

describe('a bill made of two kinds of seat', () => {
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
    expect(bill.leadership + bill.team + FREE_SEATS).toBe(40);
    expect(bill.monthlyCost).toBe(6 * LEADER + 33 * TEAM);
  });

  it('AND IS NOWHERE NEAR THE LEADERSHIP RATE FOR EVERYBODY, which is what it used to be', () => {
    const bill = seatBill(40, 6, 'aud');
    expect(bill.monthlyCost, 'the fault this was written for').toBeLessThan(39 * LEADER);
    expect(bill.monthlyCost, 'nor the team rate for everybody').toBeGreaterThan(39 * TEAM);
  });

  /*
    The free seat comes off the CHEAPER seat — the less generous reading, and the same choice the
    old version made. "The first seat is free" is a rule about money, not about which person, and
    taking it off a leadership seat would hand back A$134 to make a point about A$17.
  */
  it('takes the free seat off a team seat, not off the dearer one', () => {
    expect(seatBill(2, 1, 'aud').monthlyCost).toBe(LEADER);
    expect(seatBill(2, 1, 'aud').team).toBe(0);
    expect(seatBill(2, 1, 'aud').leadership).toBe(1);
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
  });

  /*
    ── Every business starts on Basic, until ITS OWN administrator says otherwise ───────────────

    All four seat products are live in Stripe and a customer could be charged A$227 today. Since
    22 September the choice is per business — `tenants.seatTier`, answered on the journey page
    (`setBusinessSeatTier`) — never a product-wide switch, because a global one could only ever
    move every existing business onto the dearer seat at once with nobody having chosen anything.
  */
  it('PRICES A BUSINESS AT BASIC UNTIL ITS OWN ADMINISTRATOR CHOOSES ADVANCED', () => {
    expect(planState(t('basic'), 40, 'aud', 6).monthlyCost).toBe(6 * LEADER + 33 * TEAM);
    expect(planState(t('basic'), 40, 'aud', 6).seatTier, 'no choice made yet reads as basic').toBe('basic');
    // And the dearer rates are reachable the moment a business says so, on its own.
    expect(planState(t('basic', 'advanced'), 40, 'aud', 6).seatTier).toBe('advanced');
    expect(planState(t('basic', 'advanced'), 40, 'aud', 6).monthlyCost)
      .toBe(6 * SEAT_PRICES.aud.leadershipWithAi + 33 * SEAT_PRICES.aud.teamWithAi);
    expect(seatBill(40, 6, 'aud', true).monthlyCost)
      .toBe(6 * SEAT_PRICES.aud.leadershipWithAi + 33 * SEAT_PRICES.aud.teamWithAi);
  });

  it('reaches the plan state, so the page shows the real number', () => {
    const s = planState(t('basic'), 40, 'aud', 6);
    expect(s.seats).toBe(40);
    expect(s.leadershipSeats).toBe(6);
    expect(s.teamSeats).toBe(33);
    expect(s.monthlyCost).toBe(6 * LEADER + 33 * TEAM);
  });

  it('holds at twenty thousand seats', () => {
    const bill = seatBill(20_000, 2_000, 'aud');
    expect(bill.monthlyCost).toBe(2_000 * LEADER + 17_999 * TEAM);
  });
});
