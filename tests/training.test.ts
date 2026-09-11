import { describe, it, expect } from 'vitest';
import {
  daysUntil, dueDateFor, dueState, stateOf, pathFor, pathProgress, signoffFor, aceSteps, holdsAce,
  type TrainingModule, type CurriculumEntry, type TrainingRecord,
} from '../src/lib/training';

const AT = new Date('2026-09-11T09:00:00Z');

const mod = (id: string, over: Partial<TrainingModule> = {}): TrainingModule => ({
  id, title: id, summary: 'A module.', pillar: 'all', minutes: 30, core: false, ...over,
});

const entry = (moduleId: string, over: Partial<CurriculumEntry> = {}): CurriculumEntry => ({
  moduleId, dueDays: null, sortOrder: 0, ...over,
});

const record = (moduleId: string, over: Partial<TrainingRecord> = {}): TrainingRecord => ({
  moduleId, progress: 0, resultPct: null, completedAt: null, ...over,
});

describe('dates', () => {
  it('counts days forward and back from the day in question', () => {
    expect(daysUntil('2026-09-11', AT)).toBe(0);
    expect(daysUntil('2026-09-25', AT)).toBe(14);
    expect(daysUntil('2026-09-01', AT)).toBe(-10);
  });

  it('sets a due date from the day the role was taken', () => {
    expect(dueDateFor('2026-08-01', 30)).toBe('2026-08-31');
    expect(dueDateFor('2026-08-01T10:00:00Z', 14)).toBe('2026-08-15');
  });

  // A deadline nobody set is not a deadline.
  it('invents no due date where the path sets none', () => {
    expect(dueDateFor('2026-08-01', null)).toBeNull();
    expect(dueDateFor(null, 30)).toBeNull();
    expect(dueDateFor('nonsense', 30)).toBeNull();
  });

  it('is overdue only once the day has passed, and never for a finished module', () => {
    expect(dueState('2026-09-10', false, AT)).toBe('overdue');
    expect(dueState('2026-09-11', false, AT)).toBe('due_soon');
    expect(dueState('2026-09-24', false, AT)).toBe('due_soon');
    expect(dueState('2026-10-30', false, AT)).toBe('upcoming');
    expect(dueState('2026-09-10', true, AT)).toBe('none');
    expect(dueState(null, false, AT)).toBe('none');
  });
});

describe('stateOf', () => {
  it('reads progress as one of three states', () => {
    expect(stateOf(0)).toBe('not_started');
    expect(stateOf(1)).toBe('in_progress');
    expect(stateOf(99)).toBe('in_progress');
    expect(stateOf(100)).toBe('complete');
  });
});

describe('pathFor', () => {
  const modules = [mod('m1', { title: 'How SPEC works', core: true, minutes: 25 }), mod('m2', { title: 'Margin against quote', pillar: 'earnings' })];

  it('returns the role path in its own order, not the order the rows arrived', () => {
    const lines = pathFor(
      [entry('m2', { sortOrder: 1 }), entry('m1', { sortOrder: 0 })],
      modules, [], null, AT,
    );
    expect(lines.map(l => l.title)).toEqual(['How SPEC works', 'Margin against quote']);
  });

  it('reads a module nobody has touched as not started, never as failed', () => {
    const [l] = pathFor([entry('m1')], modules, [], null, AT);
    expect(l.state).toBe('not_started');
    expect(l.action).toBe('Start');
    expect(l.resultPct).toBeNull();
    expect(l.note).toBe('25 min.');
  });

  it('estimates what is left of a started module', () => {
    const [l] = pathFor([entry('m1')], modules, [record('m1', { progress: 60 })], null, AT);
    expect(l.state).toBe('in_progress');
    expect(l.action).toBe('Continue');
    expect(l.note).toBe('About 10 min left.');
  });

  it('reviews a passed module rather than asking for it again, and shows the mark', () => {
    const [l] = pathFor(
      [entry('m1')], modules,
      [record('m1', { progress: 100, resultPct: 94, completedAt: '2026-08-12T00:00:00Z' })],
      null, AT,
    );
    expect(l.action).toBe('Review');
    expect(l.note).toBe('Passed 2026-08-12 · 94%');
  });

  it('dates the path from the day the person took the role', () => {
    const [l] = pathFor([entry('m1', { dueDays: 14 })], modules, [], '2026-08-01', AT);
    expect(l.dueDate).toBe('2026-08-15');
    expect(l.due).toBe('overdue');
    expect(l.note).toContain('Overdue since 2026-08-15');
  });

  // A catalogue that has moved on is not something the learner did wrong.
  it('drops a path entry whose module no longer exists rather than rendering a blank', () => {
    expect(pathFor([entry('gone'), entry('m1')], modules, [], null, AT).map(l => l.moduleId)).toEqual(['m1']);
  });

  it('clamps a progress value that has gone out of range', () => {
    const [a] = pathFor([entry('m1')], modules, [record('m1', { progress: 140 })], null, AT);
    const [b] = pathFor([entry('m1')], modules, [record('m1', { progress: -5 })], null, AT);
    expect(a.state).toBe('complete');
    expect(b.state).toBe('not_started');
  });
});

describe('pathProgress', () => {
  const modules = [mod('m1'), mod('m2')];

  // A role nobody has assigned training to has no progress — not nought percent.
  it('has no percentage at all when the role has no path', () => {
    const p = pathProgress([]);
    expect(p.pct).toBeNull();
    expect(p.pathComplete).toBe(false);
    expect(p.total).toBe(0);
  });

  it('averages across the whole path, part-finished modules included', () => {
    const lines = pathFor(
      [entry('m1', { sortOrder: 0 }), entry('m2', { sortOrder: 1 })],
      modules, [record('m1', { progress: 100 }), record('m2', { progress: 50 })], null, AT,
    );
    const p = pathProgress(lines);
    expect(p.complete).toBe(1);
    expect(p.total).toBe(2);
    expect(p.pct).toBeCloseTo(0.75);
    expect(p.pathComplete).toBe(false);
  });

  it('is complete only when every module is', () => {
    const lines = pathFor(
      [entry('m1'), entry('m2', { sortOrder: 1 })],
      modules, [record('m1', { progress: 100 }), record('m2', { progress: 100 })], null, AT,
    );
    expect(pathProgress(lines).pathComplete).toBe(true);
  });

  it('counts what is overdue', () => {
    const lines = pathFor(
      [entry('m1', { dueDays: 1 }), entry('m2', { dueDays: 1, sortOrder: 1 })],
      modules, [record('m1', { progress: 100 })], '2026-08-01', AT,
    );
    expect(pathProgress(lines).overdue).toBe(1);
  });
});

describe('signoffFor', () => {
  const none = { trainedAt: null, trainedBy: null };

  it('says there is no path rather than pretending the person is behind', () => {
    expect(signoffFor(pathProgress([]), none, 'General Manager').state).toBe('no_path');
  });

  it('waits for the path before offering sign-off, and says how far along it is', () => {
    const s = signoffFor({ total: 5, complete: 2, pct: 0.4, pathComplete: false, overdue: 0 }, none, 'General Manager');
    expect(s.state).toBe('in_progress');
    expect(s.note).toContain('2 of 5 modules done');
  });

  it('names who the sign-off goes to once the path is done', () => {
    const s = signoffFor({ total: 5, complete: 5, pct: 1, pathComplete: true, overdue: 0 }, none, 'General Manager');
    expect(s.state).toBe('ready');
    expect(s.note).toBe('Goes to the General Manager.');
  });

  it('falls back to the reporting line when the manager has no title to name', () => {
    const s = signoffFor({ total: 1, complete: 1, pct: 1, pathComplete: true, overdue: 0 }, none, null);
    expect(s.note).toBe('Goes to whoever this role reports to.');
  });

  // Sign-off is a person's decision, so a recorded one stands whatever the bar says afterwards.
  it('keeps a recorded sign-off even if the path later grows', () => {
    const s = signoffFor(
      { total: 6, complete: 5, pct: 0.8, pathComplete: false, overdue: 0 },
      { trainedAt: '2026-07-03T00:00:00Z', trainedBy: 'A. Morgan' }, 'General Manager',
    );
    expect(s.state).toBe('signed');
    expect(s.note).toBe('Signed off by A. Morgan on 2026-07-03.');
  });
});

describe('aceSteps', () => {
  const done = { total: 4, complete: 4, pct: 1, pathComplete: true, overdue: 0 };
  const signed = signoffFor(done, { trainedAt: '2026-07-03T00:00:00Z', trainedBy: 'A. Morgan' }, null);

  it('holds Ace only when all three steps are met', () => {
    expect(holdsAce(aceSteps(done, signed, 3))).toBe(true);
    expect(holdsAce(aceSteps(done, signed, 2))).toBe(false);
  });

  // A person who has done two of the three is owed the truth about which one is outstanding.
  it('reports each step separately rather than as one verdict', () => {
    const steps = aceSteps(done, signed, 1);
    expect(steps.map(s => s.done)).toEqual([true, true, false]);
    expect(steps[2].note).toContain('1 of 3 so far');
  });

  it('says plainly when no month has held the standard yet', () => {
    expect(aceSteps(done, signed, 0)[2].note).toBe('No closed month has held 90% yet.');
  });

  it('does not claim a path is incomplete when none was ever set', () => {
    const empty = pathProgress([]);
    const steps = aceSteps(empty, signoffFor(empty, { trainedAt: null, trainedBy: null }, null), 0);
    expect(steps[0].note).toBe('No path is assigned to this role yet.');
  });
});
