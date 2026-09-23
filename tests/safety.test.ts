import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  looksNotifiable, regulatorFor, stateCode, notifyPrompt, likelyState, REGULATORS,
  clearance, clearanceNote, clearToSchedule, CLEAR_WARNING_DAYS,
  reportStanding, actionStanding, checkStanding, claimStanding,
  priority, byPriority, daysWithoutHarm, canSeeReport, anonymise, pillarOf, isHarm,
  REPORT_KINDS, FEEDS, type Viewer,
} from '../src/lib/safety';
import { tableShapes } from '../src/lib/schema-sql';

const at = new Date('2026-09-23T09:00:00Z');

describe('does it look notifiable', () => {
  it('flags an injury that sounds serious', () => {
    for (const text of [
      'Apprentice fell from the scaffold, ambulance called',
      'Took an electric shock off the switchboard',
      'Lost the tip of his finger on the drop saw',
      'Hit her head on the steel beam, knocked out briefly',
      'Taken to hospital with a broken wrist',
    ]) expect(looksNotifiable('injury', text), text).toBe(true);
  });

  it('leaves a minor injury alone', () => {
    for (const text of ['Cut his hand on cable tray, first aid', 'Rolled an ankle on the stairs, back at work', 'Splinter'])
      expect(looksNotifiable('injury', text), text).toBe(false);
  });

  it('flags a dangerous incident even when nobody was hurt', () => {
    expect(looksNotifiable('near_miss', 'Trench collapsed after the crew climbed out')).toBe(true);
    expect(looksNotifiable('near_miss', 'Felt a shock off the metal frame, nobody hurt — electric shock')).toBe(true);
    expect(looksNotifiable('near_miss', 'Ladder slipped, nobody hurt')).toBe(false);
  });

  it('never routes a hazard or a wellbeing report to a regulator', () => {
    expect(looksNotifiable('hazard', 'Exposed live cable could cause an electric shock')).toBe(false);
    expect(looksNotifiable('wellbeing', 'I feel like I am going to collapse from the hours')).toBe(false);
    expect(looksNotifiable('injury', '   ')).toBe(false);
  });
});

describe('who to call', () => {
  it('knows every Australian state and territory, and New Zealand', () => {
    expect(REGULATORS.map(r => r.code).sort()).toEqual(['ACT', 'NSW', 'NT', 'NZ', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);
    for (const r of REGULATORS) expect(r.phone).toMatch(/^[\d ]+$/);
  });

  it('looks a regulator up by state, in any case', () => {
    expect(regulatorFor('vic')?.name).toBe('WorkSafe Victoria');
    expect(regulatorFor(' QLD ')?.code).toBe('QLD');
    expect(regulatorFor('Narnia')).toBeNull();
    expect(regulatorFor(null)).toBeNull();
    expect(stateCode('nsw')).toBe('NSW');
    expect(stateCode('<script>')).toBeNull();
  });

  it('names the regulator when the state is known, and never guesses one when it is not', () => {
    expect(notifyPrompt('WA').title).toContain('WorkSafe WA');
    expect(notifyPrompt('WA').title).toContain('1300 307 877');
    const unknown = notifyPrompt(null).title;
    for (const r of REGULATORS) expect(unknown).not.toContain(r.name);
    expect(unknown).toContain('regulator');
  });

  it('remembers the last state the business used, rather than asking again', () => {
    expect(likelyState([])).toBeNull();
    expect(likelyState([
      { state: 'NSW', createdAt: '2026-08-01' },
      { state: null, createdAt: '2026-09-20' },
      { state: 'qld', createdAt: '2026-09-01' },
    ])).toBe('QLD');
  });
});

describe('Clear to Work', () => {
  it('warns sixty days out', () => {
    expect(CLEAR_WARNING_DAYS).toBe(60);
    expect(clearance('2026-11-22', at).state).toBe('expiring'); // 60 days
    expect(clearance('2026-11-23', at).state).toBe('clear');    // 61 days
    expect(clearance('2026-10-14', at)).toMatchObject({ state: 'expiring', tone: 'amber', label: '21 days left' });
  });

  it('is still clear on the day it expires, and not clear the day after', () => {
    expect(clearance('2026-09-23', at)).toMatchObject({ state: 'expiring', label: 'Expires today' });
    expect(clearance('2026-09-22', at)).toMatchObject({ state: 'not_clear', tone: 'red', label: 'Not clear to work' });
  });

  it('treats no expiry as clear and an unreadable date as not clear', () => {
    expect(clearance(null, at).state).toBe('clear');
    expect(clearance('soon', at).state).toBe('not_clear');
    expect(clearanceNote(null, at)).toBe('Does not expire');
    expect(clearanceNote('2026-09-02', at)).toBe('Expired 2026-09-02');
  });

  it('cannot be scheduled with one expired ticket, and can with an expiring one', () => {
    expect(clearToSchedule([{ expiresAt: '2027-01-01' }, { expiresAt: '2026-09-01' }], at)).toBe(false);
    expect(clearToSchedule([{ expiresAt: '2026-10-01' }, { expiresAt: null }], at)).toBe(true);
    expect(clearToSchedule([], at)).toBe(true);
  });
});

describe('where each thing stands — pending is never red', () => {
  it('never paints an open report red until its date is missed', () => {
    expect(reportStanding({ kind: 'hazard', status: 'open', owner: null, dueAt: null }, at).tone).toBe('amber');
    expect(reportStanding({ kind: 'hazard', status: 'open', owner: 'Sam', dueAt: '2026-09-25' }, at).tone).toBe('amber');
    expect(reportStanding({ kind: 'hazard', status: 'open', owner: 'Sam', dueAt: '2026-09-19' }, at))
      .toEqual({ tone: 'red', label: 'Overdue 4 days' });
    expect(reportStanding({ kind: 'hazard', status: 'closed', owner: 'Sam', dueAt: '2026-09-19' }, at).tone).toBe('green');
    expect(reportStanding({ kind: 'injury', status: 'open', owner: null, dueAt: null, severity: 'medical' }, at).label)
      .toBe('Medical treatment · open');
  });

  it('corrective actions', () => {
    expect(actionStanding({ doneAt: null, dueAt: '2026-09-30' }, at)).toEqual({ tone: 'green', label: 'On track' });
    expect(actionStanding({ doneAt: null, dueAt: '2026-09-19' }, at).tone).toBe('red');
    expect(actionStanding({ doneAt: null, dueAt: null }, at).tone).toBe('amber');
    expect(actionStanding({ doneAt: '2026-09-20', dueAt: '2026-09-19' }, at).tone).toBe('green');
  });

  it('on-site checks', () => {
    expect(checkStanding({ kind: 'toolbox', result: 'done', onDate: '2026-09-23', signed: 3, expected: 5 }, at))
      .toEqual({ tone: 'amber', label: '2 not signed' });
    expect(checkStanding({ kind: 'swms', result: 'done', onDate: '2026-09-01', signed: 6, expected: 6 }, at).label).toBe('Current');
    expect(checkStanding({ kind: 'vehicle', result: 'failed', onDate: '2026-09-22', signed: null, expected: null }, at).tone).toBe('red');
    expect(checkStanding({ kind: 'vehicle', result: 'passed', onDate: '2026-09-13', signed: null, expected: null }, at))
      .toEqual({ tone: 'red', label: 'Overdue 3 days' });
    expect(checkStanding({ kind: 'vehicle', result: 'passed', onDate: '2026-09-21', signed: null, expected: null }, at).tone).toBe('green');
    expect(checkStanding({ kind: 'inspection', result: 'due', onDate: '2026-09-30', signed: null, expected: null }, at).tone).toBe('amber');
    expect(checkStanding({ kind: 'inspection', result: 'due', onDate: '2026-09-01', signed: null, expected: null }, at).tone).toBe('red');
  });

  it('return to work', () => {
    expect(claimStanding({ status: 'open', dutiesWeek: 2, dutiesWeeks: 4 }).label).toBe('Suitable duties · week 2 of 4');
    expect(claimStanding({ status: 'closed', dutiesWeek: 4, dutiesWeeks: 4 }).tone).toBe('green');
  });
});

describe('harm to a person ranks first', () => {
  it('is always the Safety pillar', () => {
    for (const k of REPORT_KINDS) expect(pillarOf(k.key)).toBe('safety');
    expect(FEEDS.incidents.pillar).toBe('safety');
    expect(FEEDS.wellbeing.pillar).toBe('safety');
    expect(isHarm('injury')).toBe(true);
    expect(isHarm('wellbeing')).toBe(true);
    expect(isHarm('hazard')).toBe(false);
  });

  it('outranks an overdue check, even when the injury itself is only amber', () => {
    const needs = [
      { id: 'ute', harm: false, tone: 'red' as const, since: '2026-09-01' },
      { id: 'hurt', harm: true, tone: 'amber' as const, since: '2026-09-20' },
      { id: 'notify', harm: true, notifiable: true, tone: 'amber' as const, since: '2026-09-22' },
      { id: 'ticket', harm: false, tone: 'amber' as const, since: '2026-08-01' },
      { id: 'grey', harm: false, tone: 'pending' as const, since: '2026-01-01' },
    ];
    expect(byPriority(needs).map(n => n.id)).toEqual(['notify', 'hurt', 'ute', 'ticket', 'grey']);
    expect(priority(needs[1])).toBeLessThan(priority(needs[0]));
  });

  it('counts days without harm, and has no number at all before any is recorded', () => {
    expect(daysWithoutHarm([], at)).toBeNull();
    expect(daysWithoutHarm([{ createdAt: '2026-09-03T10:00:00Z' }, { createdAt: '2026-08-01' }], at)).toBe(20);
  });
});

describe('who can see a report', () => {
  const me: Viewer = { userId: 'u1', seesRole: id => id === 'below', isTop: false };
  const gm: Viewer = { userId: 'gm', seesRole: () => true, isTop: true };

  it('shows hazards and near misses to everybody', () => {
    expect(canSeeReport({ kind: 'hazard', reportedBy: 'x', roleId: 'elsewhere' }, me)).toBe(true);
    expect(canSeeReport({ kind: 'near_miss', reportedBy: null, roleId: null }, me)).toBe(true);
  });

  it('follows the chart for an injury — never sideways', () => {
    expect(canSeeReport({ kind: 'injury', reportedBy: 'x', roleId: 'below' }, me)).toBe(true);
    expect(canSeeReport({ kind: 'injury', reportedBy: 'x', roleId: 'sideways' }, me)).toBe(false);
    expect(canSeeReport({ kind: 'injury', reportedBy: 'u1', roleId: 'mine' }, me)).toBe(true);
  });

  it('sends wellbeing to the top only, even past the reporter\'s own manager', () => {
    expect(canSeeReport({ kind: 'wellbeing', reportedBy: 'x', roleId: 'below' }, me)).toBe(false);
    expect(canSeeReport({ kind: 'wellbeing', reportedBy: null, roleId: null }, gm)).toBe(true);
    expect(canSeeReport({ kind: 'wellbeing', reportedBy: 'u1', roleId: 'mine' }, me)).toBe(true);
  });

  it('keeps nothing that could lead back to an anonymous reporter', () => {
    const a = anonymise({ reportedBy: 'u1', roleId: 'r1', jobRef: 'J-1', createdAt: '2026-09-23T07:41:12.000Z', text: 'x' });
    expect(a).toEqual({ reportedBy: null, roleId: null, jobRef: null, createdAt: '2026-09-23', text: 'x' });
  });
});

describe('the tables', () => {
  const safety = tableShapes().filter(t => t.name.startsWith('safety_'));

  it('exist, and every one carries its own tenant', () => {
    expect(safety.map(t => t.name).sort()).toEqual(['safety_actions', 'safety_checks', 'safety_claims', 'safety_reports']);
    for (const t of safety) expect(t.columns.some(c => c.name === 'tenant_id' && c.notNull), t.name).toBe(true);
  });

  it('are named in the policy file, and turned on there', () => {
    const rls = readFileSync('drizzle/0001_rls.sql', 'utf8');
    for (const t of safety) expect(rls.match(new RegExp(`'${t.name}'`, 'g'))?.length ?? 0, t.name).toBeGreaterThanOrEqual(2);
  });
});

describe('generic, never one client', () => {
  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) files(p, out); else out.push(p);
    }
    return out;
  }
  const sources = [...files('src/app/safety'), 'src/lib/safety.ts', 'src/lib/safety-data.ts', 'src/components/safety-report-box.tsx'];

  it('names no vendor, no retired product and no single regulator as the only one', () => {
    for (const f of sources) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/simpro|safety minder|aroflo|servicem8|xero|myob/i);
      if (f !== 'src/lib/safety.ts') expect(text, f).not.toMatch(/13 10 50/);
    }
  });
});
