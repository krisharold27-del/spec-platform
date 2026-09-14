import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  GOAL_PROMPTS, GOAL_PROMPT_IDS, GOAL_MAX,
  goalsAnswered, goalsSet, goalLines, fitAnswer, type Goal,
} from '../src/lib/goals';
import { steps, currentStep } from '../src/lib/setup';

/*
  ── The goals: step one, and what everything after it is measured against ────────────────────────

  Design export 5 put this before everything else: "before a single role or KPI, the owner or
  director says what winning looks like. Every target Claude proposes later gets checked against
  this — a KPI that doesn't serve one of these goals is a KPI worth questioning."

  The order is the argument. A role proposed against a sector and a headcount is the shape of
  business this USUALLY is. Proposed against what this owner said winning looks like, it is the
  business they are actually running.
*/

const goal = (promptId: string, answer: string): Goal =>
  ({ promptId, answer, updatedAt: '2026-09-14T00:00:00.000Z' });

const setupInput = (over: Partial<Parameters<typeof steps>[0]> = {}) => ({
  goalsAnswered: false, goalCount: 0,
  named: false, tierChosen: false, roleCount: 0, rolesWithKpis: 0, scoredRoleCount: 0,
  rolesFilled: 0, managersHandedOver: 0, managerCount: 0, ...over,
});

describe('the three questions', () => {
  it('asks far, then near, then the fear', () => {
    expect(GOAL_PROMPTS.map(p => p.id)).toEqual(['g1', 'g2', 'g3']);
    expect(GOAL_PROMPTS[0].label).toContain('3 years');
    expect(GOAL_PROMPTS[1].label).toContain('this year');
    expect(GOAL_PROMPTS[2].label).toContain('keeps you up at night');
  });

  it('gives every prompt a real example rather than a format hint', () => {
    for (const p of GOAL_PROMPTS) {
      expect(p.placeholder.length, p.id).toBeGreaterThan(20);
      expect(p.why.length, p.id).toBeGreaterThan(20);
    }
  });
});

describe('what counts as answered', () => {
  /*
    ONE answer finishes the step, deliberately. Three empty boxes at the very front of setup is the
    moment a busy owner closes the tab, and a step that cannot be finished without three paragraphs
    would stop the whole business ever being drawn.
  */
  it('is satisfied by one real answer', () => {
    expect(goalsAnswered([])).toBe(false);
    expect(goalsAnswered([goal('g1', 'Doubled revenue, second site')])).toBe(true);
  });

  it('does not accept whitespace as an answer', () => {
    expect(goalsAnswered([goal('g1', '   \n  ')])).toBe(false);
    expect(goalsSet([goal('g1', '  '), goal('g2', 'Margin above 32%')])).toBe(1);
  });

  it('counts how many of the three are set', () => {
    expect(goalsSet([])).toBe(0);
    expect(goalsSet([goal('g1', 'a'), goal('g3', 'c')])).toBe(2);
  });
});

describe('showing them back', () => {
  it('reads them in the order they were asked, not the order the database returned', () => {
    const lines = goalLines([goal('g3', 'Bus factor'), goal('g1', 'Second site')]);
    expect(lines.map(l => l.answer)).toEqual(['Second site', 'Bus factor']);
  });

  /* A board pack is not the place to advertise a blank. */
  it('leaves out the ones nobody answered', () => {
    const lines = goalLines([goal('g1', 'Second site'), goal('g2', '   ')]);
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe(GOAL_PROMPTS[0].label);
  });
});

describe('the length limit', () => {
  it('keeps a normal answer exactly as typed', () => {
    expect(fitAnswer('  Margin above 32% every month  ')).toEqual({
      answer: 'Margin above 32% every month', trimmed: false,
    });
  });

  /* A field that quietly swallows the end of somebody's sentence is worse than one that refuses it,
     so the caller is told it had to cut. */
  it('says when it had to cut rather than cutting silently', () => {
    const long = 'x'.repeat(GOAL_MAX + 50);
    const out = fitAnswer(long);
    expect(out.answer).toHaveLength(GOAL_MAX);
    expect(out.trimmed).toBe(true);
  });
});

describe('where it sits in setup', () => {
  it('is step one, before the business itself', () => {
    const all = steps(setupInput());
    expect(all[0].key).toBe('goals');
    expect(all[0].kicker).toBe('Step 1');
    expect(all[1].key).toBe('business');
  });

  /*
    The kickers are numbered from position now. They used to be typed in, and inserting this step
    meant renumbering five of them by hand — the edit that silently ships two Step 3s.
  */
  it('numbers every step from its position, with no gaps or repeats', () => {
    const all = steps(setupInput());
    expect(all.map(s => s.kicker)).toEqual(all.map((_, i) => `Step ${i + 1}`));
  });

  it('is where a brand-new business is sent first', () => {
    expect(currentStep(steps(setupInput())).key).toBe('goals');
  });

  it('moves on once something is answered', () => {
    const all = steps(setupInput({ goalsAnswered: true, goalCount: 1 }));
    expect(all[0].done).toBe(true);
    expect(all[0].state).toBe('1 of 3 answered');
    expect(currentStep(all).key).toBe('business');
  });
});

describe('carried through the product', () => {
  const scoring = readFileSync('src/app/scoring/page.tsx', 'utf8');
  const board = readFileSync('src/app/board/[periodId]/page.tsx', 'utf8');
  const panel = readFileSync('src/components/goals-panel.tsx', 'utf8');
  const page = readFileSync('src/app/setup/goals/page.tsx', 'utf8');

  /* "This stays visible on the board pack and the monthly scoring page, so the goals are never lost
     under the numbers." */
  it('is on both pages the design names', () => {
    expect(scoring).toContain('<GoalsPanel');
    expect(scoring).toContain('goalsFor(');
    expect(board).toContain('<GoalsPanel');
    expect(board).toContain('goalsFor(');
  });

  it('renders nothing at all when nothing is answered', () => {
    expect(panel).toContain('if (lines.length === 0) return null;');
  });

  /* These are the owner's words. Collapsing the line breaks they typed would be SPEC editing them. */
  it('keeps the words exactly as they were typed', () => {
    expect(panel).toContain('whitespace-pre-line');
  });

  it('says what SPEC will do with them, on the page that asks', () => {
    expect(page).toContain('Checks every KPI target against them');
    expect(page).toContain('worth questioning');
  });

  it('only ever writes the prompts it knows about', () => {
    const action = readFileSync('src/app/setup/goals/actions.ts', 'utf8');
    expect(action).toContain('GOAL_PROMPT_IDS');
    expect(GOAL_PROMPT_IDS).toEqual(['g1', 'g2', 'g3']);
    // A look-around must never write. Every write in the product comes through this one check.
    expect(action).toContain('assertWritable');
  });
});
