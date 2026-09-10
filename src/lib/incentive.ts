/**
 * Monthly SPEC incentive — pure functions, no I/O. docs/BUILD_SPEC.md §6 is authoritative.
 *
 *   ceiling   = role ceiling × 2 if Sales Ace is held that month, else the role ceiling
 *   earned    = ceiling × role %
 *   deduction = 5% × (pillars under 50% anywhere beneath them in their chain), capped at 25%
 *   payable   = earned × (1 − deduction)
 *
 * A failed pillar means Behind — under 50%. A pillar at 60% is a bad month, not a failure. Failures
 * flow upward only: a leader is never credited for a good team, only reduced for a bad one. A pillar
 * with no score is not a failure — pending is never red.
 *
 * Paid on the percentage the person is shown (one decimal), not on hidden precision: 83.33% shows
 * as 83.3% and pays 2,000 × 0.833 = $1,666. Paying on a number nobody can see is indefensible.
 */
import type { Score } from './scoring';

/** Default ceilings (§6.1). A business may set its own. The director is not in the scheme. */
export const DEFAULT_CEILINGS: Record<string, number | null> = {
  director: null,
  gm: 4000,
  manager: 2000,
  supervisor: 1000,
  specialist: 750,
  technician: 500,
  apprentice: 250,
  staff: 500, // the 6 September build's single staff level — paid as a technician until re-levelled
};

export const DEDUCTION_PER_FAILED_PILLAR = 0.05;
export const DEDUCTION_CAP = 0.25;
export const FAILED_BELOW = 0.5;

/** Pillars that failed — under 50% — among every pillar score beneath this person. */
export function failedPillarCount(chainPillars: Score[]): number {
  return chainPillars.filter(p => p !== null && p < FAILED_BELOW).length;
}

export function displayedRate(pct: number): number {
  return Math.round(pct * 1000) / 1000;
}

export interface HeldRole {
  level: string;
  rolePct: Score;
}

export interface IncentiveInput {
  /** Every role the person holds this month. Two when merged (§4.4). Board roles are never passed. */
  roles: HeldRole[];
  /** Every pillar score beneath them, across every chain they hold, as the chain stood this month. */
  chainPillars: Score[];
  /** Sales Ace held this month (see salesAceByMonth). */
  salesAce?: boolean;
  /** The director can switch the doubling off; the standing still shows with no money attached. */
  salesAceDoubling?: boolean;
  /** The first period runs without incentives; the leader chooses when they switch on (§6.3). */
  incentivesOn?: boolean;
  ceilings?: Record<string, number | null>;
}

export interface IncentiveResult {
  /** False for a director, or anyone whose only roles have no ceiling. */
  inScheme: boolean;
  ceiling: number;
  /** For a merge, the mean of the roles that have a score. */
  rolePct: Score;
  earned: number;
  failedPillars: number;
  deductionRate: number;
  payable: number;
}

export function incentiveFor(i: IncentiveInput): IncentiveResult {
  const table = i.ceilings ?? DEFAULT_CEILINGS;
  const ceilings = i.roles.map(r => table[r.level]).filter((c): c is number => typeof c === 'number');
  const inScheme = ceilings.length > 0;
  // A merge pays the higher of the two ceilings, once — one person doing more, not two people.
  const plain = inScheme ? Math.max(...ceilings) : 0;
  const ceiling = i.salesAce && i.salesAceDoubling !== false ? plain * 2 : plain;

  const pcts = i.roles.map(r => r.rolePct).filter((p): p is number => p !== null);
  const rolePct = pcts.length ? pcts.reduce((s, p) => s + p, 0) / pcts.length : null;

  const failedPillars = failedPillarCount(i.chainPillars);
  const deductionRate = Math.min(failedPillars * DEDUCTION_PER_FAILED_PILLAR, DEDUCTION_CAP);

  // No score means nothing earned yet — not a zero-percent month.
  const paying = inScheme && i.incentivesOn !== false && rolePct !== null;
  const earned = paying ? Math.round(ceiling * displayedRate(rolePct)) : 0;
  return { inScheme, ceiling, rolePct, earned, failedPillars, deductionRate, payable: Math.round(earned * (1 - deductionRate)) };
}

export interface SalesMonth {
  /** Growth meter at or above target, with no month carried by a single deal. */
  outcome: boolean;
  /** Every KPI on the role marked as a sales behaviour was met. */
  behaviours: boolean;
}

/**
 * Sales Ace, month by month, oldest → newest (§6.4). Earned when both halves hold three months
 * running, from that third month — never backdated. Lost by two consecutive months where either
 * half fails, from the second of them. Earned back the same way it was earned the first time.
 */
export function salesAceByMonth(months: SalesMonth[]): boolean[] {
  const held: boolean[] = [];
  let holding = false;
  let good = 0;
  let bad = 0;
  for (const m of months) {
    if (m.outcome && m.behaviours) { good += 1; bad = 0; } else { bad += 1; good = 0; }
    if (!holding && good >= 3) holding = true;
    else if (holding && bad >= 2) holding = false;
    held.push(holding);
  }
  return held;
}

/** The most a sales team could cost with every eligible person holding Sales Ace — shown before switching it on. */
export function salesAceExposure(levels: string[], ceilings: Record<string, number | null> = DEFAULT_CEILINGS) {
  const plain = levels.reduce((s, l) => s + (ceilings[l] ?? 0), 0);
  return { plainMonthly: plain, allHoldingMonthly: plain * 2 };
}
