/**
 * Work in progress — what has been done on an open job against what has been billed for it.
 *
 * ── The gap nobody looks at until the job is finished ────────────────────────────────────────────
 *
 * A trade business's money sits in the space between two numbers: the work that has been done, and
 * the work that has been invoiced. Nobody keeps that gap in their head, and by the time the job is
 * closed it is too late to do anything about it — the claim that was never raised is now an
 * argument, and the job that went over is now the margin.
 *
 * So this compares the two on every open job, every day, and says which way it is out.
 *
 * ── Under-billed and billed ahead are not the same problem ───────────────────────────────────────
 *
 * Under-billed is money earned and not asked for: it is fixed by raising the claim, and it is the
 * one worth chasing. Billed ahead is the opposite — good for cash today, owed back in work, and not
 * a fault at all. A screen that flagged both as "out" would teach people to ignore it.
 *
 * Margin at risk outranks both, because a job that has stopped making money cannot be fixed by
 * billing: it needs a variation while the work is still going on.
 */

import { MARGIN_BENCHMARK } from './jobs';

/** How far apart the two numbers have to be before it is worth saying. */
export const WIP_TOLERANCE_CENTS = 100_000;

/**
 * A forecast margin below this has stopped being a thin job and started being a loss to manage.
 * Below the benchmark is amber — worth watching; this is red, and it outranks any billing gap.
 */
export const MARGIN_AT_RISK = 0.2;

export type WipState = 'at_risk' | 'under_billed' | 'billed_ahead' | 'on_track';

export const WIP_LABEL: Record<WipState, string> = {
  at_risk: 'Margin at risk',
  under_billed: 'Under-billed',
  billed_ahead: 'Billed ahead',
  on_track: 'On track',
};

export interface WipJob {
  id: string;
  ref: string;
  title: string;
  /** What the job was won at. */
  quotedCents: number;
  /** Everything spent so far — labour costed from timesheets, plus materials. */
  costCents: number;
  /** What has actually been invoiced or claimed. */
  billedCents: number;
  /** How far through, 0–1. */
  done: number;
}

export interface WipRow extends WipJob {
  state: WipState;
  /** Billed minus earned. Negative when work has been done and not billed. */
  gapCents: number;
  /** What this job is forecast to make, as a fraction, if it runs to the end the way it is running. */
  margin: number;
  /** What to do about it, in the words somebody would use. */
  advice: string;
  /** The one button, or null when there is nothing to press. */
  action: string | null;
}

const money = (cents: number): string =>
  `$${Math.abs(Math.round(cents / 100)).toLocaleString('en-AU')}`;

/** What the job has earned so far: the quote, times how far through it is. */
export const earnedCents = (j: Pick<WipJob, 'quotedCents' | 'done'>): number =>
  Math.round(j.quotedCents * clamp(j.done));

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/**
 * What this job will make if it carries on the way it is going.
 *
 * Cost so far divided by how far through, scaled to the whole job — not cost against the quote,
 * which reads healthy on every job that has barely started. A job with no progress recorded has no
 * forecast rather than a perfect one; the honest answer to "how is it going" is sometimes "nothing
 * has been recorded yet".
 */
export function forecastMargin(j: Pick<WipJob, 'quotedCents' | 'costCents' | 'done'>): number | null {
  const done = clamp(j.done);
  if (done <= 0 || j.quotedCents <= 0) return null;
  const costToFinish = j.costCents / done;
  return (j.quotedCents - costToFinish) / j.quotedCents;
}

/**
 * How one open job is going.
 *
 * Margin first: a job that has stopped making money is not fixed by an invoice, and putting the
 * billing gap above it would send somebody to raise a claim on a job that needs a variation.
 */
export function wipRow(j: WipJob): WipRow {
  const earned = earnedCents(j);
  const gap = j.billedCents - earned;
  const margin = forecastMargin(j);
  const m = margin ?? MARGIN_BENCHMARK;

  if (margin !== null && margin < MARGIN_AT_RISK) {
    return {
      ...j, state: 'at_risk', gapCents: gap, margin: m,
      advice: `Forecast margin ${Math.round(margin * 100)}%. Raise the variation while the work is still going on — after it is finished this is a conversation, not a claim.`,
      action: 'Draft the variation',
    };
  }
  if (gap < -WIP_TOLERANCE_CENTS) {
    return {
      ...j, state: 'under_billed', gapCents: gap, margin: m,
      advice: `${money(gap)} of work done and not billed. Claim it now.`,
      action: `Raise the claim, ${money(gap)}`,
    };
  }
  if (gap > WIP_TOLERANCE_CENTS) {
    return {
      ...j, state: 'billed_ahead', gapCents: gap, margin: m,
      advice: `${money(gap)} billed ahead of the work. Good for cash — it is owed back in work.`,
      action: null,
    };
  }
  return {
    ...j, state: 'on_track', gapCents: gap, margin: m,
    advice: 'Billing matches the work done.',
    action: null,
  };
}

/** Worst first: margin at risk, then money not asked for, then everything else. */
export function byWipAttention(rows: readonly WipRow[]): WipRow[] {
  const rank = (r: WipRow) =>
    r.state === 'at_risk' ? 0 : r.state === 'under_billed' ? 1 : r.state === 'billed_ahead' ? 2 : 3;
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.gapCents - b.gapCents);
}

export interface WipStats {
  /** Still to deliver on open jobs — the quote less what has been done. */
  toDeliverCents: number;
  underBilledCents: number;
  aheadCents: number;
  atRisk: number;
}

export function wipStats(rows: readonly WipRow[]): WipStats {
  return {
    toDeliverCents: rows.reduce((t, r) => t + Math.max(0, r.quotedCents - earnedCents(r)), 0),
    underBilledCents: rows.filter(r => r.state === 'under_billed').reduce((t, r) => t - r.gapCents, 0),
    aheadCents: rows.filter(r => r.state === 'billed_ahead').reduce((t, r) => t + r.gapCents, 0),
    atRisk: rows.filter(r => r.state === 'at_risk').length,
  };
}

/** The headline, which leads on whatever is costing money rather than on the biggest number. */
export function wipLine(s: WipStats): string {
  if (s.atRisk > 0) {
    return `${s.atRisk} ${s.atRisk === 1 ? 'job has' : 'jobs have'} stopped making money. Raise the variation before the work is finished.`;
  }
  if (s.underBilledCents > 0) {
    return `${money(s.underBilledCents)} of work is done and not billed.`;
  }
  if (s.toDeliverCents > 0) {
    return `${money(s.toDeliverCents)} still to deliver. Everything done is billed.`;
  }
  return 'No open jobs.';
}

export { money as wipMoney };
