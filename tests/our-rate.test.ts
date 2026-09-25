import { describe, it, expect } from 'vitest';
import {
  ENOUGH_QUOTES, TOO_MANY, TOO_FEW, readRate, ASK, ACTIONS, TEST_DAYS, testReading,
  THIN_MARGIN, readType, flagged, PRICE_FROM, draftPrice, draftLine,
  ESTIMATOR_CHECKS_AND_SENDS,
  type RateFacts, type ByType,
} from '../src/lib/our-rate';

const facts = (over: Partial<RateFacts> = {}): RateFacts => ({
  ourCents: 9_500,
  market: [
    { who: 'A', cents: 10_500, source: 'their website', seenAt: '2026-09-01' },
    { who: 'B', cents: 11_000, source: 'a quote we lost', seenAt: '2026-09-10' },
    { who: 'C', cents: 10_000, source: 'their website', seenAt: '2026-09-12' },
  ],
  won: 18,
  lost: 2,
  ...over,
});

describe('both comparisons, because either alone misleads', () => {
  it('says so when no rate is set', () => {
    expect(readRate(facts({ ourCents: null })).verdict).toBe('no_rate');
  });

  it('will not read a win rate from an anecdote', () => {
    const r = readRate(facts({ won: 4, lost: 2 }));
    expect(r.verdict).toBe('not_enough');
    expect(r.winRate).toBeNull();
    expect(r.says).toContain('anecdote');
    expect(ENOUGH_QUOTES).toBe(10);
  });

  it('calls winning nearly everything what it is', () => {
    const r = readRate(facts());
    expect(r.verdict).toBe('cheap');
    /* Not a triumph — the point of the whole feature. */
    expect(r.says).toContain('you are the cheap option');
    expect(r.ask).toBe(ASK);
  });

  it('does not conclude "too dear" from a low win rate alone', () => {
    const r = readRate(facts({ won: 2, lost: 18 }));
    expect(r.verdict).toBe('dear');
    expect(r.says).toContain('different answers');
  });

  it('is quiet when there is nothing to say', () => {
    const r = readRate(facts({ won: 10, lost: 10, ourCents: 10_400 }));
    expect(r.verdict).toBe('in_line');
    expect(r.ask).toBeNull();
  });

  it('admits when it only has half the picture', () => {
    const r = readRate(facts({ market: [] }));
    expect(r.marketCents).toBeNull();
    expect(r.says).toContain('only half the picture');
  });

  it('uses the middle rate, so one outlier does not move it', () => {
    const r = readRate(facts({
      market: [
        { who: 'A', cents: 10_000, source: 's', seenAt: 'x' },
        { who: 'B', cents: 10_200, source: 's', seenAt: 'x' },
        { who: 'C', cents: 40_000, source: 's', seenAt: 'x' },
      ],
    }));
    expect(r.marketCents).toBe(10_200);
  });

  it('asks rather than tells', () => {
    expect(ASK).toBe('Is the market wrong, or are we?');
    expect(ACTIONS.map(a => a.key)).toEqual(['hold', 'test']);
    expect(ACTIONS[0].is).toContain('recorded');
  });
});

describe('testing a rate', () => {
  const test = { fromCents: 9_500, toCents: 11_000, startedAt: '2026-09-20T00:00:00Z', won: 3, lost: 1 };
  const NOW = new Date('2026-09-25T00:00:00Z');

  it('will not read anything mid-test', () => {
    expect(testReading(test, NOW)).toContain('too early to read');
  });

  it('says so when thirty days decided almost nothing', () => {
    /* Changing a rate on four quotes is changing it on noise. */
    const done = { ...test, startedAt: '2026-08-01T00:00:00Z' };
    expect(testReading(done, NOW)).toContain('worth running it longer');
  });

  it('gives the number to decide on when there is one', () => {
    const done = { ...test, startedAt: '2026-08-01T00:00:00Z', won: 8, lost: 6 };
    expect(testReading(done, NOW)).toContain('57% of 14 quotes won');
    expect(TEST_DAYS).toBe(30);
  });
});

describe('winning the wrong work', () => {
  const row = (over: Partial<ByType> = {}): ByType =>
    ({ jobType: 'switchboards', won: 18, lost: 2, marginPct: 40, ...over });

  it('says nothing about a type with too few decided', () => {
    expect(readType(row({ won: 3, lost: 2 }), 0.5).flag).toBeNull();
  });

  it('flags a lot of work for very little', () => {
    const r = readType(row({ marginPct: 9 }), 0.5);
    expect(r.flag).toBe('low_margin_only');
    expect(r.says).toContain('crowding out the jobs that pay');
    expect(THIN_MARGIN).toBe(15);
  });

  it('flags winning almost everything at a decent margin as worth testing', () => {
    expect(readType(row(), 0.5).flag).toBe('too_cheap');
  });

  it('flags losing one type much more than the rest', () => {
    const r = readType(row({ won: 2, lost: 18 }), 0.6);
    expect(r.flag).toBe('losing_this_one');
    expect(r.says).toContain('Something about how this one is priced');
  });

  it('only returns the ones worth saying', () => {
    const rows = [row(), row({ jobType: 'lighting', won: 10, lost: 10 })];
    expect(flagged(rows, 0.5).map(f => f.row.jobType)).toEqual(['switchboards']);
  });
});

describe('every lead priced before anybody asks', () => {
  it('uses a pre-build when one covers the work', () => {
    const d = draftPrice({
      jobType: 'switchboard', pastHours: [6, 7, 8], hourlyCents: 11_000,
      materialsCents: 40_000, prebuild: { name: 'Switchboard upgrade', cents: 180_000 },
    });
    expect(d.cents).toBe(180_000);
    expect(d.from).toContain('pre-build');
  });

  it('prices from the median of past jobs, not the mean', () => {
    /* One shutdown that ran three days would drag every future quote with it. */
    const d = draftPrice({
      jobType: 'switchboard', pastHours: [6, 6, 7, 7, 40], hourlyCents: 10_000,
      materialsCents: 0, prebuild: null,
    });
    expect(d.cents).toBe(70_000);
    expect(d.from).toContain('median 7 hours');
  });

  it('refuses to price with no rate', () => {
    const d = draftPrice({ jobType: 'x', pastHours: [6], hourlyCents: null, materialsCents: 0, prebuild: null });
    expect(d.cents).toBeNull();
    expect(draftLine(d)).toContain('no hourly rate is set');
  });

  it('refuses to price with no history', () => {
    const d = draftPrice({ jobType: 'solar', pastHours: [], hourlyCents: 11_000, materialsCents: 0, prebuild: null });
    expect(d.cents).toBeNull();
    expect(draftLine(d)).toContain('no past solar jobs');
  });

  it('warns when the history is thin rather than pretending it is not', () => {
    const d = draftPrice({ jobType: 'x', pastHours: [6, 7], hourlyCents: 10_000, materialsCents: 0, prebuild: null });
    expect(d.thin).toBe(true);
    expect(draftLine(d)).toContain('worth pricing this one properly');
  });

  it('never prices off more than the recent window', () => {
    const many = Array.from({ length: 200 }, () => 8);
    const d = draftPrice({ jobType: 'x', pastHours: many, hourlyCents: 10_000, materialsCents: 0, prebuild: null });
    expect(d.jobs).toBe(PRICE_FROM);
  });

  it('shows its working, so an estimator can disagree usefully', () => {
    const d = draftPrice({ jobType: 'switchboard', pastHours: Array(38).fill(6.5), hourlyCents: 10_000, materialsCents: 0, prebuild: null });
    expect(draftLine(d)).toContain('38 past switchboard jobs');
    expect(draftLine(d)).toContain('Check it and send it');
    expect(ESTIMATOR_CHECKS_AND_SENDS).toContain('quoting today');
  });
});
