import { describe, it, expect } from 'vitest';
import {
  CHECKS, checkByKey, readRun, whyNotApprovable, APPROVER_ROLE,
  ratesReady, isSet, pending, changeLine, oddities, LONG_DAY_HOURS,
  type CheckResult, type LegalRate, type RateChange,
} from '../src/lib/pay-run';
import { gentle, ASK } from '../src/lib/gentle';

const allPassed: CheckResult[] = CHECKS.map(c => ({ key: c.key, state: 'passed', says: 'ok' }));

describe('the seven checks', () => {
  it('is seven, and each says what it costs to skip', () => {
    expect(CHECKS).toHaveLength(7);
    for (const c of CHECKS) {
      expect(c.ifSkipped.length, c.key).toBeGreaterThan(30);
    }
  });

  it('looks one up', () => {
    expect(checkByKey('super')?.label).toBe('Super');
  });
});

describe('a pay run cannot be approved until all seven pass', () => {
  it('approves when every one passes', () => {
    const r = readRun(allPassed);
    expect(r.mayApprove).toBe(true);
    expect(r.says).toContain(APPROVER_ROLE);
    expect(whyNotApprovable(r)).toBeNull();
  });

  it('refuses on a single failure', () => {
    const r = readRun(allPassed.map(c => c.key === 'super' ? { ...c, state: 'failed' as const, says: 'Super is on the wrong earnings for two people.' } : c));
    expect(r.mayApprove).toBe(false);
    expect(whyNotApprovable(r)).toContain('wrong earnings');
  });

  it('treats a check that never ran exactly as a failure', () => {
    /*
      The important one. A check that is silently missing — never wired up, or crashed — must not
      read as neutral, or the guard stops guarding and nothing says so.
    */
    const r = readRun(allPassed.filter(c => c.key !== 'stp'));
    expect(r.mayApprove).toBe(false);
    expect(r.notRun.map(x => x.key)).toEqual(['stp']);
    expect(whyNotApprovable(r)).toContain('has not run');
  });

  it('refuses everything when nothing has run', () => {
    const r = readRun([]);
    expect(r.passed).toBe(0);
    expect(r.notRun).toHaveLength(7);
    expect(r.mayApprove).toBe(false);
  });

  it('always reports all seven, whatever it was handed', () => {
    expect(readRun([{ key: 'hours', state: 'passed', says: 'ok' }]).results).toHaveLength(7);
  });

  it('names the first thing to fix rather than saying checks are incomplete', () => {
    const r = readRun(allPassed.map(c => c.key === 'award'
      ? { ...c, state: 'failed' as const, says: 'Sione turned 19 in March and is still on year 2.', who: 'Sione Tui' }
      : c));
    expect(whyNotApprovable(r)).toContain('Sione Tui');
  });
});

describe('rates are told, never guessed', () => {
  const rate = (key: string, value: number | null, source: string | null): LegalRate =>
    ({ key, label: key, value, unit: 'percent', source, checkedAt: null });

  it('is not set without a source, however plausible the number', () => {
    expect(isSet(rate('super', 12, null))).toBe(false);
    expect(isSet(rate('super', 12, 'ATO, checked 1 Jul 2026'))).toBe(true);
  });

  it('will not let payroll run on rates nobody has set', () => {
    const r = ratesReady([rate('super', null, null), rate('overtimeAfter', 38, 'Award')]);
    expect(r.ready).toBe(false);
    expect(r.says).toContain('will not guess');
  });

  it('is ready when everything has a number and a source', () => {
    expect(ratesReady([rate('super', 12, 'ATO'), rate('overtimeAfter', 38, 'Award')]).ready).toBe(true);
  });
});

describe('a Fair Work change is accepted, never applied quietly', () => {
  const change: RateChange = { key: 'super', label: 'Super guarantee rate', from: 12, to: 12.5, effective: '2026-07-01', source: 'ATO', acceptedAt: null };

  it('waits for the business to accept it', () => {
    expect(pending([change])).toHaveLength(1);
    expect(pending([{ ...change, acceptedAt: '2026-06-20' }])).toHaveLength(0);
  });

  it('says where it came from and what it does', () => {
    const line = changeLine(change);
    expect(line).toContain('12 → 12.5');
    expect(line).toContain('ATO');
  });

  it('copes with a rate that was never set before', () => {
    expect(changeLine({ ...change, from: null })).toContain('not set →');
  });
});

describe('odd is asked, not blocked', () => {
  it('raises a gentle prompt for a long day', () => {
    const found = oddities([
      { who: 'Hemi', date: '2026-09-22', hours: 14 },
      { who: 'Tom', date: '2026-09-22', hours: 9 },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].who).toBe('Hemi');
    expect(found[0].prompt).toBe('long_day');
  });

  it('does not fire exactly on the threshold', () => {
    expect(oddities([{ who: 'Hemi', date: '2026-09-22', hours: LONG_DAY_HOURS }])).toHaveLength(0);
  });

  it('asks rather than tells', () => {
    const [odd] = oddities([{ who: 'Hemi', date: '2026-09-22', hours: 14 }]);
    const p = gentle(odd.prompt, odd.facts);
    expect(p.ask).toBe(ASK);
    expect(p.because).toContain('14 hours');
    expect(p.because).toContain('shutdown');
  });
});
