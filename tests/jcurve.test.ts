import { describe, it, expect } from 'vitest';
import {
  daysBetween, phases, depth, comparison, points, drag, dragLine, namedItems, NAMED_ITEMS, HAND_BUILT_DISCOVERY_DAYS, type CurveInput,
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

  // Connecting a system starts on day one, not after discovery ends — and it normally FINISHES
  // first, which is the mechanism. Measured from the end of discovery it would report nought days
  // and read as missing data rather than as the product's central claim.
  it('measures linking from the day the business started', () => {
    const l = phases(input(), AT)[1];
    expect(l.days).toBe(2);
    expect(l.note).toContain('2 days in');
  });

  it('says so when the systems were feeding before the picture was finished', () => {
    expect(phases(input(), AT)[1].note).toContain('before the picture was finished');
  });

  it('does not claim that when the picture came first', () => {
    const l = phases(input({ kpisSetAt: '2026-08-18T00:00:00Z' }), AT)[1];
    expect(l.note).not.toContain('before the picture was finished');
    expect(l.note).toContain('collapses discovery');
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
    // Linking still has both of its own dates here, so it still has a span.
    expect(p[1].endedAt).toBe('2026-08-19T00:00:00Z');
    expect(phases(input({ kpisSetAt: null, firstFeedAt: null, firstLockedAt: null }), AT)[1].days).toBeNull();

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

describe('drag', () => {
  const m = (label: string, months: number, met: number, extra: Record<string, boolean> = {}) =>
    ({ label, months, met, ...extra });
  const role = (title: string, over: Partial<{ vacant: boolean; measures: number; scored: boolean }> = {}) =>
    ({ title, vacant: false, measures: 8, scored: true, ...over });

  const base = { measures: [], roles: [], closedMonths: 6 };

  it('names the measures nobody has met, and says why that matters', () => {
    const d = drag({ ...base, measures: [m('Gross profit', 6, 0), m('Revenue', 6, 3)] });
    const never = d.find(x => x.key === 'never_met')!;
    expect(never.count).toBe(1);
    expect(never.items).toEqual(['Gross profit']);
    expect(never.why).toContain('stops being read');
  });

  it('names the measures nobody could miss', () => {
    const d = drag({ ...base, measures: [m('Board pack on time', 6, 6)] });
    const always = d.find(x => x.key === 'never_missed')!;
    expect(always.items).toEqual(['Board pack on time']);
    expect(always.why).toContain('green light to every month');
  });

  // Under three closed months, "never met" is one bad quarter and "never missed" is a quiet start.
  it('will not read a run that is too short to mean anything', () => {
    const d = drag({ measures: [m('Gross profit', 2, 0), m('Revenue', 2, 2)], roles: [], closedMonths: 2 });
    expect(d.filter(x => x.key === 'never_met' || x.key === 'never_missed')).toEqual([]);
    expect(dragLine(d, 2)).toContain('not enough of its record');
  });

  it('counts a vacant role as something the business is carrying', () => {
    const d = drag({ ...base, roles: [role('Supervisor', { vacant: true }), role('Head of Ops')] });
    const vacant = d.find(x => x.key === 'vacant')!;
    expect(vacant.items).toEqual(['Supervisor']);
    expect(vacant.move).toContain('leaving it is the one that is not');
  });

  it('counts a scored role with nothing underneath it', () => {
    const d = drag({ ...base, roles: [role('Head of Growth', { measures: 0 })] });
    expect(d.find(x => x.key === 'unmeasured_role')!.items).toEqual(['Head of Growth']);
  });

  it('leaves a checklist role alone, since it is not scored', () => {
    const d = drag({ ...base, roles: [role('Apprentice', { measures: 0, scored: false })] });
    expect(d.find(x => x.key === 'unmeasured_role')).toBeUndefined();
  });

  it('reports an unproven target as unproven rather than as a fault', () => {
    const d = drag({ ...base, measures: [m('Utilisation', 6, 3, { unproven: true })] });
    const u = d.find(x => x.key === 'unproven')!;
    expect(u.why).toContain('not wrong');
    expect(u.move).toContain('keep closing months');
  });

  /**
   * The tone rule, enforced. The brief calls this change resistance and negativity, and those words
   * must never reach the screen — a leader told their people are negative argues with the claim
   * instead of fixing the cause. SPEC shows the cause and lets them draw the conclusion.
   */
  it('never names anybody’s attitude, anywhere', () => {
    const d = drag({
      measures: [m('Gross profit', 6, 0), m('Board pack', 6, 6), m('Utilisation', 6, 2, { outOfReach: true })],
      roles: [role('Supervisor', { vacant: true }), role('Head of Growth', { measures: 0 })],
      closedMonths: 6,
    });
    const words = d.map(x => `${x.what} ${x.why} ${x.move}`).join(' ') + dragLine(d, 6);
    expect(words).not.toMatch(/resistan|negativ|attitude|moral|engagement|buy-?in|mindset|culture/i);
  });

  it('says plainly when nothing in the record is holding the dip open', () => {
    const d = drag({ ...base, measures: [m('Gross profit', 6, 3)], roles: [role('Head of Ops')] });
    expect(d).toEqual([]);
    expect(dragLine(d, 6)).toContain('Nothing in the record is holding the dip open');
  });

  /**
   * A total is technically true and useless. "34 things" reads as an indictment and tells nobody
   * where to start, which is the opposite of what this section is for.
   */
  it('leads with the sharpest finding rather than a total', () => {
    const d = drag({ ...base, measures: [m('A', 6, 0), m('B', 6, 0)], roles: [role('S', { vacant: true })] });
    const line = dragLine(d, 6);
    expect(line).toContain('not been met once');
    expect(line).toContain('1 other thing is listed below');
    expect(line).not.toContain('3 things');
  });

  // Sorting by count would put the largest pile first and bury the sharpest finding underneath it.
  it('orders by consequence, not by how many there are', () => {
    const d = drag({
      measures: [
        m('A', 6, 6), m('B', 6, 6), m('C', 6, 6), m('D', 6, 6),
        m('E', 6, 3, { unproven: true }), m('F', 6, 0),
      ],
      roles: [role('S', { vacant: true })],
      closedMonths: 6,
    });
    expect(d.map(x => x.key)).toEqual(['never_met', 'vacant', 'never_missed', 'unproven']);
  });

  it('names a handful and counts the tail, rather than printing a wall', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Measure ${i}`);
    const { shown, more } = namedItems(many);
    expect(shown).toHaveLength(NAMED_ITEMS);
    expect(more).toBe(20 - NAMED_ITEMS);
    expect(namedItems(['one']).more).toBe(0);
  });
});
