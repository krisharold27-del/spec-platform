import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PACKAGES, PACKAGE_KEYS, packageOf, monthlyCostOf, packagePrice, currencyFor,
  availableTo, unavailableBecause, digitRoot, SEAT_PRICES, HOME_CURRENCY, everyPublishedSeatPrice,
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

  it('charges what he said', () => {
    expect(PACKAGES.seat.aud).toBe(SEAT_PRICES.aud.leadership);
    expect(PACKAGES.seat_training.aud).toBe(SEAT_PRICES.aud.leadershipWithAi);
    /*
      A$1,007 → A$1,502 on 18 September. Kris: *"One-to-one is the premium format, and the old
      number priced it like a freelancer hour ($250/hr) — too cheap for training delivered at your
      level."* Four sessions at 1007 divided out to about A$250 each, which is what an hour of
      somebody's time costs rather than what this is. 1+5+0+2 = 8, so the rule still holds.
    */
    expect(PACKAGES.sessions.aud).toBe(1502);
    expect(PACKAGES.full_control.aud).toBe(20888);
  });

  /*
    The rule of 8, which caught this the day the prices were set.

    1008 was the number first given and it reduces to 9. Every other published price in SPEC reduces
    to 8 — it is in designs/the-rules.md — so it was worth asking rather than either silently
    shipping a price that broke the rule or silently changing a price he had chosen. He said 1007.
  */
  it('every published price still reduces to 8', () => {
    for (const key of PACKAGE_KEYS) {
      expect(digitRoot(PACKAGES[key].aud), `${key} is ${PACKAGES[key].aud}`).toBe(8);
    }
    for (const [c, p] of Object.entries(SEAT_PRICES)) {
      for (const amount of everyPublishedSeatPrice(p)) {
        expect(digitRoot(amount), `${c} publishes ${amount}`).toBe(8);
      }
    }
    expect(digitRoot(1008), 'the number that started this').toBe(9);
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
      expect(monthlyCostOf('full_control', 'aud', seats), `${seats} people`).toBe(20888);
    }
  });

  /*
    `seat_training` is the AI seat now, not SPEC's training material — design 15 retired that seat,
    which had been published for months and was never sellable. The KEY is unchanged because it is
    stored on businesses and renaming it is a migration; see the note in lib/pricing.
  */
  it('uses the AI price for the AI package, not the plain seat one', () => {
    expect(monthlyCostOf('seat_training', 'aud', 1)).toBe(224);
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

  it('quotes the other two in Australian dollars, wherever the business is', () => {
    for (const c of ['gbp', 'usd', 'eur', 'nzd', 'cad'] as const) {
      expect(currencyFor('sessions', c), c).toBe(HOME_CURRENCY);
      expect(currencyFor('full_control', c), c).toBe(HOME_CURRENCY);
    }
    expect(packagePrice('sessions', 'gbp')).toContain('A$');
    expect(packagePrice('sessions', 'gbp'), 'never a pound sign on a price nobody chose').not.toContain('£');
  });

  it('says whether a price is per person or for the business', () => {
    expect(packagePrice('seat')).toContain('a person a month');
    expect(packagePrice('full_control')).toContain('a month');
    expect(packagePrice('full_control'), 'it is not per person').not.toContain('a person');
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
