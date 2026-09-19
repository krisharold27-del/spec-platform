import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PACKAGES, PACKAGE_KEYS, packageOf, monthlyCostOf, packagePrice, currencyFor,
  availableTo, unavailableBecause, digitRoot, SEAT_PRICES, HOME_CURRENCY, everyPublishedSeatPrice,
  RULE_OF_EIGHT, pricesObeyingTheRule,
  type Package,
} from '../src/lib/pricing';

/*
  ── The four things SPEC sells ───────────────────────────────────────────────────────────────────

  Kris, 16 September 2026:

    "there are 4 prices = 26 single seat, 44 plus training online through this system, 1007 external
     training through SPEC 4 1 hour sessions a month and specific to role and usage, and 20888 is
     for full spec control 1 full day per week and attend and conduct monthly board meeting — these
     are controlled by the administrator"

    "3 can be done from australia to anywhere in the world - 4 is only australia at this time"

  Two of them are seats and two of them are somebody's week. That distinction is the one thing in
  this file worth protecting: the first two scale to twenty thousand people, and the second two
  cannot scale past one person's diary.
*/

describe('the four packages', () => {
  it('is four, and they are the four he named', () => {
    expect(PACKAGE_KEYS).toEqual(['seat', 'seat_training', 'sessions', 'full_control']);
  });

  it('charges what Stripe charges', () => {
    expect(PACKAGES.seat.aud).toBe(SEAT_PRICES.aud.leadership);
    expect(PACKAGES.seat_training.aud).toBe(SEAT_PRICES.aud.leadershipWithAi);
    /*
      A$1,007 → A$1,502 on 18 September. Kris: *"One-to-one is the premium format, and the old
      number priced it like a freelancer hour ($250/hr) — too cheap for training delivered at your
      level."* Confirmed against the live account on 19 September; the A$1,007 product is archived.
    */
    expect(PACKAGES.sessions.aud).toBe(1502);
  });

  /*
    ── Consulting has no price, and that is the assertion ───────────────────────────────────────

    It was A$20,888. Kris's Stripe handoff of 19 September archives that product — *"Not part of
    the current offer"* — and replaces it with *"Consulting is quote-only — 'Speak to us'. No
    Stripe product."*

    `publishPrice: false` was never enough on its own: it governs the marketing page, and /admin
    printed the figure regardless. Null is what makes it unprintable everywhere at once.
  */
  it('HAS NO PRICE ON THE ONE THING THAT IS QUOTED, not a hidden one', () => {
    expect(PACKAGES.full_control.aud).toBeNull();
    expect(monthlyCostOf('full_control', 'aud', 40)).toBeNull();
    expect(packagePrice('full_control')).toBe('Speak to us');
  });

  /*
    ── The rule of 8, and the sixteen prices that broke it ──────────────────────────────────────

    Every published price in SPEC used to reduce to 8 by repeated digit sum. It was Kris's rule, it
    was enforced in three tests, and on 19 September it is what stopped design 15's $227 and $29
    going out — he was given the nearest numbers that obeyed it and said *"224 and 26"*.

    Then the products were created in Stripe at 227 and 29, and the handoff confirms them against
    the live account. Sixteen of the twenty-four seat prices no longer reduce to 8.

    A displayed price that is not the charged price is the worst outcome available here, so the
    table matches Stripe. What must not happen is the rule quietly disappearing — so this asserts
    the exceptions are EXACTLY the ones on record. A seventeenth cannot arrive by accident, and a
    price moved back onto the rule fails too until `RULE_OF_EIGHT` is updated with it.
  */
  it('STILL KNOWS EXACTLY WHICH PRICES OBEY THE RULE OF 8, and which no longer do', () => {
    expect(pricesObeyingTheRule()).toEqual([...RULE_OF_EIGHT]);
    for (const amount of RULE_OF_EIGHT) expect(digitRoot(amount), `${amount}`).toBe(8);

    const broken = Object.values(SEAT_PRICES)
      .flatMap(everyPublishedSeatPrice)
      .filter(a => digitRoot(a) !== 8);
    expect(broken.length, 'sixteen of the twenty-four, per the handoff of 19 September').toBe(16);
  });

  /* The training price still obeys it, and both figures in its history do — so only the note and
     the assertion by name stand between 1,502 and somebody "correcting" it back to 1,007. */
  it('and the training price is 1502, which the rule could never have caught either way', () => {
    expect(PACKAGES.sessions.aud).toBe(1502);
    expect(digitRoot(1502)).toBe(8);
    expect(digitRoot(1007), 'the old one obeyed it too').toBe(8);
  });
});

describe('seats scale; somebody\'s week does not', () => {
  /*
    The distinction the whole file turns on. A seat price times forty people is forty seats' worth
    of money for forty people's worth of value. A full day a week times forty is still one day.
  */
  it('multiplies a seat package by the people in it', () => {
    expect(monthlyCostOf('seat', 'aud', 40)).toBe(SEAT_PRICES.aud.leadership * 40);
    expect(monthlyCostOf('seat_training', 'aud', 40)).toBe(SEAT_PRICES.aud.leadershipWithAi * 40);
  });

  it('NEVER multiplies a per-business package by a headcount', () => {
    for (const seats of [1, 12, 40, 20000]) {
      expect(monthlyCostOf('sessions', 'aud', seats), `${seats} people`).toBe(1502);
      // And the quote-only one stays null at every headcount rather than becoming a zero, which
      // would read on a page as "free" instead of "ask".
      expect(monthlyCostOf('full_control', 'aud', seats), `${seats} people`).toBeNull();
    }
  });

  /*
    `seat_training` is the AI seat now, not SPEC's training material — design 15 retired that seat,
    which had been published for months and was never sellable. The KEY is unchanged because it is
    stored on businesses and renaming it is a migration; see the note in lib/pricing.
  */
  it('uses the AI price for the AI package, not the plain seat one', () => {
    expect(monthlyCostOf('seat_training', 'aud', 1)).toBe(227);
    expect(monthlyCostOf('seat_training', 'gbp', 1)).toBe(SEAT_PRICES.gbp.leadershipWithAi);
    expect(monthlyCostOf('seat', 'gbp', 1)).toBe(SEAT_PRICES.gbp.leadership);
  });
});

describe('what currency each one is sold in', () => {
  /*
    A seat has a chosen price in six currencies. The other two are quoted in Australian dollars
    wherever the customer is, because that is the only number anybody has decided — and a converted
    price is one that moves every time an exchange rate does, which is the thing this product has
    refused to do since the first price was published.
  */
  it('sells a seat in the business\'s own currency', () => {
    expect(currencyFor('seat', 'gbp')).toBe('gbp');
    expect(currencyFor('seat_training', 'nzd')).toBe('nzd');
  });

  it('prices the other two in Australian dollars, because that is the only number anybody chose', () => {
    for (const c of ['gbp', 'usd', 'eur', 'nzd', 'cad'] as const) {
      expect(currencyFor('sessions', c), c).toBe(HOME_CURRENCY);
      expect(currencyFor('full_control', c), c).toBe(HOME_CURRENCY);
    }
  });

  /*
    ── And says so rather than quoting a price that cannot be taken ─────────────────────────────

    This used to assert that a British customer was SHOWN "A$1,502" — the Australian figure, with
    the currency on it so nobody could mistake it. That was the right call while the number was
    only ever read on a page.

    It is wrong now. Training is one Stripe price in Australian dollars with no `currency_options`
    on it, so Stripe cannot put it on a GBP subscription at all. Kris's handoff: *"if the
    customer's currency is not AUD, show Training as 'Speak to us' rather than a price."* A price
    that is printed and cannot be charged is worse than no price, because somebody budgets on it.
  */
  it('BUT SHOWS "SPEAK TO US" RATHER THAN A PRICE STRIPE COULD NOT TAKE', () => {
    expect(packagePrice('sessions', 'aud')).toContain('A$1502');
    for (const c of ['gbp', 'usd', 'eur', 'nzd', 'cad'] as const) {
      expect(packagePrice('sessions', c), c).toBe('Speak to us');
      expect(packagePrice('sessions', c), 'never a symbol nobody chose').not.toMatch(/[£€$]/);
    }
  });

  it('says whether a price is per person or for the business', () => {
    expect(packagePrice('seat')).toContain('a person a month');
    expect(packagePrice('sessions')).toContain('a month');
    expect(packagePrice('sessions'), 'it is not per person').not.toContain('a person');
  });
});

describe('where each one can actually be delivered', () => {
  /*
    Availability is NOT the same question as currency, and the first version of this conflated them.

    Four one-to-one sessions a month go down a video call, so a business in Leeds can buy them — they
    just pay in Australian dollars. A full day a week on site plus chairing the board meeting cannot
    be delivered to Leeds by somebody who is in Wangaratta on Tuesday. That is a fact about the
    calendar, not about money, and taking an order nobody can fill is worse than declining it.
  */
  it('sells the sessions anywhere in the world', () => {
    for (const country of ['AU', 'GB', 'US', 'NZ', 'DE', 'ZZ']) {
      expect(availableTo('sessions', country), country).toBe(true);
    }
    expect(unavailableBecause('sessions', 'GB')).toBeNull();
  });

  it('sells the on-site day in Australia only, and says why', () => {
    expect(availableTo('full_control', 'AU')).toBe(true);
    expect(availableTo('full_control', 'GB')).toBe(false);
    expect(availableTo('full_control', 'US')).toBe(false);

    const why = unavailableBecause('full_control', 'GB');
    expect(why).toContain('Australia only');
    expect(why, 'and it says what makes it so, rather than just refusing').toContain('on site');
  });

  /* Not knowing where somebody is must never be the reason they cannot buy something. */
  it('treats an unknown country as home rather than as a refusal', () => {
    expect(availableTo('full_control', null)).toBe(true);
    expect(availableTo('full_control', '')).toBe(true);
    expect(availableTo('full_control', undefined)).toBe(true);
  });

  it('never restricts a seat', () => {
    for (const country of ['GB', 'US', null]) {
      expect(availableTo('seat', country)).toBe(true);
      expect(availableTo('seat_training', country)).toBe(true);
    }
  });
});

describe('who sets it', () => {
  const action = readFileSync('src/app/admin/actions.ts', 'utf8');
  const page = readFileSync('src/app/admin/page.tsx', 'utf8');

  /*
    "these are controlled by the administrator."

    Two of the four could safely be self-serve. The other two are a share of one person's week, and
    a business that clicks its way into one has bought time that may not exist.
  */
  it('is on the admin screen, gated on the same allowlist as the cockpit', () => {
    expect(page).toContain('setPackage');
    expect(action).toContain('setPackage');
    expect(action).toContain('isAdminEmail');
  });

  it('will not write a package the product does not know', () => {
    expect(action).toContain('PACKAGE_KEYS.includes');
  });

  it('falls back to a plain seat rather than to nothing', () => {
    expect(packageOf(null)).toBe('seat');
    expect(packageOf('nonsense')).toBe('seat');
    expect(packageOf('full_control')).toBe('full_control');
  });

  it('says what each one actually is, on the screen that sets it', () => {
    for (const key of PACKAGE_KEYS) {
      expect(PACKAGES[key].label, key).toBeTruthy();
      expect(PACKAGES[key].what.length, key).toBeGreaterThan(40);
    }
    expect(page).toContain('PACKAGES');
  });

  /* Each package says what it includes in the words it was sold in, so nobody is surprised later. */
  it('describes what is actually delivered', () => {
    expect(PACKAGES.seat_training.what).toMatch(/assistant|\bAI\b/i);
    // One-to-one, and described by the sessions rather than by an hour — see tests/published-prices.
    expect(PACKAGES.sessions.what).toContain('Four one-to-one sessions a month');
    expect(PACKAGES.full_control.what).toContain('board meeting');
    expect(PACKAGES.full_control.what).toContain('full day a week');
  });
});
