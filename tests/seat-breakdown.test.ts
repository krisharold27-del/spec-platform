import { describe, expect, it } from 'vitest';
import { seatBreakdown, seatBill } from '../src/lib/plan';

const FREE = 'free — the first leadership seat, the person who started the business';

describe('the bill, itemised', () => {
  it('JBI on 23 September: Kris free, Anthony a paid leadership seat, Janine a paid team seat', () => {
    expect(seatBreakdown({ leadership: 2, team: 1 }, 'aud')).toEqual([
      '1 leadership seat × A$134 = A$134',
      '1 team seat × A$17 = A$17',
      `1 leadership seat ${FREE}`,
    ]);
    // And it agrees with what is actually charged.
    expect(seatBill(3, 2, 'aud').monthlyCost).toBe(151);
  });

  it('names every paid team seat', () => {
    expect(seatBreakdown({ leadership: 2, team: 3 }, 'aud')).toEqual([
      '1 leadership seat × A$134 = A$134',
      '3 team seats × A$17 = A$51',
      `1 leadership seat ${FREE}`,
    ]);
  });

  it('a business of one leader pays nothing', () => {
    expect(seatBreakdown({ leadership: 1, team: 0 }, 'aud')).toEqual([`1 leadership seat ${FREE}`]);
  });
});
