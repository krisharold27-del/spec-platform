import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  weekWatch, notCovered, rosterLine, allowanceOwed, ALLOWANCE_FROM_THE_AWARD,
  keyWatch, atRisk, keyRolesLine, HANDOVER, WHY_A_BACKUP,
  NEVER_BELOW, readWellbeing, ANONYMOUS_MEANS_ANONYMOUS,
  tafeWatch, TAFE_IS_NOT_A_KPI,
  type OnCallWeek, type KeyRole, type Wellbeing, type TafeProgress,
} from '../src/lib/on-call';

const src = readFileSync(join(process.cwd(), 'src/lib/on-call.ts'), 'utf8');

describe('the on-call roster', () => {
  const week = (over: Partial<OnCallWeek> = {}): OnCallWeek =>
    ({ weekStart: '2026-09-28', personKey: 'p1', personName: 'Hemi', phone: '0400 000 000', ...over });

  it('flags an empty week, which is what nobody notices', () => {
    const w = weekWatch(week({ personKey: null, personName: null }));
    expect(w.state).toBe('empty');
    expect(w.says).toContain('rings out');
  });

  it('flags a rostered week with no number as the worst of the three', () => {
    /* The roster looks full, everybody assumes it is covered, and the call goes nowhere. */
    const w = weekWatch(week({ phone: null }));
    expect(w.state).toBe('no_number');
    expect(w.says).toContain('would go nowhere');
  });

  it('is quiet when it is covered', () => {
    expect(weekWatch(week()).state).toBe('covered');
    expect(notCovered([week()])).toHaveLength(0);
  });

  it('counts both kinds of gap', () => {
    const line = rosterLine([week(), week({ personName: null, personKey: null }), week({ phone: null })]);
    expect(line).toContain('1 with nobody on');
    expect(line).toContain('1 with no number');
  });

  it('owes the allowance to whoever was rostered', () => {
    expect(allowanceOwed(week())).toBe(true);
    expect(allowanceOwed(week({ personKey: null }))).toBe(false);
  });

  it('keeps the rate out of this file', () => {
    expect(ALLOWANCE_FROM_THE_AWARD).toContain('with a source against it');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/allowanceCents|ALLOWANCE_CENTS|\$\d/);
  });
});

describe('key roles', () => {
  const role = (over: Partial<KeyRole> = {}): KeyRole =>
    ({ roleId: 'r1', title: 'Estimator', holder: 'Amrit', backupName: 'Tom', hasHowTo: true, resignedAt: null, ...over });

  it('is red when one person is the only one who can do it', () => {
    const w = keyWatch(role({ backupName: null }));
    expect(w.state).toBe('no_backup');
    expect(w.says).toContain('sick, on holiday, or gone');
  });

  it('calls a backup with nothing written down a name on a list', () => {
    expect(keyWatch(role({ hasHowTo: false })).says).toContain('name on a list');
  });

  it('puts a resignation with no backup at the top', () => {
    const list = [role({ hasHowTo: false }), role({ roleId: 'r2', resignedAt: '2026-09-20', backupName: null })];
    expect(atRisk(list)[0].state).toBe('leaving');
  });

  it('says the handover started when there is somebody to hand to', () => {
    expect(keyWatch(role({ resignedAt: '2026-09-20' })).says).toContain('handover checklist started');
  });

  it('counts the ones where one person is the only one', () => {
    expect(keyRolesLine([role(), role({ roleId: 'r2', backupName: null })]))
      .toContain('1 where one person is the only one');
  });

  it('has a handover list with a week of overlap in it', () => {
    expect(HANDOVER.join(' ')).toContain('still here to ask');
  });

  it('says why it matters commercially, not just operationally', () => {
    expect(WHY_A_BACKUP).toContain('stops being sellable');
  });
});

describe('the wellbeing check-in is anonymous and stays that way', () => {
  const w = (over: Partial<Wellbeing> = {}): Wellbeing =>
    ({ month: '2026-09', responses: 22, asked: 38, score: 7.4, themes: ['workload', 'communication'], ...over });

  it('shows nothing at all below the floor', () => {
    /*
      Not a percentage, not "insufficient data", and not the score with a caveat. Four people in one
      business is not anonymous, whatever the screen says around the number.
    */
    const r = readWellbeing(w({ responses: 4 }));
    expect(r.state).toBe('too_few');
    expect(r.score).toBeNull();
    expect(r.themes).toHaveLength(0);
    expect(r.says).toContain('promised anonymous');
    expect(NEVER_BELOW).toBe(5);
  });

  it('shows the whole-business result when there are enough', () => {
    const r = readWellbeing(w());
    expect(r.state).toBe('shown');
    expect(r.says).toContain('7.4 out of 10');
    expect(r.says).toContain('22 of 38');
  });

  it('has no per-person shape anywhere in the file', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    /* Anything keyed to a person would be the promise broken in the data model. */
    expect(code).not.toMatch(/Wellbeing[^;]*personKey|wellbeing[^;]*\bwho\b/);
  });

  it('says the rule in words', () => {
    expect(ANONYMOUS_MEANS_ANONYMOUS).toContain('crew of three');
  });
});

describe('TAFE', () => {
  const p = (over: Partial<TafeProgress> = {}): TafeProgress =>
    ({ apprentice: 'Sione', stage: 'Year 2', done: 6, due: 6, source: 'TAFE NSW', updatedAt: '2026-09-01', ...over });

  it('will not guess when nothing has come through', () => {
    const r = tafeWatch(p({ source: null, updatedAt: null }));
    expect(r.state).toBe('not_told');
    expect(r.says).toContain('will not guess');
  });

  it('says behind, and who can do something about it', () => {
    const r = tafeWatch(p({ done: 3 }));
    expect(r.state).toBe('behind');
    expect(r.says).toContain('supervisor');
  });

  it('keeps it off the KPI board', () => {
    expect(TAFE_IS_NOT_A_KPI).toContain('something to hide');
  });
});
