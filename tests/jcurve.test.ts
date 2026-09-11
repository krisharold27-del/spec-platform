import { describe, it, expect } from 'vitest';
import {
  daysBetween, phases, depth, comparison, points, HAND_BUILT_DISCOVERY_DAYS, type CurveInput,
} from '../src/lib/jcurve';

const AT = new Date('2026-09-11T00:00:00Z');

const input = (over: Partial<CurveInput> = {}): CurveInput => ({
  startDate: '2026-08-17T00:00:00Z',
  chartDrawnAt: '2026-08-18T00:00:00Z',
  kpisSetAt: '2026-08-21T00:00:00Z',
  firstFeedAt: '2026-08-19T00:00:00Z',
  firstLockedAt: '2026-09-05T00:00:00Z',
  closedMonths: [{ period: '2026-08', overall: 0.78 }],
  tier: 'advanced',
  ...over,
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-08-17T00:00:00Z', '2026-08-21T00:00:00Z')).toBe(4);
  });

  it('never goes negative', () => {
    expect(daysBetween('2026-09-01T00:00:00Z', '2026-08-01T00:00:00Z')).toBe(0);
  });

  it('returns nothing rather than a guess when a date is missing or unreadable', () => {
    expect(daysBetween(null, '2026-08-21T00:00:00Z')).toBeNull();
    expect(daysBetween('2026-08-17T00:00:00Z', null)).toBeNull();
    expect(daysBetween('not a date', '2026-08-21T00:00:00Z')).toBeNull();
  });
});

describe('phases', () => {
  it('runs discovery, linking, first close, climbing', () => {
    expect(phases(input(), AT).map(p => p.key)).toEqual(['discovery', 'linking', 'first_close', 'climbing']);
  });

  it('measures discovery from the start to the picture existing', () => {
    const d = phases(input(), AT)[0];
    expect(d.state).toBe('done');
    expect(d.days).toBe(4);
    expect(d.note).toContain('4 days');
  });

  // The dip lasts exactly as long as discovery does, so an unfinished one says so.
  it('keeps counting while discovery is still running', () => {
    const d = phases(input({ kpisSetAt: null }), AT)[0];
    expect(d.state).toBe('current');
    expect(d.days).toBe(25);
    expect(d.note).toContain('Still going');
  });

  it('names linking as the step that collapses discovery', () => {
    expect(phases(input(), AT)[1].note).toContain('collapses discovery');
  });

  // The honest consequence, stated rather than buried.
  it('tells a Basic business plainly that this is not a shallow J curve', () => {
    const l = phases(input({ tier: 'basic', firstFeedAt: null }), AT)[1];
    expect(l.note).toContain('not a shallow J curve');
    expect(l.note).toContain('complete way to run SPEC');
  });

  it('calls a first close a baseline rather than a result', () => {
    expect(phases(input({ firstLockedAt: null }), AT)[2].note).toContain('baseline, not a result');
  });

  it('waits rather than pretending, when nothing has started', () => {
    const p = phases(input({ kpisSetAt: null, firstFeedAt: null, firstLockedAt: null, closedMonths: [] }), AT);
    expect(p.map(x => x.state)).toEqual(['current', 'waiting', 'waiting', 'waiting']);
  });

  // A span it cannot compute is null; a date it actually knows is still reported. Discarding a
  // recorded milestone because its neighbour is missing would lose something true.
  it('reports no span for an undated milestone, but keeps the dates it does have', () => {
    const p = phases(input({ kpisSetAt: null }), AT);
    expect(p[1].days).toBeNull();
    expect(p[1].endedAt).toBe('2026-08-19T00:00:00Z');

    const nothingKnown = phases(input({ kpisSetAt: null, firstFeedAt: null, firstLockedAt: null }), AT);
    expect(nothingKnown[1].endedAt).toBeNull();
    expect(nothingKnown[2].endedAt).toBeNull();
  });
});

describe('depth', () => {
  it('is entirely in the dip before anything has closed', () => {
    expect(depth([])).toEqual({ monthsBelow: 0, lowest: null, recoveredAt: null, inDip: true });
  });

  it('counts the months closed below the standard before the first one at it', () => {
    const d = depth([
      { period: '2026-06', overall: 0.62 },
      { period: '2026-07', overall: 0.81 },
      { period: '2026-08', overall: 0.93 },
      { period: '2026-09', overall: 0.88 },
    ]);
    expect(d.monthsBelow).toBe(2);
    expect(d.recoveredAt).toBe('2026-08');
    expect(d.lowest).toBeCloseTo(0.62);
    expect(d.inDip).toBe(false);
  });

  it('stays in the dip while nothing has reached the standard', () => {
    const d = depth([{ period: '2026-08', overall: 0.7 }]);
    expect(d.inDip).toBe(true);
    expect(d.monthsBelow).toBe(1);
  });

  // An unscored month is an absence, not a low month — the same rule the whole engine runs on.
  it('ignores months with no score', () => {
    expect(depth([{ period: '2026-08', overall: null }])).toMatchObject({ monthsBelow: 0, lowest: null });
  });
});

describe('comparison', () => {
  it('compares this business against the stated assumption, not against another customer', () => {
    const c = comparison(input(), AT);
    expect(c.ours).toBe(4);
    expect(c.handBuilt).toBe(HAND_BUILT_DISCOVERY_DAYS);
    expect(c.saved).toBe(HAND_BUILT_DISCOVERY_DAYS - 4);
    expect(c.collapsed).toBe(true);
    expect(c.line).toContain('into execution instead of into finding out');
  });

  it('compares nothing while discovery is still running', () => {
    const c = comparison(input({ kpisSetAt: null }), AT);
    expect(c.saved).toBeNull();
    expect(c.line).toContain('nothing to compare yet');
  });

  // The collapse is caused by connectors. Claiming it without them would be the overclaim that
  // makes every other number on the page worth less.
  it('refuses to claim the collapse without a system feeding', () => {
    expect(comparison(input({ tier: 'basic', firstFeedAt: null }), AT).collapsed).toBe(false);
    expect(comparison(input({ tier: 'basic', firstFeedAt: null }), AT).line).toContain('not the collapse');
    expect(comparison(input({ firstFeedAt: null }), AT).line).toContain('The collapse comes when a system does');
  });

  // A page that can only ever congratulate the product is not a measurement.
  it('says so when discovery ran longer than the assumption', () => {
    const c = comparison(input({ startDate: '2026-01-01T00:00:00Z', kpisSetAt: '2026-08-21T00:00:00Z' }), AT);
    expect(c.saved).toBeLessThan(0);
    expect(c.line).toContain('something else held this up');
  });
});

describe('points', () => {
  // During discovery the business was not performing badly, it was invisible. Drawing an invented
  // dip would be making the product's case with a number nobody measured.
  it('draws the stretch before measurement as having no value at all', () => {
    const p = points(input());
    expect(p[0]).toEqual({ label: 'Before SPEC', value: null, beforeMeasurement: true });
    expect(p.filter(x => x.beforeMeasurement)).toHaveLength(1);
  });

  it('then draws each closed month on its own score', () => {
    const p = points(input({ closedMonths: [{ period: '2026-07', overall: 0.7 }, { period: '2026-08', overall: 0.9 }] }));
    expect(p.slice(1).map(x => [x.label, x.value])).toEqual([['2026-07', 0.7], ['2026-08', 0.9]]);
  });

  it('labels the single point Now for a business that has closed nothing', () => {
    expect(points(input({ firstLockedAt: null, closedMonths: [] }))).toEqual([
      { label: 'Now', value: null, beforeMeasurement: true },
    ]);
  });
});
