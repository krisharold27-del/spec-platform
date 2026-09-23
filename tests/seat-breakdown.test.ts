import { describe, expect, it } from 'vitest';
import { seatBreakdown, seatBill } from '../src/lib/plan';

describe('the bill, itemised', () => {
  it("JBI on 23 September: two leaders and Janine's team seat, which is the free one", () => {
    const lines = seatBreakdown({ leadership: 2, team: 1 }, 'aud');
    expect(lines).toEqual([
      '2 leadership seats × A$134 = A$268',
      '1 team seat free — the first seat is free, and it comes off a team seat first',
    ]);
    // And it agrees with what is actually charged.
    expect(seatBill(3, 2, 'aud').monthlyCost).toBe(268);
  });

  it('names paid team seats once there is more than one', () => {
    expect(seatBreakdown({ leadership: 2, team: 3 }, 'aud')).toEqual([
      '2 leadership seats × A$134 = A$268',
      '2 team seats × A$17 = A$34',
      '1 team seat free — the first seat is free, and it comes off a team seat first',
    ]);
  });

  it('a business of leaders only gets a leadership seat free', () => {
    expect(seatBreakdown({ leadership: 1, team: 0 }, 'aud')).toEqual([
      '1 leadership seat free — the first seat is free, and it comes off a team seat first',
    ]);
  });
});
