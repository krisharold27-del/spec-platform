import { describe, it, expect } from 'vitest';
import { SEAT_PRICES, currencyForCountry, digitRoot, seatLabel, type Currency } from '../src/lib/pricing';

describe('regional prices (BUILD_SPEC §8.1)', () => {
  it('are exactly the published table', () => {
    const table = Object.fromEntries(Object.entries(SEAT_PRICES).map(([c, p]) => [c, [p.seat, p.withTraining]]));
    expect(table).toEqual({ aud: [26, 44], nzd: [35, 53], gbp: [17, 26], eur: [26, 44], usd: [26, 44], cad: [35, 53] });
  });

  it('every price reduces to 8', () => {
    for (const p of Object.values(SEAT_PRICES)) {
      expect(digitRoot(p.seat)).toBe(8);
      expect(digitRoot(p.withTraining)).toBe(8);
    }
  });

  it('shows the local symbol', () => {
    expect((['aud', 'gbp', 'eur'] as Currency[]).map(seatLabel)).toEqual(['A$26', '£17', '€26']);
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
