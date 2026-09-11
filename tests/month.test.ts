import { describe, it, expect } from 'vitest';
import {
  rowState, viewRow, flagsFor, blocking, groupFlags, progressFor, signoffTrail, verdict, ROW_STATE_LABEL,
} from '../src/lib/month';
import type { ScorecardRow } from '../src/lib/queries';
import type { Pillar, RoleScore } from '../src/lib/scoring';

const row = (over: Partial<ScorecardRow> & { pillar: Pillar; text: string }): ScorecardRow => ({
  criterionId: over.text.replace(/\W+/g, '-').toLowerCase(),
  weight: 0.5, kpi: true, target: null, proposedTarget: null, answer: '', note: null, status: null, result: null, source: null,
  ...over,
});

const score = (p: Partial<Record<Pillar, number | null>>, overall: number | null = null): RoleScore => ({
  pillars: { safety: null, people: null, earnings: null, compliance: null, ...p },
  overall,
});

describe('rowState', () => {
  const live = ['Job management system', 'Accounts package'];

  it('is fed when a connected system stands behind it', () => {
    expect(rowState(row({ pillar: 'earnings', text: 'Margin', source: 'Job management system · job actual', answer: 'Y' }), live)).toBe('fed');
  });

  // The case that matters: a number that would silently stop updating with nobody knowing.
  it('is not fed when the source names a system that is not connected', () => {
    expect(rowState(row({ pillar: 'earnings', text: 'Margin', source: 'Something we never connected', answer: 'Y' }), live)).toBe('confirmed');
    expect(rowState(row({ pillar: 'earnings', text: 'Margin', source: 'Something we never connected' }), live)).toBe('needs_confirming');
  });

  it('is confirmed when a person has put their name against it', () => {
    expect(rowState(row({ pillar: 'safety', text: 'Incidents', source: 'Manual — GM confirmation', answer: 'Y' }), live)).toBe('confirmed');
  });

  it('needs confirming when a manual number has nobody against it yet', () => {
    expect(rowState(row({ pillar: 'safety', text: 'Incidents' }), live)).toBe('needs_confirming');
  });

  it('reads not tracked and watch from the status, ahead of anything else', () => {
    expect(rowState(row({ pillar: 'safety', text: 'TRIFR', status: 'not_tracked', answer: 'NA' }), live)).toBe('not_tracked');
    expect(rowState(row({ pillar: 'safety', text: 'TRIFR', status: 'watch', answer: 'NA' }), live)).toBe('watch');
  });

  it('reads a miss as a miss', () => {
    expect(rowState(row({ pillar: 'earnings', text: 'Margin', answer: 'N', status: 'not_met' }), live)).toBe('missed');
  });

  it('has a label for every state', () => {
    for (const s of ['fed', 'confirmed', 'needs_confirming', 'not_tracked', 'missed', 'watch'] as const) {
      expect(ROW_STATE_LABEL[s]).toBeTruthy();
    }
  });
});

describe('viewRow', () => {
  // Hand-editing a fed number breaks the trace back to the system that produced it.
  it('makes a fed row read-only and leaves its source line alone', () => {
    const v = viewRow(row({ pillar: 'earnings', text: 'Margin', source: 'Accounts package', answer: 'Y' }), ['Accounts package']);
    expect(v.readOnly).toBe(true);
    expect(v.sourceLine).toBe('Accounts package');
    expect(v.tone).toBe('green');
  });

  it('says plainly when a manual number still needs a name', () => {
    const v = viewRow(row({ pillar: 'safety', text: 'Incidents', source: 'Manual' }), []);
    expect(v.readOnly).toBe(false);
    expect(v.sourceLine).toBe('Manual · needs a name against it');
    expect(v.tone).toBe('amber');
  });

  // Nagging about a number somebody has already stood behind teaches people to ignore the line.
  it('drops the suffix once the number is confirmed, or is a reported gap', () => {
    expect(viewRow(row({ pillar: 'safety', text: 'Incidents', source: 'Manual', answer: 'Y' }), []).sourceLine).toBe('Manual');
    expect(viewRow(row({ pillar: 'earnings', text: 'Margin', source: 'Manual', answer: 'N', status: 'not_met' }), []).sourceLine).toBe('Manual');
    expect(viewRow(row({ pillar: 'safety', text: 'TRIFR', source: 'Manual', status: 'not_tracked', answer: 'NA' }), []).sourceLine).toBe('Manual');
  });

  it('names no source rather than showing a blank', () => {
    expect(viewRow(row({ pillar: 'safety', text: 'x' }), []).sourceLine).toBe('No source named · needs a name against it');
  });

  it('tones a gap grey, never red', () => {
    expect(viewRow(row({ pillar: 'safety', text: 'TRIFR', status: 'not_tracked', answer: 'NA' }), []).tone).toBe('grey');
  });
});

describe('flagsFor', () => {
  const role = (rows: ScorecardRow[], scored = true) => [{ roleId: 'r1', title: 'Head of Ops', rows, scored }];

  it('blocks on a miss with no reason', () => {
    const f = flagsFor(role([row({ pillar: 'earnings', text: 'Margin', answer: 'N' })]), []);
    expect(blocking(f)).toHaveLength(1);
    expect(f[0].title).toContain('missed with no reason given');
  });

  it('stops blocking once a reason is written', () => {
    const f = flagsFor(role([row({ pillar: 'earnings', text: 'Margin', answer: 'N', note: 'Rework on two jobs.' })]), []);
    expect(blocking(f)).toHaveLength(0);
  });

  it('blocks on a manual number nobody has confirmed', () => {
    const f = flagsFor(role([row({ pillar: 'safety', text: 'Incidents' })]), []);
    expect(blocking(f)).toHaveLength(1);
    expect(f[0].detail).toContain('or mark it not tracked');
  });

  // A gap honestly reported as a gap is a legitimate way to close a month. Blocking it would push
  // people to invent numbers, which is the thing the whole model exists to prevent.
  it('notes a not-tracked measure without blocking on it', () => {
    const f = flagsFor(role([row({ pillar: 'safety', text: 'TRIFR', status: 'not_tracked', answer: 'NA' })]), []);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('noted');
    expect(blocking(f)).toHaveLength(0);
  });

  it('ignores checklist roles entirely', () => {
    expect(flagsFor(role([row({ pillar: 'safety', text: 'x' })], false), [])).toEqual([]);
  });

  it('says nothing about a fed row', () => {
    expect(flagsFor(role([row({ pillar: 'earnings', text: 'Margin', source: 'Accounts package', answer: 'Y' })]), ['Accounts package'])).toEqual([]);
  });
});

describe('groupFlags', () => {
  const vacant = (title: string, texts: string[]) =>
    ({ roleId: title, title, rows: texts.map(text => row({ pillar: 'safety', text })), scored: true });

  it('collapses a vacant role into one line that still names every measure', () => {
    const flags = flagsFor([vacant('Supervisor', ['Incidents', 'Toolbox talks', 'Inductions'])], []);
    const g = groupFlags(flags);
    expect(g).toHaveLength(1);
    expect(g[0].title).toBe('Supervisor: 3 measures have nobody against them');
    expect(g[0].measures).toEqual(['Incidents', 'Toolbox talks', 'Inductions']);
  });

  // One problem must never read as a statistic — a single flag keeps its own wording.
  it('leaves a lone flag exactly as it was written', () => {
    const flags = flagsFor([vacant('Supervisor', ['Incidents'])], []);
    const g = groupFlags(flags);
    expect(g[0].title).toBe(flags[0].title);
    expect(g[0].id).toBe(flags[0].id);
  });

  it('keeps roles and kinds apart', () => {
    const flags = flagsFor([
      vacant('Supervisor', ['Incidents', 'Toolbox talks']),
      { roleId: 'r2', title: 'Head of Ops', rows: [row({ pillar: 'earnings', text: 'Margin', answer: 'N' })], scored: true },
    ], []);
    expect(groupFlags(flags)).toHaveLength(2);
  });

  // Grouping is presentation. A month is blocked by unfinished rows, not by the number of cards.
  it('does not change what blocks the month', () => {
    const flags = flagsFor([vacant('Supervisor', ['Incidents', 'Toolbox talks', 'Inductions'])], []);
    expect(blocking(flags)).toHaveLength(3);
    expect(groupFlags(flags)).toHaveLength(1);
  });
});

describe('progressFor', () => {
  it('counts marked against total, and leaves checklist roles out', () => {
    const p = progressFor([
      { roleId: 'r1', title: 'A', holder: 'X', scored: true, score: score({}, 0.9), rows: [row({ pillar: 'safety', text: 'a', answer: 'Y' }), row({ pillar: 'safety', text: 'b' })] },
      { roleId: 'r2', title: 'B', holder: null, scored: false, score: score({}), rows: [row({ pillar: 'safety', text: 'c' })] },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ marked: 1, total: 2, done: false });
  });

  it('is done only when every row carries a mark', () => {
    const p = progressFor([{
      roleId: 'r1', title: 'A', holder: 'X', scored: true, score: score({}, 1),
      rows: [row({ pillar: 'safety', text: 'a', answer: 'Y' }), row({ pillar: 'safety', text: 'b', status: 'not_tracked', answer: 'NA' })],
    }]);
    expect(p[0].done).toBe(true);
  });

  it('is not done for a role with no rows at all', () => {
    const p = progressFor([{ roleId: 'r1', title: 'A', holder: null, scored: true, score: score({}), rows: [] }]);
    expect(p[0].done).toBe(false);
  });
});

describe('signoffTrail', () => {
  const progress = [
    { roleId: 'a', title: 'A', holder: null, marked: 2, total: 2, done: true, score: 1 },
    { roleId: 'b', title: 'B', holder: null, marked: 1, total: 2, done: false, score: 0.5 },
  ];
  const people = { gm: 'A. Morgan', director: 'A Director', submittedBy: null, signedBy: null };

  it('reports how many roles are scored while any are outstanding', () => {
    const t = signoffTrail('open', progress, people);
    expect(t[0].state).toBe('1 of 2');
    expect(t[0].done).toBe(false);
    expect(t.every(s => s.who.length > 0)).toBe(true);
  });

  it('walks open to submitted to locked', () => {
    expect(signoffTrail('open', progress, people).map(s => s.done)).toEqual([false, false, false, false]);
    expect(signoffTrail('submitted', progress, people).map(s => s.done)).toEqual([false, true, false, false]);
    expect(signoffTrail('locked', progress, people).map(s => s.done)).toEqual([false, true, true, true]);
  });

  it('names whoever actually did it once they have', () => {
    const t = signoffTrail('locked', progress, { ...people, submittedBy: 'J. Barnes', signedBy: 'A Director' });
    expect(t[1].who).toBe('J. Barnes');
    expect(t[2].who).toBe('A Director');
  });
});

describe('verdict', () => {
  it('calls a blank month blank rather than failing', () => {
    const v = verdict(null);
    expect(v.met).toBe(false);
    expect(v.line).toContain('not a failing one');
  });

  it('meets the standard only with all four scored and at 90', () => {
    const v = verdict(score({ safety: 1, people: 0.95, earnings: 0.9, compliance: 1 }, 0.96));
    expect(v.met).toBe(true);
    expect(v.line).toContain('Two closed months like this');
  });

  it('names the pillars under the standard', () => {
    const v = verdict(score({ safety: 1, people: 0.5, earnings: 0.8, compliance: 1 }, 0.82));
    expect(v.met).toBe(false);
    expect(v.line).toContain('People, Earnings under 90%');
  });

  // A pillar with no score is a different problem from a low one, and is named separately.
  it('separates pillars with no score from pillars that are behind', () => {
    const v = verdict(score({ safety: 1, people: 0.5, earnings: null, compliance: null }, 0.75));
    expect(v.line).toContain('People under 90%');
    expect(v.line).toContain('Earnings, Compliance with no score at all');
  });
});
