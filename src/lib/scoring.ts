/**
 * SPEC scoring engine — pure functions, no I/O.
 *
 * Rules (from SPEC_Workbook_Full "How To Use This System" and the Master Scorecard):
 *  - Each role has weighted criteria under four pillars: Safety, People, Earnings, Compliance.
 *  - Answers are Y (achieved), N (not achieved), NA (not applicable), or blank (not yet answered).
 *  - pillar score = Σ(weight where Y) / Σ(weight where answer ≠ NA)
 *    Blank answers count as not achieved but remain in the denominator (matches the workbook,
 *    which returns 0% for an unanswered template).
 *  - person score = mean of the four pillar scores.
 *  - team score per pillar = mean of that pillar across people; overall = mean of the four.
 *  - THE 90% RULE: a business "is SPEC" only when all four team pillar scores are ≥ 0.90
 *    for two consecutive months.
 *  - Hard gates are pass/fail and reported separately: Zero Harm (any LTI/MTI/psychosocial
 *    incident > 0 fails) and Clear to Work (training compliance must be 100%).
 */

export type Pillar = 'safety' | 'people' | 'earnings' | 'compliance';
export const PILLARS: Pillar[] = ['safety', 'people', 'earnings', 'compliance'];

export type Answer = 'Y' | 'N' | 'NA' | '';

export interface Criterion {
  id: string;
  pillar: Pillar;
  text: string;
  /** 0–1. Weights within a pillar should sum to 1 (validated separately). */
  weight: number;
}

export interface Assessment {
  criterionId: string;
  answer: Answer;
  note?: string;
}

export interface RoleScore {
  pillars: Record<Pillar, number>;
  overall: number;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Score one pillar for one role in one period. Returns 0 when nothing is applicable. */
export function pillarScore(
  criteria: Criterion[],
  assessments: Assessment[],
  pillar: Pillar,
): number {
  const byId = new Map(assessments.map(a => [a.criterionId, a.answer]));
  let achieved = 0;
  let applicable = 0;
  for (const c of criteria) {
    if (c.pillar !== pillar) continue;
    const answer = byId.get(c.id) ?? '';
    if (answer === 'NA') continue;
    applicable += c.weight;
    if (answer === 'Y') achieved += c.weight;
  }
  return applicable === 0 ? 0 : round4(achieved / applicable);
}

/** All four pillar scores plus the overall (mean of the four). */
export function roleScore(criteria: Criterion[], assessments: Assessment[]): RoleScore {
  const pillars = Object.fromEntries(
    PILLARS.map(p => [p, pillarScore(criteria, assessments, p)]),
  ) as Record<Pillar, number>;
  const overall = round4(PILLARS.reduce((s, p) => s + pillars[p], 0) / PILLARS.length);
  return { pillars, overall };
}

/** Team rollup: mean of each pillar across roles, and overall mean of the four pillar means. */
export function teamScore(roleScores: RoleScore[]): RoleScore {
  if (roleScores.length === 0) {
    return { pillars: { safety: 0, people: 0, earnings: 0, compliance: 0 }, overall: 0 };
  }
  const pillars = Object.fromEntries(
    PILLARS.map(p => [
      p,
      round4(roleScores.reduce((s, r) => s + r.pillars[p], 0) / roleScores.length),
    ]),
  ) as Record<Pillar, number>;
  const overall = round4(PILLARS.reduce((s, p) => s + pillars[p], 0) / PILLARS.length);
  return { pillars, overall };
}

/** The 90% rule. `monthly` is ordered oldest → newest; only the last two months matter. */
export function isSpec(monthly: RoleScore[], threshold = 0.9): boolean {
  if (monthly.length < 2) return false;
  const lastTwo = monthly.slice(-2);
  return lastTwo.every(m => PILLARS.every(p => m.pillars[p] >= threshold));
}

export interface GateInputs {
  lti: number;
  mti: number;
  psychosocial: number;
  /** 0–1 */
  trainingCompliance: number;
}

export interface GateResult {
  zeroHarm: boolean;
  clearToWork: boolean;
}

/** Hard gates: pass/fail, no partial credit. */
export function gates(input: GateInputs): GateResult {
  return {
    zeroHarm: input.lti === 0 && input.mti === 0 && input.psychosocial === 0,
    clearToWork: input.trainingCompliance >= 1,
  };
}

/** Weights within each pillar must sum to 100% (±0.5% to absorb rounding in source sheets). */
export function validateWeights(criteria: Criterion[]): { pillar: Pillar; total: number }[] {
  const problems: { pillar: Pillar; total: number }[] = [];
  for (const p of PILLARS) {
    const total = criteria.filter(c => c.pillar === p).reduce((s, c) => s + c.weight, 0);
    if (total > 0 && Math.abs(total - 1) > 0.005) problems.push({ pillar: p, total: round4(total) });
  }
  return problems;
}
