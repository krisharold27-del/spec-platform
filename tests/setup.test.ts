import { describe, it, expect } from 'vitest';
import { steps, currentStep, progress, WHAT_SPEC_DOES, type StepInput } from '../src/lib/setup';

const input = (over: Partial<StepInput> = {}): StepInput => ({
  named: false, tierChosen: false, roleCount: 0, rolesWithKpis: 0, scoredRoleCount: 0,
  rolesFilled: 0, managersHandedOver: 0, managerCount: 0, ...over,
});

const done = (over: Partial<StepInput> = {}): StepInput => input({
  named: true, tierChosen: true, roleCount: 4, rolesWithKpis: 3, scoredRoleCount: 3,
  rolesFilled: 4, managersHandedOver: 2, managerCount: 2, ...over,
});

describe('steps', () => {
  it('runs in the only order that works', () => {
    expect(steps(input()).map(s => s.key)).toEqual(['business', 'roles', 'kpis', 'people', 'cascade']);
  });

  it('starts with nothing done', () => {
    expect(steps(input()).every(s => !s.done)).toBe(true);
  });

  it('finishes when the business has actually done all five', () => {
    expect(steps(done()).every(s => s.done)).toBe(true);
  });

  // Every step is computed. A setup screen that can be ticked without the work lies to the next reader.
  it('will not call people done while a role is empty', () => {
    expect(steps(done({ rolesFilled: 3 })).find(s => s.key === 'people')!.done).toBe(false);
  });

  it('will not call KPIs done while a scored role is missing them', () => {
    expect(steps(done({ rolesWithKpis: 2 })).find(s => s.key === 'kpis')!.done).toBe(false);
  });

  it('does not claim KPIs are done when there is no scored role at all', () => {
    const s = steps(input({ named: true, tierChosen: true, roleCount: 1 })).find(x => x.key === 'kpis')!;
    expect(s.done).toBe(false);
    expect(s.state).toBe('No scored role yet');
  });

  it('waits on the AI question before calling the business step done', () => {
    expect(steps(input({ named: true })).find(s => s.key === 'business')!.done).toBe(false);
    expect(steps(input({ named: true })).find(s => s.key === 'business')!.detail).toContain('Basic is complete without it');
  });

  it('counts the roles and the people as it goes', () => {
    const s = steps(input({ roleCount: 4, rolesFilled: 2 }));
    expect(s.find(x => x.key === 'roles')!.state).toBe('4 drawn');
    expect(s.find(x => x.key === 'people')!.state).toBe('2 of 4 filled');
  });

  it('tells somebody with no roles to draw them before placing anybody', () => {
    expect(steps(input()).find(s => s.key === 'people')!.state).toBe('Draw the roles first');
  });

  it('does not call the cascade done when there are no managers to cascade to', () => {
    expect(steps(done({ managerCount: 0, managersHandedOver: 0 })).find(s => s.key === 'cascade')!.done).toBe(false);
  });

  it('points every step somewhere', () => {
    for (const s of steps(input())) expect(s.href).toMatch(/^\//);
  });
});

describe('currentStep', () => {
  it('is the first one outstanding', () => {
    expect(currentStep(steps(input())).key).toBe('business');
    expect(currentStep(steps(input({ named: true, tierChosen: true }))).key).toBe('roles');
  });

  it('rests on the last step once everything is done', () => {
    expect(currentStep(steps(done())).key).toBe('cascade');
  });
});

describe('progress', () => {
  it('counts what is finished', () => {
    expect(progress(steps(input()))).toEqual({ done: 0, total: 5, pct: 0 });
    expect(progress(steps(done()))).toEqual({ done: 5, total: 5, pct: 1 });
  });
});

describe('WHAT_SPEC_DOES', () => {
  it('has a line for every step', () => {
    for (const s of steps(input())) expect(WHAT_SPEC_DOES[s.key]).toBeTruthy();
  });

  // SPEC proposes and sense-checks; it never sets. Saying so at each step is the point.
  it('is explicit that SPEC never sets a target, and has no opinion on who goes where', () => {
    expect(WHAT_SPEC_DOES.kpis).toContain('never sets one');
    expect(WHAT_SPEC_DOES.people).toContain('not a thing software should have an opinion about');
  });
});
