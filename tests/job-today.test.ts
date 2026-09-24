import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ROLE_STEPS, roleKindOf, stepsFor, nextStep, progressLine, type Counts,
} from '../src/lib/job-today';

/*
  ── Your job today ───────────────────────────────────────────────────────────────────────────────

  Design 17: *"My Page lays out the job for the person's role as ordered steps, each opening exactly
  where it's done. The next step is highlighted; steps tick off."*

  Every other screen answers "how is it going". This one answers "what do I do" — a different
  question, and the one most people open a system with.
*/

describe('the four role lists', () => {
  it('has one for each shape of day', () => {
    expect(Object.keys(ROLE_STEPS).sort()).toEqual(['bd', 'crew', 'ops', 'supervisor']);
    for (const [kind, r] of Object.entries(ROLE_STEPS)) {
      expect(r.steps.length, kind).toBeGreaterThanOrEqual(5);
    }
  });

  /*
    ── The promise the whole screen rests on ────────────────────────────────────────────────────

    The design: "the only system outside SPEC is the financial system (Xero/MYOB), which SPEC keeps
    up to date." A step that sent somebody to a second system would make that claim false, so every
    step lands inside SPEC.
  */
  it('EVERY STEP LANDS INSIDE SPEC, never in a second system', () => {
    for (const r of Object.values(ROLE_STEPS)) {
      for (const s of r.steps) {
        expect(s.where, s.title).toMatch(/^\//);
        expect(s.where, s.title).not.toMatch(/^https?:|xero|myob/i);
      }
    }
  });

  /* A step that says what to do and makes somebody find it is a step they do later. */
  it('and each one opens exactly where it is done', () => {
    const sup = ROLE_STEPS.supervisor.steps;
    expect(sup[0].where).toBe('/safety?tab=site');
    expect(ROLE_STEPS.bd.steps[0].where).toBe('/jobs?tab=leads');
    expect(ROLE_STEPS.crew.steps.every(s => s.where === '/tech-day')).toBe(true);
  });

  /* The order is the content: a supervisor's toolbox talk comes before anything else. */
  it('IS ORDERED, and the order is the point', () => {
    expect(ROLE_STEPS.supervisor.steps[0].title).toContain('Toolbox talk');
    expect(ROLE_STEPS.bd.steps[0].title).toContain('Late quotes first');
  });
});

describe('which list somebody gets', () => {
  /* By what the role DOES, so a business that calls its supervisors "leading hands" still works. */
  it('READS THE ROLE’S TITLE, not only a level string', () => {
    expect(roleKindOf({ title: 'Leading Hand' })).toBe('supervisor');
    expect(roleKindOf({ title: 'Site Supervisor' })).toBe('supervisor');
    expect(roleKindOf({ title: 'Foreman' })).toBe('supervisor');
    expect(roleKindOf({ title: 'Estimator' })).toBe('bd');
    expect(roleKindOf({ title: 'Commercial Manager' })).toBe('bd');
    expect(roleKindOf({ title: 'Operations Manager' })).toBe('ops');
    expect(roleKindOf({ title: 'Electrician' })).toBe('crew');
  });

  it('and falls back on the level when the title says nothing', () => {
    expect(roleKindOf({ title: 'Whatever', level: 'supervisor' })).toBe('supervisor');
    expect(roleKindOf({ title: 'Whatever', level: 'gm' })).toBe('ops');
  });

  /* Anybody SPEC cannot place gets the crew list — the shortest, and right for most people. */
  it('NEVER LEAVES SOMEBODY WITHOUT A DAY', () => {
    expect(roleKindOf(null)).toBe('crew');
    expect(roleKindOf({ title: '' })).toBe('crew');
  });
});

describe('the numbers that make a step worth doing', () => {
  const counts: Counts = { timesheetsWaiting: 4, openCallbacks: 2, emptyCrewDays: 7 };

  it('puts the count in front of the step', () => {
    const steps = stepsFor('ops', counts);
    expect(steps.find(s => s.title === 'Approve timesheets')?.note).toContain('4 waiting');
    expect(steps.find(s => s.title === 'Fill the empty crew days')?.count).toBe(7);
  });

  /*
    A step SPEC cannot count keeps its own words rather than showing a zero. A zero somebody cannot
    verify is worse than no number: it reads as "done" on work nobody has looked at.
  */
  it('SHOWS NO NUMBER WHERE SPEC CANNOT COUNT, rather than a zero', () => {
    const steps = stepsFor('ops', {});
    const first = steps[0];
    expect(first.count).toBeNull();
    expect(first.done, 'unknown is never done').toBe(false);
    expect(first.note).not.toMatch(/^0 /);
  });

  /*
    Steps tick off because the work is gone, never because somebody ticked them. A checklist people
    tick gets ticked on the way past.
  */
  it('TICKS OFF ONLY WHEN THE COUNT REACHES ZERO, never by hand', () => {
    const steps = stepsFor('ops', { timesheetsWaiting: 0 });
    expect(steps.find(s => s.title === 'Approve timesheets')?.done).toBe(true);
    const src = readFileSync('src/lib/job-today.ts', 'utf8');
    expect(src).toContain('never by somebody');
  });

  it('and the next thing is the first one not done', () => {
    const steps = stepsFor('ops', { emptyCrewDays: 0, lateOrders: 0, timesheetsWaiting: 3 });
    expect(nextStep(steps)?.title).toBe('Read the business verdict and anything red');
  });

  it('says when there is nothing left', () => {
    const done = stepsFor('crew', {}).map(s => ({ ...s, done: true }));
    expect(nextStep(done)).toBeNull();
  });
});

describe('how the day reads at the top', () => {
  /*
    Counts only the steps SPEC can see the state of. "3 of 6" where three are unknowable is a
    progress bar that lies, and a leader who learns it lies stops reading it.
  */
  it('COUNTS ONLY WHAT IT CAN ACTUALLY SEE', () => {
    expect(progressLine(stepsFor('ops', { timesheetsWaiting: 0, openCallbacks: 2 })))
      .toBe('1 of 2 clear');
  });

  it('and says so plainly when it can see none of it', () => {
    expect(progressLine(stepsFor('crew', {}))).toContain('steps, in order');
  });

  it('never congratulates on work it cannot see', () => {
    const line = progressLine(stepsFor('ops', { timesheetsWaiting: 0, openCallbacks: 0 }));
    expect(line).toBe('Nothing waiting on you right now');
  });
});
