import { describe, it, expect } from 'vitest';
import {
  stateOf, blocks, stateNote, blockingReasons, daysUntil, EXPIRING_WITHIN_DAYS,
  awayOn, upcoming, impactOf, leaveLine, leaveKindLabel,
} from '../src/lib/obligations';

const AT = new Date('2026-06-01T09:00:00Z');
const inDays = (n: number) => new Date(AT.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe('documents and obligations', () => {
  it('counts days to an expiry, and past it', () => {
    expect(daysUntil(inDays(10), AT)).toBe(10);
    expect(daysUntil(inDays(-3), AT)).toBe(-3);
  });

  it('treats no expiry as current — a signed contract does not expire', () => {
    expect(stateOf({ expiresAt: null }, AT)).toBe('current');
    expect(stateNote({ expiresAt: null }, AT)).toBe('Does not expire.');
  });

  it('is current well ahead, expiring inside the window, expired after', () => {
    expect(stateOf({ expiresAt: inDays(90) }, AT)).toBe('current');
    expect(stateOf({ expiresAt: inDays(EXPIRING_WITHIN_DAYS - 1) }, AT)).toBe('expiring');
    expect(stateOf({ expiresAt: inDays(-1) }, AT)).toBe('expired');
  });

  /*
    The rule the gate turns on. A licence good until Friday is good until Friday — blocking early
    would teach everyone to ignore the warning, and then the real expiry gets ignored too.
  */
  it('does not block while something is merely expiring', () => {
    expect(blocks(stateOf({ expiresAt: inDays(3) }, AT))).toBe(false);
    expect(stateNote({ expiresAt: inDays(3) }, AT)).toMatch(/Still valid/);
  });

  it('still counts the last day as valid', () => {
    expect(stateOf({ expiresAt: inDays(0) }, AT)).toBe('expiring');
    expect(blocks(stateOf({ expiresAt: inDays(0) }, AT))).toBe(false);
    expect(stateNote({ expiresAt: inDays(0) }, AT)).toMatch(/does not block until tomorrow/);
  });

  it('blocks once expired, and says why', () => {
    expect(blocks(stateOf({ expiresAt: inDays(-1) }, AT))).toBe(true);
    expect(stateNote({ expiresAt: inDays(-1) }, AT)).toMatch(/blocks Clear to Work/);
  });

  /*
    Assuming clear because nobody checked is exactly the failure the gate exists to prevent, so an
    unreadable date is treated as no evidence rather than shrugged off.
  */
  it('treats an unreadable date as nothing recorded, and blocks on it', () => {
    expect(stateOf({ expiresAt: 'sometime next year' }, AT)).toBe('missing');
    expect(blocks('missing')).toBe(true);
  });

  it('reports blocking reasons in the gate’s own words, and nothing when nothing blocks', () => {
    const reasons = blockingReasons([
      { what: 'White card', expiresAt: inDays(-5), who: 'Tom' },
      { what: 'First aid', expiresAt: inDays(5), who: 'Tom' },
      { what: 'Police check', expiresAt: 'unknown', who: 'Tom' },
      { what: 'Contract', expiresAt: null, who: 'Tom' },
    ], AT);
    expect(reasons).toEqual(['White card has expired', 'Police check has nothing recorded']);
    expect(blockingReasons([{ what: 'Contract', expiresAt: null, who: 'Tom' }], AT)).toEqual([]);
  });
});

describe('leave and availability', () => {
  const approved = { who: 'Ann', kind: 'annual', fromDate: inDays(2), toDate: inDays(6), state: 'approved' };

  it('names the kind in the words a person uses', () => {
    expect(leaveKindLabel('annual')).toBe('Annual leave');
    expect(leaveKindLabel('nonsense')).toBe('Leave');
  });

  it('counts somebody away only while the leave is approved', () => {
    const day = new Date(`${inDays(3)}T09:00:00Z`);
    expect(awayOn(approved, day)).toBe(true);
    expect(awayOn({ ...approved, state: 'requested' }, day)).toBe(false);
  });

  it('counts the first and last day as days off', () => {
    expect(awayOn(approved, new Date(`${inDays(2)}T09:00:00Z`))).toBe(true);
    expect(awayOn(approved, new Date(`${inDays(6)}T09:00:00Z`))).toBe(true);
    expect(awayOn(approved, new Date(`${inDays(7)}T09:00:00Z`))).toBe(false);
  });

  it('keeps leave in the list until its last day has passed', () => {
    expect(upcoming({ toDate: inDays(0) }, AT)).toBe(true);
    expect(upcoming({ toDate: inDays(-1) }, AT)).toBe(false);
  });

  /*
    The honest answer is usually "nothing much". A list that flags every day off as a risk gets
    skimmed, and then the fortnight that mattered gets skimmed with it.
  */
  it('says plainly when an absence costs nothing much', () => {
    expect(impactOf({ ...approved, toDate: approved.fromDate })).toMatch(/usually keeps/);
  });

  it('calls an uncovered stretch a gap in the chart', () => {
    expect(impactOf(approved)).toMatch(/gap in the chart/);
  });

  it('stops calling it a gap once somebody covers it', () => {
    expect(impactOf({ ...approved, coveredBy: 'Dane' })).toBe('5 days, covered by Dane.');
  });

  it('says nobody is booked away rather than showing a zero', () => {
    expect(leaveLine([], AT)).toBe('Nobody is booked away.');
    expect(leaveLine([{ ...approved, state: 'requested' }], AT)).toBe('Nobody is booked away.');
  });

  it('separates who is away today from who is booked ahead', () => {
    expect(leaveLine([approved], AT)).toBe('1 booked ahead, nobody away today.');
    const nowAway = { ...approved, fromDate: inDays(-1), toDate: inDays(1) };
    expect(leaveLine([nowAway], AT)).toBe('1 away today, 1 booked ahead.');
  });
});
