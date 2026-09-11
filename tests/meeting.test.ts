import { describe, it, expect } from 'vitest';
import {
  agendaFor, belowTheCut, carriedActions, weeksBetween, history, mondayOf, recentMondays,
  readOnTheWeek, actionsOf, decisionsOf, attendeesOf,
  type AgendaInputs, type MeetingRole, type MeetingRow,
} from '../src/lib/meeting';
import type { Pillar, RoleScore } from '../src/lib/scoring';
import type { ScorecardRow } from '../src/lib/queries';

const score = (p: Partial<Record<Pillar, number | null>>, overall: number | null = 0.9): RoleScore => ({
  pillars: { safety: null, people: null, earnings: null, compliance: null, ...p },
  overall,
});

const row = (over: Partial<ScorecardRow> & { pillar: Pillar; text: string }): ScorecardRow => ({
  criterionId: over.text.replace(/\W+/g, '-').toLowerCase(),
  weight: 0.5, kpi: true, target: null, proposedTarget: null, answer: '', note: null, status: null, result: null, source: null,
  ...over,
});

const role = (over: Partial<MeetingRole> = {}): MeetingRole => ({
  roleId: 'r1', title: 'Site Supervisor', holder: 'T. Alderson',
  score: score({}), previous: null, rows: [], scored: true, ...over,
});

const input = (over: Partial<AgendaInputs> = {}): AgendaInputs => ({
  roles: [], vacancies: [], overdueTraining: [], failingGates: [], ...over,
});

describe('agendaFor', () => {
  it('is empty when nothing needs the room', () => {
    expect(agendaFor(input())).toEqual([]);
  });

  // Three is a ceiling. A meeting with eleven items has no agenda, it has a list.
  it('never runs past three items, and counts what it left out', () => {
    const all = agendaFor(input({
      vacancies: [
        { roleId: 'a', title: 'Yard Lead' }, { roleId: 'b', title: 'Scheduler' },
        { roleId: 'c', title: 'Estimator' }, { roleId: 'd', title: 'Storeperson' },
      ],
      limit: 99,
    }));
    const shown = agendaFor(input({
      vacancies: [
        { roleId: 'a', title: 'Yard Lead' }, { roleId: 'b', title: 'Scheduler' },
        { roleId: 'c', title: 'Estimator' }, { roleId: 'd', title: 'Storeperson' },
      ],
    }));
    expect(shown).toHaveLength(3);
    expect(belowTheCut(all, shown)).toBe(1);
  });

  // A gate is pass or fail and is not offset by a good month anywhere else.
  it('leads with a failing hard gate, ahead of every score', () => {
    const items = agendaFor(input({
      failingGates: [{ gate: 'clear_to_work', reason: 'Three licences expired.' }],
      roles: [role({ score: score({ people: 0.5 }), previous: score({ people: 0.9 }) })],
    }));
    expect(items[0].reason).toBe('gate');
    expect(items[0].title).toBe('Clear to Work is failing');
    expect(items[0].detail).toContain('not offset by a good month');
  });

  // Low and falling is a different conversation from low and recovering.
  it('raises a pillar that fell, and stays quiet about one that is recovering', () => {
    const fell = agendaFor(input({
      roles: [role({ score: score({ people: 0.72 }), previous: score({ people: 0.86 }) })],
    }));
    expect(fell).toHaveLength(1);
    expect(fell[0].title).toBe('Site Supervisor People at 72%');
    expect(fell[0].detail).toContain('Down from 86%');

    const recovering = agendaFor(input({
      roles: [role({ score: score({ people: 0.86 }), previous: score({ people: 0.72 }) })],
    }));
    expect(recovering).toEqual([]);
  });

  it('ignores a fall that is still at the standard', () => {
    const items = agendaFor(input({
      roles: [role({ score: score({ safety: 0.95 }), previous: score({ safety: 1 }) })],
    }));
    expect(items).toEqual([]);
  });

  it('orders the steepest fall first', () => {
    const items = agendaFor(input({
      roles: [
        role({ roleId: 'r1', title: 'A', score: score({ people: 0.85 }), previous: score({ people: 0.88 }) }),
        role({ roleId: 'r2', title: 'B', score: score({ safety: 0.6 }), previous: score({ safety: 0.95 }) }),
      ],
    }));
    expect(items[0].title).toBe('B Safety at 60%');
    expect(items[0].tone).toBe('red');
    expect(items[1].tone).toBe('amber');
  });

  it('names what sits behind a fallen pillar', () => {
    const items = agendaFor(input({
      roles: [role({
        score: score({ people: 0.5 }), previous: score({ people: 0.9 }),
        rows: [row({ pillar: 'people', text: 'One-to-ones held', answer: 'N' })],
      })],
    }));
    expect(items[0].detail).toContain('Behind it: One-to-ones held.');
  });

  it('says so when a fall is not explained by any marked miss', () => {
    const items = agendaFor(input({
      roles: [role({ score: score({ people: 0.5 }), previous: score({ people: 0.9 }) })],
    }));
    expect(items[0].detail).toContain('in what has not been marked yet');
  });

  it('raises a miss with nothing written against it, and not one with a note', () => {
    const bare = agendaFor(input({
      roles: [role({ rows: [row({ pillar: 'earnings', text: 'Margin against quote', answer: 'N' })] })],
    }));
    expect(bare).toHaveLength(1);
    expect(bare[0].reason).toBe('unexplained');

    const noted = agendaFor(input({
      roles: [role({ rows: [row({ pillar: 'earnings', text: 'Margin against quote', answer: 'N', note: 'Two jobs repriced.' })] })],
    }));
    expect(noted).toEqual([]);
  });

  it('shows a vacancy as grey with nobody against it — that is the point of it', () => {
    const [v] = agendaFor(input({ vacancies: [{ roleId: 'r9', title: 'Yard Lead' }] }));
    expect(v.tone).toBe('grey');
    expect(v.owner).toBeNull();
    expect(v.detail).toContain('rather than counted as a zero');
  });

  it('always points somewhere the work is done', () => {
    const items = agendaFor(input({
      failingGates: [{ gate: 'zero_harm', reason: null }],
      overdueTraining: [{ person: 'T. Alderson', title: 'Clear to Work, end to end' }],
      vacancies: [{ roleId: 'r9', title: 'Yard Lead' }],
    }));
    expect(items).toHaveLength(3);
    for (const i of items) expect(i.href).toMatch(/^\//);
  });
});

describe('carried actions', () => {
  const meeting = (date: string, actions: unknown[]): MeetingRow => ({
    id: date, date, minutes: null, actions: JSON.stringify(actions), attendees: null, decisions: null,
  });

  it('carries only what is still open', () => {
    const carried = carriedActions([
      meeting('2026-09-07', [
        { id: 'a', text: 'Book renewals', owner: 'T', due: null, done: false, pillar: 'compliance' },
        { id: 'b', text: 'Move inspections', owner: 'D', due: null, done: true, pillar: 'safety' },
      ]),
    ]);
    expect(carried.map(a => a.text)).toEqual(['Book renewals']);
  });

  // An action carried three weeks is not an action, it is a decision nobody has made.
  it('counts the weeks an action has been carried, oldest first', () => {
    const carried = carriedActions([
      meeting('2026-08-24', [{ id: 'a', text: 'Confirm budget', owner: 'K', due: null, done: false, pillar: null }]),
      meeting('2026-09-07', [{ id: 'b', text: 'Book renewals', owner: 'T', due: null, done: false, pillar: null }]),
    ]);
    expect(carried.map(a => [a.text, a.weeks])).toEqual([['Confirm budget', 3], ['Book renewals', 1]]);
  });

  it('survives a row whose JSON is unreadable rather than taking the page down', () => {
    const broken: MeetingRow = { id: 'x', date: '2026-09-07', minutes: null, actions: '{not json', attendees: '5', decisions: null };
    expect(actionsOf(broken)).toEqual([]);
    expect(decisionsOf(broken)).toEqual([]);
    expect(attendeesOf(broken)).toEqual([]);
    expect(carriedActions([broken])).toEqual([]);
  });
});

describe('weeks and mondays', () => {
  it('counts whole weeks between two dates', () => {
    expect(weeksBetween('2026-09-07', '2026-09-14')).toBe(1);
    expect(weeksBetween('2026-08-24', '2026-09-14')).toBe(3);
    expect(weeksBetween('bad', '2026-09-14')).toBe(0);
  });

  it('finds the Monday of any day, Sunday included', () => {
    expect(mondayOf('2026-09-14')).toBe('2026-09-14'); // a Monday
    expect(mondayOf('2026-09-17')).toBe('2026-09-14');
    expect(mondayOf('2026-09-20')).toBe('2026-09-14'); // Sunday belongs to the week that started
  });

  it('lists recent Mondays oldest first, ending with this week', () => {
    expect(recentMondays(new Date('2026-09-17T09:00:00Z'), 3))
      .toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
  });
});

describe('history', () => {
  // A gap in the rhythm is exactly the thing worth seeing.
  it('shows a week with no meeting as not logged rather than leaving it out', () => {
    const h = history([], ['2026-09-07', '2026-09-14']);
    expect(h).toHaveLength(2);
    expect(h.every(w => !w.logged)).toBe(true);
    expect(h[0].note).toContain('did not reach the record');
  });

  it('summarises a logged week by what came out of it', () => {
    const m: MeetingRow = {
      id: 'm', date: '2026-09-14', minutes: null,
      actions: JSON.stringify([{ id: 'a', text: 'x', owner: 'T', due: null, done: false, pillar: null }]),
      attendees: JSON.stringify(['A', 'B']),
      decisions: JSON.stringify([{ text: 'y', who: 'K', at: '2026-09-14' }]),
    };
    expect(history([m], ['2026-09-14'])[0].note).toBe('1 action · 1 decision · 2 in the room');
  });
});

describe('readOnTheWeek', () => {
  it('is deterministic, and says plainly when nothing moved', () => {
    const read = readOnTheWeek(input(), score({ safety: 1, people: 1, earnings: 1, compliance: 1 }));
    expect(read.map(r => r.kicker)).toEqual(['What moved', 'What it traces to', 'What to decide today']);
    expect(read[0].body).toContain('every pillar with a score is at the standard');
    expect(read[2].body).toContain('Log the meeting and keep the rhythm');
  });

  it('names the pillars that fell and the ones still under the standard', () => {
    const read = readOnTheWeek(
      input({ roles: [role({ score: score({ people: 0.72 }), previous: score({ people: 0.86 }) })] }),
      score({ safety: 1, people: 0.8, earnings: 1, compliance: 1 }),
    );
    expect(read[0].body).toContain('People fell against last month');
    expect(read[0].body).toContain('People under 90%');
  });

  // Written the way it is said, not the way an array joins.
  it('lists several pillars with an "and" rather than a trailing comma', () => {
    const read = readOnTheWeek(
      input({
        roles: [role({
          score: score({ people: 0.5, earnings: 0.5 }),
          previous: score({ people: 1, earnings: 1 }),
        })],
      }),
      score({ safety: 1, people: 0.5, earnings: 0.5, compliance: 1 }),
    );
    expect(read[0].body).toContain('People and Earnings fell against last month');
    expect(read[0].body).toContain('People and Earnings under 90%');
  });

  it('traces the week to a vacancy when there is one', () => {
    const read = readOnTheWeek(input({ vacancies: [{ roleId: 'r9', title: 'Yard Lead' }] }), null);
    expect(read[1].body).toContain('Yard Lead');
    expect(read[1].body).toContain('several amber numbers');
  });

  it('names who owns the first item, or says nobody does', () => {
    const owned = readOnTheWeek(input({ roles: [role({ rows: [row({ pillar: 'earnings', text: 'Margin', answer: 'N' })] })] }), null);
    expect(owned[2].body).toContain('T. Alderson owns it.');
    const unowned = readOnTheWeek(input({ vacancies: [{ roleId: 'r9', title: 'Yard Lead' }] }), null);
    expect(unowned[2].body).toContain('Nobody owns it yet');
  });
});
