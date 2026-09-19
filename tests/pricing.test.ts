import { describe, it, expect } from 'vitest';
import {
  SEAT_PRICES, currencyForCountry, digitRoot, seatLabel, everyPublishedSeatPrice,
  seatPrice, RULE_OF_EIGHT, pricesObeyingTheRule, STRIPE_PRICES, STRIPE_PRODUCTS,
  taxInclusive, type Currency,
} from '../src/lib/pricing';
import { seatKindFor } from '../src/lib/chart-seats';

describe('regional prices (BUILD_SPEC §8.1)', () => {
  /*
    Design 15, 19 September, replacing one flat seat with two: a leadership seat for anybody who
    leads people, a team seat for anybody who is led. Written out currency by currency rather than
    computed, because the whole point of this table is that a price is CHOSEN for a region and never
    converted — a test that derived them would agree with any arithmetic mistake the table made.
  */
  it('ARE EXACTLY THE PUBLISHED TABLE, all four prices in all six currencies', () => {
    const table = Object.fromEntries(Object.entries(SEAT_PRICES)
      .map(([c, p]) => [c, [p.leadership, p.leadershipWithAi, p.team, p.teamWithAi]]));
    expect(table).toEqual({
      aud: [134, 227, 17, 29],
      nzd: [180, 305, 23, 39],
      gbp: [88, 149, 11, 19],
      eur: [134, 227, 17, 29],
      usd: [134, 227, 17, 29],
      cad: [180, 305, 23, 39],
    });
  });

  /*
    ── Where the rule of 8 ended up ─────────────────────────────────────────────────────────────

    This test used to read: EVERY ONE OF THE TWENTY-FOUR REDUCES TO 8. It is the rule that caught
    design 15 before anything was published — it drew the AI seats at $227 and $29, neither of
    which reduces to 8, and Kris was given the nearest numbers that do and said *"224 and 26"*.

    Those were built and published. Then the Stripe products were created at **227** and **29**,
    and Kris's handoff of 19 September confirms them against the live account with the standing
    instruction that Stripe is now the source of truth.

    So the table matches Stripe, because a page showing 224 while a card is charged 227 is the one
    outcome here nobody recovers from. The rule is not deleted: `RULE_OF_EIGHT` is the frozen list
    of the three distinct amounts that still obey it, and this holds the set to exactly that. A new
    price that breaks the rule fails until somebody records it on purpose, and one moved back ONTO
    the rule fails too — which is the direction that matters if Stripe is ever corrected.
  */
  it('OBEY THE RULE OF 8 IN EXACTLY THE PLACES ON RECORD, and nowhere else', () => {
    expect(pricesObeyingTheRule()).toEqual([...RULE_OF_EIGHT]);
    for (const amount of RULE_OF_EIGHT) expect(digitRoot(amount), `${amount}`).toBe(8);

    const broken = Object.values(SEAT_PRICES)
      .flatMap(everyPublishedSeatPrice)
      .filter(a => digitRoot(a) !== 8);
    expect(broken.length, 'sixteen of the twenty-four').toBe(16);
    // The two design 15 was corrected to, which Stripe never carried. Neither may reappear.
    expect(Object.values(SEAT_PRICES).flatMap(everyPublishedSeatPrice)).not.toContain(224);
    expect(Object.values(SEAT_PRICES).flatMap(everyPublishedSeatPrice)).not.toContain(26);
  });

  /*
    ── One price object per seat, not six ───────────────────────────────────────────────────────

    Each row of the table is ONE Stripe price with AUD as its default currency and the other five
    as `currency_options` on it. That is why there are four ids here and not twenty-four, and it is
    why checkout has to PASS the currency rather than go looking for a price in it — which is what
    the old `seatPriceFor` did, and it could only ever have failed to find one.
  */
  it('AND ARE FOUR STRIPE PRICES, one per seat and tier, not one per currency', () => {
    expect(Object.keys(STRIPE_PRICES)).toEqual(
      ['leader_basic', 'leader_advanced', 'team_basic', 'team_advanced', 'training']);
    for (const [key, id] of Object.entries(STRIPE_PRICES)) {
      expect(id, `${key} is not a live price id`).toMatch(/^price_[A-Za-z0-9]+$/);
    }
    for (const [key, id] of Object.entries(STRIPE_PRODUCTS)) {
      expect(id, `${key} is not a live product id`).toMatch(/^prod_[A-Za-z0-9]+$/);
    }
    expect(new Set(Object.values(STRIPE_PRICES)).size, 'two seats sharing a price id').toBe(5);
  });

  /* A$134 and US$134 are the same number and not the same price. Stripe's defaults per currency. */
  it('and know which currencies include tax', () => {
    expect((['aud', 'nzd', 'gbp', 'eur'] as Currency[]).every(taxInclusive)).toBe(true);
    expect((['usd', 'cad'] as Currency[]).some(taxInclusive)).toBe(false);
  });

  /*
    The design describes leadership seats by TITLE — "team leader, supervisor, manager +". SPEC does
    not have to guess: it holds the chart, and the chart knows who has somebody reporting to them.
    A title is what a business calls a person; the chart is what they actually do.
  */
  /*
    ── One rule for which seat somebody is on, not two ──────────────────────────────────────────

    There were two exported functions called `seatKindFor`. This file's took a bare
    `hasDirectReports` and decided by the chart alone; `lib/chart-seats` takes the title as well
    and decides by either. They disagreed about a Site Supervisor whose crew has not been drawn
    yet — one called that a team seat and billed A$17 for somebody who leads people — and money
    rode on which one a caller happened to import. The richer one survives.
  */
  it('AND WHICH SEAT SOMEBODY IS ON IS DECIDED IN ONE PLACE, by the chart or the title', () => {
    expect(seatKindFor({ title: 'Electrician', hasDirectReports: true })).toBe('leadership');
    expect(seatKindFor({ title: 'Site Supervisor', hasDirectReports: false })).toBe('leadership');
    expect(seatKindFor({ title: 'Electrician', hasDirectReports: false })).toBe('team');
    expect(seatPrice('aud', 'leadership')).toBe(134);
    expect(seatPrice('aud', 'leadership', true)).toBe(227);
    expect(seatPrice('aud', 'team')).toBe(17);
    expect(seatPrice('aud', 'team', true)).toBe(29);
  });

  it('shows the local symbol', () => {
    expect((['aud', 'gbp', 'eur'] as Currency[]).map(c => seatLabel(c))).toEqual(['A$134', '£88', '€134']);
    expect(seatLabel('aud', 'team')).toBe('A$17');
  });
});

describe('the currency follows where the business is', () => {
  it('each priced region pays in its own currency', () => {
    expect(['AU', 'NZ', 'GB', 'US', 'CA', 'DE', 'ie'].map(currencyForCountry)).toEqual(['aud', 'nzd', 'gbp', 'usd', 'cad', 'eur', 'eur']);
  });

  it('anywhere else pays in US dollars; no country known falls back to Australia', () => {
    expect(currencyForCountry('SG')).toBe('usd');
    expect(currencyForCountry(null)).toBe('aud');
  });
});
