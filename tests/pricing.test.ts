import { describe, it, expect } from 'vitest';
import {
  SEAT_PRICES, currencyForCountry, digitRoot, seatLabel, everyPublishedSeatPrice,
  seatKindFor, seatPrice, type Currency,
} from '../src/lib/pricing';

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
      aud: [134, 224, 17, 26],
      nzd: [179, 296, 26, 44],
      gbp: [89, 152, 8, 17],
      eur: [134, 224, 17, 26],
      usd: [134, 224, 17, 26],
      cad: [179, 296, 26, 44],
    });
  });

  /*
    The rule that caught design 15 before anything was published. It draws the AI seats at $227 and
    $29; neither reduces to 8. Kris, given the nearest numbers that do: *"224 and 26"*.

    Every price now, not the two it used to check — the table grew from twelve numbers to
    twenty-four, and a rule that only covers half a table is how the other half goes out wrong.
  */
  it('EVERY ONE OF THE TWENTY-FOUR REDUCES TO 8', () => {
    for (const [c, p] of Object.entries(SEAT_PRICES)) {
      for (const amount of everyPublishedSeatPrice(p)) {
        expect(digitRoot(amount), `${c} publishes ${amount}`).toBe(8);
      }
    }
  });

  /*
    The design describes leadership seats by TITLE — "team leader, supervisor, manager +". SPEC does
    not have to guess: it holds the chart, and the chart knows who has somebody reporting to them.
    A title is what a business calls a person; the chart is what they actually do.
  */
  it('AND WHICH SEAT SOMEBODY IS ON COMES FROM THE CHART, NOT THEIR TITLE', () => {
    expect(seatKindFor(true)).toBe('leadership');
    expect(seatKindFor(false)).toBe('team');
    expect(seatPrice('aud', 'leadership')).toBe(134);
    expect(seatPrice('aud', 'leadership', true)).toBe(224);
    expect(seatPrice('aud', 'team')).toBe(17);
    expect(seatPrice('aud', 'team', true)).toBe(26);
  });

  it('shows the local symbol', () => {
    expect((['aud', 'gbp', 'eur'] as Currency[]).map(c => seatLabel(c))).toEqual(['A$134', '£89', '€134']);
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
