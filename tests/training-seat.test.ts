import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canBeTrained, isFrontlineLeader, TRAINING_SEAT_ON_SALE, seatRate, SEAT_PRICES, PACKAGES, digitRoot, everyPublishedSeatPrice } from '../src/lib/pricing';
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

const t = (plan: string) => ({ id: 'x', plan, startDate: '2026-01-01' });

/*
  Derived from the table rather than written out, deliberately.

  `tests/pricing.test.ts` owns the twenty-four published numbers and states every one of them
  literally, so a table change is caught there once. These tests are about the ARITHMETIC on top of
  it — who is charged which rate, and which seat the free one comes off — and hard-coding totals
  here meant design 15 broke nine of them for saying nothing about the maths at all.
*/
const PLAIN = SEAT_PRICES.aud.leadership;       // 134
const WITH_AI = SEAT_PRICES.aud.leadershipWithAi; // 224

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
    with the AI on it, at A$224.
  */
  it('but the slot is now the AI seat, and the training seat is gone', () => {
    expect(PACKAGES.seat_training.aud).toBe(224);
    expect(SEAT_PRICES.aud.leadershipWithAi).toBe(224);
    expect(PACKAGES.seat_training.label).toContain('AI');
  });
});

describe('a bill made of two kinds of seat', () => {
  it('charges the training rate ONLY for the people on it', () => {
    // Forty people, six of them supervisors on training, one seat free.
    const bill = seatBill(40, 6, 'aud');
    expect(bill.training).toBe(6);
    expect(bill.plain).toBe(33);
    expect(bill.plain + bill.training + FREE_SEATS).toBe(40);
    expect(bill.monthlyCost).toBe(33 * PLAIN + 6 * WITH_AI);
  });

  /*
    The fault the old shape would have produced. `seat_training` on the business could only mean
    "everybody pays A$44", which for this business is thirty-four people charged the training price
    for material nobody is giving them.
  */
  it('NEVER charges the training rate to people who are not on training', () => {
    const bill = seatBill(40, 6, 'aud');
    expect(bill.monthlyCost).toBeLessThan(39 * WITH_AI);
    expect(bill.monthlyCost, 'and is not the plain rate for everybody either').toBeGreaterThan(39 * PLAIN);
  });

  it('takes the free seat off a plain seat, not off the dearer one', () => {
    // Two people, one on the AI seat. The free seat is the plain one, so the dearer rate is left.
    expect(seatBill(2, 1, 'aud').monthlyCost).toBe(WITH_AI);
    expect(seatBill(2, 1, 'aud').plain).toBe(0);
    expect(seatBill(2, 1, 'aud').training).toBe(1);
  });

  it('but the first seat is still free when every seat is a training seat', () => {
    // "The first seat is free" has to be true however the business is shaped.
    expect(seatBill(1, 1, 'aud').monthlyCost).toBe(0);
    expect(seatBill(3, 3, 'aud').monthlyCost).toBe(2 * WITH_AI);
  });

  it('a business of one pays nothing whichever seat they are on', () => {
    expect(seatBill(1, 0, 'aud').monthlyCost).toBe(0);
    expect(seatBill(0, 0, 'aud').monthlyCost).toBe(0);
  });

  it('never invents training seats that do not exist', () => {
    // More training seats than people is not a bill, it is a bug upstream. Cap rather than throw.
    expect(seatBill(3, 9, 'aud').training).toBe(2);
    expect(seatBill(3, 9, 'aud').plain).toBe(0);
    expect(seatBill(3, 9, 'aud').monthlyCost).toBe(2 * WITH_AI);
  });

  it('bills in the region’s own prices, never converted', () => {
    expect(seatBill(5, 2, 'gbp').monthlyCost)
      .toBe(2 * SEAT_PRICES.gbp.leadership + 2 * SEAT_PRICES.gbp.leadershipWithAi);
    expect(seatRate('gbp', true)).toBe(SEAT_PRICES.gbp.leadershipWithAi);
    expect(seatRate('gbp', false)).toBe(SEAT_PRICES.gbp.leadership);
  });

  it('reaches the plan state, so the page shows the real number', () => {
    const s = planState(t('basic'), 40, 'aud', 6);
    expect(s.seats).toBe(40);
    expect(s.trainingSeats).toBe(6);
    expect(s.monthlyCost).toBe(33 * PLAIN + 6 * WITH_AI);
  });

  it('holds at twenty thousand seats', () => {
    const bill = seatBill(20_000, 2_000, 'aud');
    expect(bill.monthlyCost).toBe(17_999 * PLAIN + 2_000 * WITH_AI);
  });
});

describe('every published price still reduces to 8', () => {
  /* Looped inside one `it` rather than generating six of them: docs/READINESS.md publishes the
     number of tests, and it is counted by reading the files, so a loop makes the two disagree. */
  it('both rates, in every currency', () => {
    for (const [c, p] of Object.entries(SEAT_PRICES)) {
      for (const amount of everyPublishedSeatPrice(p)) {
        expect(digitRoot(amount), `${c} publishes ${amount}`).toBe(8);
      }
    }
  });

  /*
    The AI costs more than not having it, and leading people costs more than being led. Both are
    obvious and both are the kind of thing a table typed by hand gets backwards once.
  */
  it('and every seat is dearer with the AI, and leadership dearer than team, everywhere', () => {
    for (const [c, p] of Object.entries(SEAT_PRICES)) {
      expect(p.leadershipWithAi, `${c} leadership`).toBeGreaterThan(p.leadership);
      expect(p.teamWithAi, `${c} team`).toBeGreaterThan(p.team);
      expect(p.leadership, `${c} leadership vs team`).toBeGreaterThan(p.team);
    }
  });
});

describe('the material itself', () => {
  it('has something inside every module, which is the whole point', () => {
    // A module with a title, a summary and nothing in it is a checklist item, and nobody should be
    // charged A$18 a month extra for a checklist. This is the test that stops that shipping.
    for (const m of LIBRARY) {
      expect(m.content.trim().length, `${m.libraryId} has no material`).toBeGreaterThan(400);
    }
  });

  it('covers all four pillars', () => {
    const pillars = new Set(LIBRARY.map(m => m.pillar));
    for (const p of ['safety', 'people', 'earnings', 'compliance']) expect(pillars.has(p as never)).toBe(true);
  });

  it('teaches the job, not the software', () => {
    /*
      A training library that teaches its own buttons is a library that exists to justify a price.
      These are the words that would appear if that started happening.
    */
    const banned = /\bclick\b|\bbutton\b|\bdashboard\b|\blog in\b|\bsign in\b|\bnavigate\b|\bmenu\b/i;
    for (const m of LIBRARY) {
      const offending = `${m.title} ${m.summary} ${m.content}`.match(banned);
      expect(offending?.[0], `${m.libraryId} is teaching the software`).toBeUndefined();
    }
  });

  it('gives every module a permanent id, and no two the same', () => {
    const ids = LIBRARY.map(m => m.libraryId);
    expect(new Set(ids).size, 'ids collide').toBe(ids.length);
    for (const id of ids) expect(id.startsWith('spec.')).toBe(true);
  });

  it('puts the core modules first, because they are the job rather than an improvement on it', () => {
    const order = libraryOrder().map(m => m.core);
    expect(order.indexOf(false), 'a non-core module came before a core one')
      .toBeGreaterThan(order.lastIndexOf(true) - 1);
    expect(order.lastIndexOf(true)).toBeLessThan(order.indexOf(false));
  });

  it('says honestly how long the whole path takes', () => {
    expect(libraryMinutes()).toBe(LIBRARY.reduce((t, m) => t + m.minutes, 0));
    expect(libraryLine()).toContain(`${LIBRARY.length} modules`);
  });

  it('is described to a customer as what it is', () => {
    expect(PACKAGES.seat_training.what).toMatch(/assistant|\bAI\b/i);
    expect(PACKAGES.seat_training.per, 'it is a seat, not a plan for the whole business').toBe('seat');
    expect(PACKAGES.seat_training.aud).toBe(WITH_AI);
  });
});

/** Held against the code, because every one of these is a place the price becomes money. */
describe('the places the training seat is enforced', () => {
  const reads = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

  it('the checkout bills the two rates as two lines', () => {
    const src = reads('src/app/api/stripe/checkout/route.ts');
    expect(src).toContain('seatBill(');
    expect(src).toContain('STRIPE_PRICE_SEAT_TRAINING_MONTHLY');
    expect(src, 'a single quantity cannot express a mixed bill').not.toContain('quantity: billable');
  });

  it('and REFUSES rather than quietly charging the cheap rate', () => {
    // Falling back would be A$18 a person a month, every month, with nothing anywhere saying so.
    const src = reads('src/app/api/stripe/checkout/route.ts');
    expect(src).toContain('training_price_missing');
  });

  it('the server decides eligibility, not the form', () => {
    const src = reads('src/app/settings/actions.ts');
    expect(src).toContain('giveTrainingSeat');
    expect(reads('src/lib/training-seat.ts')).toContain('eligibleForTraining');
  });

  it('turning the seat on also installs the material and puts it on the path', () => {
    // Doing only the billing half charges somebody A$44 for a page identical to the A$26 one.
    const src = reads('src/lib/training-seat.ts');
    expect(src).toContain('installLibrary');
    expect(src).toContain('addLibraryToPath');
  });

  it('taking somebody off the seat never deletes what they learned', () => {
    const src = reads('src/lib/training-seat.ts');
    const remove = src.slice(src.indexOf('export async function removeTrainingSeat'));
    expect(remove.slice(0, 400)).not.toMatch(/\.delete\(/);
  });

  it('the status page can see whether the training price is set', () => {
    expect(reads('src/lib/health-facts.ts')).toContain('STRIPE_PRICE_SEAT_TRAINING_MONTHLY');
  });

  it('the material is never rendered as HTML', () => {
    /*
      It comes out of the database, and one day a business will want to write its own.

      Comments are stripped before looking. The first version of this failed on the file's own
      comment saying it never does this — a check that cannot tell an explanation from the thing it
      is explaining.
    */
    const code = reads('src/components/material.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('dangerouslySetInnerHTML');
  });
});
