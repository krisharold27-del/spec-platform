import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  incentiveFor, failedPillarCount,
  DEDUCTION_PER_FAILED_PILLAR, DEDUCTION_CAP, FAILED_BELOW,
} from '../src/lib/incentive';
import { WATCH_FROM } from '../src/lib/pillars';

/*
  ── The rule a manager will check against their own payslip ──────────────────────────────────────

  lib/incentive was complete and fully tested for weeks, and nothing imported it. The rule was right
  and no customer could see it. These cover the thing that changed — the figure reaching a screen —
  and the one misunderstanding that screen exists to prevent.

  The chart paints a quadrant red from 75% down. The incentive deducts only under 50%. So somebody
  can be looking at three red quadrants and a deduction of nothing, and unexplained that reads as
  the software being broken. It is the rule working: a colour asks for attention, a deduction is a
  consequence.
*/

const page = readFileSync('src/app/scorecard/[roleId]/page.tsx', 'utf8');
const panel = readFileSync('src/components/incentive-panel.tsx', 'utf8');

describe('the incentive, where somebody can see it', () => {
  it('is actually on My Scorecard', () => {
    expect(page, 'the panel must be rendered').toContain('IncentivePanel');
    expect(page, 'and fed a real reading').toContain('incentiveView(');
  });

  it('deducts 5% a quadrant, capped at 25%', () => {
    expect(DEDUCTION_PER_FAILED_PILLAR).toBe(0.05);
    expect(DEDUCTION_CAP).toBe(0.25);
    const five = incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: Array(5).fill(0.1) });
    expect(five.deductionRate).toBe(0.25);
    // A sixth failure cannot take it further. A scheme that can reach zero stops being an incentive.
    const six = incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: Array(6).fill(0.1) });
    expect(six.deductionRate).toBe(0.25);
    expect(six.payable).toBe(five.payable);
  });

  /* The whole reason the panel names them. */
  it('does not deduct for a quadrant that is red but above the failure line', () => {
    expect(WATCH_FROM).toBe(0.75);
    expect(FAILED_BELOW).toBe(0.5);
    // 60%: red on every chart in the product, and worth nothing to the deduction.
    expect(failedPillarCount([0.6, 0.6, 0.6])).toBe(0);
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: 0.8 }], chainPillars: [0.6, 0.6, 0.6] });
    expect(r.deductionRate).toBe(0);
    expect(r.payable).toBe(r.earned);
  });

  it('counts a quadrant under 50% as the failure it is', () => {
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: [0.49, 0.6] });
    expect(r.failedPillars).toBe(1);
    expect(r.deductionRate).toBe(0.05);
  });

  /* Pending is never red, and must never cost anybody money. */
  it('never deducts for a month nobody has marked', () => {
    expect(failedPillarCount([null, null, null])).toBe(0);
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: null }], chainPillars: [null] });
    expect(r.earned).toBe(0);
    expect(r.payable).toBe(0);
  });

  /*
    A figure somebody cannot reconstruct is a figure they will argue with, and rightly. The ceiling,
    the percentage and the deduction all have to be on the page beside the answer.
  */
  it('shows its working rather than announcing a number', () => {
    for (const shown of ['Ceiling', 'Earned', 'Payable']) {
      expect(panel, `${shown} must be on the page`).toContain(shown);
    }
    expect(panel, 'the rates come from the engine, never retyped').toContain('DEDUCTION_PER_FAILED_PILLAR');
    expect(panel, 'and so does the failure line').toContain('FAILED_BELOW');
  });

  it('names each failed quadrant rather than only counting them', () => {
    // A count is an accusation; a list is a conversation.
    expect(panel).toContain('f.roleTitle');
    expect(panel).toContain('redButNotFailed');
  });

  /*
    Showing a doubled ceiling that is not actually held would overstate somebody's pay. Of every
    error this panel could make, that is the one that must never happen.
  */
  it('does not claim Sales Ace doubling until it is wired through', () => {
    expect(page).not.toMatch(/salesAce:\s*true/);
  });
});
