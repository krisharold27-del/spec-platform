import { describe, it, expect } from 'vitest';
import {
  SEAT_PRICES, currencyForCountry, digitRoot, seatLabel, everyPublishedSeatPrice,
  seatPrice, RULE_OF_EIGHT, pricesObeyingTheRule, STRIPE_PRICES, STRIPE_PRODUCTS,
  RETIRED_STRIPE_PRICES, RETIRED_STRIPE_PRODUCTS, taxInclusive, type Currency,
} from '../src/lib/pricing';
import { seatKindFor } from '../src/lib/chart-seats';

describe('regional prices (BUILD_SPEC §8.1)', () => {
  /*
    Design 15, 19 September, replaced one flat seat with two: a leadership seat for anybody who
    leads people, a team seat for anybody who is led. A same-day Basic/Advanced split doubled that
    to four prices, lasted one session, and was retired 22 September — Kris, looking at the built
    result: *"i also feel like i don't want to have 2 different prices... make it simple."* One
    price per seat kind again. Written out currency by currency rather than computed, because the
    whole point of this table is that a price is CHOSEN for a region and never converted — a test
    that derived them would agree with any arithmetic mistake the table made.
  */
  it('ARE EXACTLY THE PUBLISHED TABLE, two prices in all six currencies', () => {
    const table = Object.fromEntries(Object.entries(SEAT_PRICES)
      .map(([c, p]) => [c, [p.leadership, p.team]]));
    expect(table).toEqual({
      aud: [134, 17],
      nzd: [180, 23],
      gbp: [88, 11],
      eur: [134, 17],
      usd: [134, 17],
      cad: [180, 23],
    });
  });

  /*
    ── Where the rule of 8 ended up ─────────────────────────────────────────────────────────────

    Kris asked, briefly, for AUD's team seat to move from $17 to $26 — the rule-of-8 number this
    table's own history already names — then, once the tier that prompted it was gone, said to
    leave it: *"oh yeah stay at 17 that sfine."* So the numbers are unchanged from Stripe's own,
    and `RULE_OF_EIGHT` is the frozen list of the amounts that obey it; a new price that breaks the
    rule fails until somebody records it on purpose, and one moved back ONTO the rule fails too —
    which is the direction that matters if a price is ever corrected.
  */
  it('OBEY THE RULE OF 8 IN EXACTLY THE PLACES ON RECORD, and nowhere else', () => {
    expect(pricesObeyingTheRule()).toEqual([...RULE_OF_EIGHT]);
    for (const amount of RULE_OF_EIGHT) expect(digitRoot(amount), `${amount}`).toBe(8);

    const broken = Object.values(SEAT_PRICES)
      .flatMap(everyPublishedSeatPrice)
      .filter(a => digitRoot(a) !== 8);
    expect(broken.length, 'six of the twelve').toBe(6);
  });

  /*
    ── One price object per seat, not six ───────────────────────────────────────────────────────

    Each row of the table is ONE Stripe price with AUD as its default currency and the other five
    as `currency_options` on it. That is why there are two live ids here (plus training) and not
    twelve, and it is why checkout has to PASS the currency rather than go looking for a price in
    it — which is what the old `seatPriceFor` did, and it could only ever have failed to find one.
  */
  it('AND ARE TWO STRIPE SEAT PRICES, one per seat kind, not one per currency', () => {
    expect(Object.keys(STRIPE_PRICES)).toEqual(['leader', 'team', 'training']);
    for (const [key, id] of Object.entries(STRIPE_PRICES)) {
      expect(id, `${key} is not a live price id`).toMatch(/^price_[A-Za-z0-9]+$/);
    }
    for (const [key, id] of Object.entries(STRIPE_PRODUCTS)) {
      expect(id, `${key} is not a live product id`).toMatch(/^prod_[A-Za-z0-9]+$/);
    }
  });

  /*
    The Advanced ids are still live in Stripe — nobody archived them — but no code path uses them
    any more. Written down so nobody reads a bare price id from an old commit and wires it back in
    without reading why it stopped being used. See the note on `SEAT_PRICES`.
  */
  it('AND KEEP THE RETIRED ADVANCED IDS ON RECORD, unreachable from anywhere else', () => {
    for (const [key, id] of Object.entries(RETIRED_STRIPE_PRICES)) {
      expect(id, `${key} is not a live price id`).toMatch(/^price_[A-Za-z0-9]+$/);
    }
    for (const [key, id] of Object.entries(RETIRED_STRIPE_PRODUCTS)) {
      expect(id, `${key} is not a live product id`).toMatch(/^prod_[A-Za-z0-9]+$/);
    }
    expect(Object.values(STRIPE_PRICES)).not.toEqual(expect.arrayContaining(Object.values(RETIRED_STRIPE_PRICES)));
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
    expect(seatPrice('aud', 'team')).toBe(17);
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
