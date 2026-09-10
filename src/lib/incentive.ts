/**
 * Monthly SPEC incentive.
 *
 * Two parts:
 *  1. Own performance — the person's overall score against the maximum for their level.
 *  2. Leadership accountability — a leader is reduced by 5% for every SPEC section (pillar)
 *     failed across their direct reports, capped at 25%. A leader whose three reports each fail
 *     one section loses 15%. The point is that a manager carries the sections beneath them, not
 *     only their own scorecard.
 *
 * A section counts as failed when a majority of its SCORED KPIs are not met. Pending and
 * Not tracked are excluded before the majority is worked out, so a pillar nobody can measure yet
 * never costs the leader anything.
 */
import { PILLARS, type Pillar, type RoleScore } from './scoring';

/** Maximum monthly incentive by role level. */
export const INCENTIVE_MAX: Record<string, number> = {
  gm: 4000,
  manager: 2000,
  supervisor: 1000,
  staff: 500,
  apprentice: 250,
};

export const DEDUCTION_PER_FAILED_SECTION = 0.05;
export const DEDUCTION_CAP = 0.25;

export interface PillarTally {
  /** Scored KPIs in this pillar — Pending and Not tracked already removed. */
  scored: number;
  /** Of those, how many were not met. */
  notMet: number;
}

/** A pillar fails when more than half of its scored KPIs were not met. */
export function sectionFailed(tally: PillarTally): boolean {
  if (tally.scored === 0) return false;
  return tally.notMet > tally.scored / 2;
}

export function failedSections(report: Record<Pillar, PillarTally>): Pillar[] {
  return PILLARS.filter(p => sectionFailed(report[p]));
}

export interface IncentiveResult {
  /** Maximum for the level. */
  max: number;
  /** Earned on own performance, before any leadership deduction. */
  base: number;
  /** Sections failed across all direct reports. */
  failedSectionCount: number;
  /** Fraction deducted, already capped. */
  deductionRate: number;
  /** What is actually paid. */
  final: number;
}

/**
 * The incentive is paid on the percentage the person is shown, rounded to one decimal place —
 * not on hidden extra precision. Kris's August overall is 91.67% raw; the pack shows 91.7% and
 * pays $3,668, which is 91.7% of $4,000 rather than 91.67%. Paying on a number nobody can see
 * would be indefensible in a review, so the displayed figure is the figure that counts.
 */
export function displayedRate(overall: number): number {
  return Math.round(overall * 1000) / 1000;
}

export function incentiveFor(
  level: string,
  score: RoleScore,
  directReports: Record<Pillar, PillarTally>[] = [],
): IncentiveResult {
  const max = INCENTIVE_MAX[level] ?? 0;
  // No score means nothing has been earned yet — it is not a zero-percent month.
  const base = score.overall === null ? 0 : Math.round(max * displayedRate(score.overall));

  const failedSectionCount = directReports.reduce((n, r) => n + failedSections(r).length, 0);
  const deductionRate = Math.min(failedSectionCount * DEDUCTION_PER_FAILED_SECTION, DEDUCTION_CAP);

  return {
    max,
    base,
    failedSectionCount,
    deductionRate,
    final: Math.round(base * (1 - deductionRate)),
  };
}
