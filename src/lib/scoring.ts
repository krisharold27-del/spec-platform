/**
 * SPEC scoring engine — pure functions, no I/O. docs/BUILD_SPEC.md §3 is authoritative.
 *
 *  - Every status scores as Y, N or NA (see lib/status). A blank — nothing marked yet — is Pending,
 *    so it is NA too.
 *  - pillar = Σ(weight where Y) / Σ(weight where Y or N). NA rows are excluded from BOTH sides:
 *    they are absences, not zeros. An unmarked KPI never drags a score down.
 *  - A pillar where every KPI is NA has NO score (null) — not 0 — and is left out of the role mean.
 *  - role = mean of the pillars that have a score. Unweighted: Safety does not outrank Earnings.
 *  - team = mean of role% for every person in the team who has a score. Nobody scored = no score.
 *  - Nothing is rounded here. One decimal is applied at display only, never mid-calculation.
 *  - THE 90% RULE: every pillar of the team roll-up ≥ 90% for two consecutive closed months.
 *  - Hard gates are pass/fail and reported separately: Zero Harm (any LTI/MTI/psychosocial
 *    incident > 0 fails) and Clear to Work (training compliance must be 100%).
 */

export type Pillar = 'safety' | 'people' | 'earnings' | 'compliance';
export const PILLARS: Pillar[] = ['safety', 'people', 'earnings', 'compliance'];

export type Answer = 'Y' | 'N' | 'NA' | '';

/** A fraction 0–1, or null when there was nothing scorable. Null is "no score", never zero. */
export type Score = number | null;

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
  pillars: Record<Pillar, Score>;
  overall: Score;
}

const mean = (xs: number[]): Score => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);
const scored = (xs: Score[]): number[] => xs.filter((x): x is number => x !== null);

/** Score one pillar for one role in one period. Null when nothing in it scored Y or N. */
export function pillarScore(criteria: Criterion[], assessments: Assessment[], pillar: Pillar): Score {
  const byId = new Map(assessments.map(a => [a.criterionId, a.answer]));
  let achieved = 0;
  let decided = 0;
  for (const c of criteria) {
    if (c.pillar !== pillar) continue;
    const answer = byId.get(c.id) ?? '';
    if (answer !== 'Y' && answer !== 'N') continue; // NA and blank leave the calculation entirely
    decided += c.weight;
    if (answer === 'Y') achieved += c.weight;
  }
  return decided === 0 ? null : achieved / decided;
}

/** All four pillar scores plus the role overall — the mean of whichever pillars have a score. */
export function roleScore(criteria: Criterion[], assessments: Assessment[]): RoleScore {
  const pillars = Object.fromEntries(
    PILLARS.map(p => [p, pillarScore(criteria, assessments, p)]),
  ) as Record<Pillar, Score>;
  return { pillars, overall: mean(scored(PILLARS.map(p => pillars[p]))) };
}

/**
 * Team roll-up. People with no score are left out rather than counted as zero.
 *  - overall: mean of role% across the scored people (BUILD_SPEC §3.4).
 *  - pillars: each pillar's mean across the people who have a score in it — what the 90% rule reads.
 */
export function teamScore(roleScores: RoleScore[]): RoleScore {
  const people = roleScores.filter(r => r.overall !== null);
  const pillars = Object.fromEntries(
    PILLARS.map(p => [p, mean(scored(people.map(r => r.pillars[p])))]),
  ) as Record<Pillar, Score>;
  return { pillars, overall: mean(scored(people.map(r => r.overall))) };
}

/*
  The two lines, defined here because lib/pillars imports this file — so they can only live in one
  direction. lib/pillars re-exports them, which is where the long explanation of both sits.
*/
/**
 * The 90% rule — what makes a business SPEC. Two consecutive closed months with every pillar of the
 * team roll-up at or above this. It is the STANDARD, and deliberately not the colour: a business can
 * be green everywhere and still not be SPEC, which is the gap the whole method is about closing.
 */
export const AT_THE_STANDARD = 0.9;

/** Green from here. Set by Kris: 80% or above. */
export const GREEN_FROM = 0.8;

/**
 * Red AT or BELOW this — fifty per cent exactly is red, not amber.
 *
 * The boundary is inclusive on purpose and the name says so. "Under 50" and "50 or under" differ by
 * one case, that case is a round number people actually land on, and getting it wrong here both
 * mis-colours a card and mis-pays somebody, because the incentive fails on this same line.
 */
export const RED_AT_OR_BELOW = 0.5;

export type Band = 'on_track' | 'watch' | 'behind' | 'pending';

/**
 * On track from 80% · Watch above 50% and under 80% · Behind at or below 50% · Pending never coloured.
 *
 * ── Why this changed ─────────────────────────────────────────────────────────────────────────────
 *
 * This used to call a pillar "on track" only at 100% and "behind" only under 50%, while the COLOUR
 * beside it used 90 and 75. Both appear on the same card, so the card contradicted itself:
 *
 *     95%  a GREEN tile labelled "Watch"
 *     60%  a RED tile labelled "Watch"
 *
 * Two of those were live. A card that disagrees with itself is not a scoring instrument, it is a
 * reason to stop trusting the screen — and this is the screen a manager has a pay conversation in
 * front of.
 *
 * The word now reads from the same thresholds as the colour, so there is one traffic light and one
 * vocabulary. The incentive's failure line is a SEPARATE question and lives in lib/incentive.
 */
export function band(score: Score): Band {
  if (score === null) return 'pending';
  if (score >= GREEN_FROM) return 'on_track';
  if (score > RED_AT_OR_BELOW) return 'watch';
  return 'behind';
}

/**
 * The 90% rule. `closedMonths` is every closed month in order, oldest → newest, with no gaps: a
 * month that had no score is passed as null (or with null pillars), and it breaks the run rather
 * than pausing it. A pillar with no score does not qualify.
 */
export function isSpec(closedMonths: (RoleScore | null)[], threshold = 0.9): boolean {
  if (closedMonths.length < 2) return false;
  return closedMonths.slice(-2).every(m => m !== null && PILLARS.every(p => {
    const v = m.pillars[p];
    return v !== null && v >= threshold;
  }));
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
    if (total > 0 && Math.abs(total - 1) > 0.005) problems.push({ pillar: p, total: Math.round(total * 10000) / 10000 });
  }
  return problems;
}
