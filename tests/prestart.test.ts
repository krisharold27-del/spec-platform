import { describe, it, expect } from 'vitest';
import {
  CHECKS, checkByKey, emptyPreStart, isComplete, faults, needsNote, readDay,
  tellSupervisor, mustDoOne, onTime, onTimeRate, WHY_IT_LOCKS,
  type PreStart,
} from '../src/lib/prestart';

const done = (marks: PreStart['marks'], note = ''): PreStart => ({
  ...emptyPreStart('2026-09-25', 'Hemi Walker'),
  marks, note, doneAt: '2026-09-25T06:10:00Z',
});

const allOk = () => done({ vehicle: 'ok', gear: 'ok', testers: 'ok', licence: 'ok' });

describe('the four checks', () => {
  it('is four, and each says what to look at', () => {
    expect(CHECKS).toHaveLength(4);
    for (const c of CHECKS) expect(c.look.length, c.key).toBeGreaterThan(15);
  });

  it('knows which two SPEC can already answer', () => {
    expect(CHECKS.filter(c => c.prefilled).map(c => c.key)).toEqual(['testers', 'licence']);
  });

  it('looks one up', () => {
    expect(checkByKey('vehicle')?.label).toBe('The ute');
  });
});

describe('no pre-start, no jobs', () => {
  it('locks the day when nothing is marked', () => {
    const r = readDay(null);
    expect(r.mayWork).toBe(false);
    expect(r.state).toBe('not_done');
    expect(r.says).toContain('under a minute');
  });

  it('locks a half-finished one', () => {
    expect(readDay(done({ vehicle: 'ok' })).mayWork).toBe(false);
  });

  it('locks one that was filled in and never submitted', () => {
    const p: PreStart = { ...allOk(), doneAt: null };
    expect(isComplete(p)).toBe(true);
    expect(readDay(p).mayWork).toBe(false);
  });

  it('opens the day when everything is OK', () => {
    const r = readDay(allOk());
    expect(r.mayWork).toBe(true);
    expect(r.state).toBe('clear');
  });
});

describe('a fault holds the jobs, and the supervisor is told', () => {
  const bad = () => done({ vehicle: 'not_ok', gear: 'ok', testers: 'ok', licence: 'ok' }, 'Front left tyre is down to the wear bars.');

  it('holds rather than ending the day', () => {
    const r = readDay(bad());
    expect(r.mayWork).toBe(false);
    expect(r.state).toBe('held');
    /* The point: the tech does not have to chase anybody. */
    expect(r.says).toContain('do not have to ring');
  });

  it('tells the supervisor what and who, in their words', () => {
    const told = tellSupervisor(bad())!;
    expect(told).toContain('Hemi Walker');
    expect(told).toContain('wear bars');
  });

  it('says nothing when there is nothing to say', () => {
    expect(tellSupervisor(allOk())).toBeNull();
  });

  it('opens the day once somebody has cleared it', () => {
    const p: PreStart = { ...bad(), clearedAt: '2026-09-25T06:20:00Z', clearedBy: 'Tom Reyes' };
    const r = readDay(p);
    expect(r.mayWork).toBe(true);
    expect(r.state).toBe('cleared');
    /* Cleared is not erased — the fault stays on the record. */
    expect(r.says).toContain('still on the record');
  });

  it('wants words with a fault', () => {
    expect(needsNote(done({ vehicle: 'not_ok', gear: 'ok', testers: 'ok', licence: 'ok' }))).toBe(true);
    expect(needsNote(bad())).toBe(false);
    expect(needsNote(allOk())).toBe(false);
  });

  it('names every fault, not just the first', () => {
    const p = done({ vehicle: 'not_ok', gear: 'not_ok', testers: 'ok', licence: 'ok' }, 'Both');
    expect(faults(p)).toHaveLength(2);
    expect(readDay(p).says).toContain('and');
  });
});

describe('who has to do one', () => {
  it('is about driving a company vehicle, not about being a tech', () => {
    expect(mustDoOne({ drivesCompanyVehicle: true })).toBe(true);
    expect(mustDoOne({ drivesCompanyVehicle: false })).toBe(false);
  });
});

describe('on time means before the first job', () => {
  it('counts a pre-start done before the job', () => {
    expect(onTime(allOk(), '2026-09-25T07:00:00Z')).toBe(true);
  });

  it('counts one done after it as late', () => {
    expect(onTime(allOk(), '2026-09-25T06:00:00Z')).toBe(false);
  });

  it('says nothing about somebody with no job booked', () => {
    expect(onTime(allOk(), null)).toBeNull();
  });

  it('counts a missing pre-start as not on time', () => {
    expect(onTime(null, '2026-09-25T07:00:00Z')).toBe(false);
  });

  it('will not report a rate it cannot measure', () => {
    /* A KPI SPEC cannot read is not a KPI of zero — nobody had a job. */
    const r = onTimeRate([{ preStart: allOk(), firstJobAt: null }]);
    expect(r.percent).toBeNull();
    expect(r.says).toContain('nothing to measure');
  });

  it('reports the rate when there is one', () => {
    const r = onTimeRate([
      { preStart: allOk(), firstJobAt: '2026-09-25T07:00:00Z' },
      { preStart: null, firstJobAt: '2026-09-25T07:00:00Z' },
    ]);
    expect(r.percent).toBe(50);
    expect(r.of).toBe(2);
  });
});

describe('what is locked', () => {
  it('is the jobs, not the phone and not the clock', () => {
    expect(WHY_IT_LOCKS).toContain('not your phone');
    expect(WHY_IT_LOCKS).toContain('not your clock');
  });
});
