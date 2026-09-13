/**
 * The role's card for one month — pure functions, no I/O.
 *
 * The card answers four questions, one per pillar, and shows the working behind each answer: what
 * the target was, what actually happened, whether it is confirmed, and where the number came from.
 * The last of those is the one most reports leave out, and it is the difference between a figure a
 * board can act on and a figure it has to take on trust.
 *
 * Two rules do most of the work here:
 *  - **Not tracked is not a failure.** A KPI with no system and nobody to confirm it is a gap in
 *    the business, reported as a gap. It is excluded from the score rather than counted as a zero.
 *  - **Nothing is silently excluded.** Every row that sits outside the score says so, and the
 *    summary line counts it.
 */
import type { Pillar, Score } from './scoring';
import type { ScorecardRow } from './queries';
import { STATUSES, type Status } from './status';
import { AT_THE_STANDARD, WATCH_FROM } from './pillars';

export type Tone = 'green' | 'amber' | 'red' | 'grey';

/** The tone a status carries on the card. Neutral statuses are grey — never red. */
export function toneOf(row: ScorecardRow): Tone {
  const meta = row.status ? STATUSES[row.status as Status] : undefined;
  if (!meta) return 'grey';
  if (meta.answer === 'Y') return 'green';
  if (meta.answer === 'N') return 'red';
  // Watch is started-and-unfinished, which is worth seeing; pending and not-tracked are absences.
  return row.status === 'watch' ? 'amber' : 'grey';
}

export const labelOf = (row: ScorecardRow): string =>
  (row.status ? STATUSES[row.status as Status]?.label : undefined) ?? 'Pending';

/** A row outside the score: an absence rather than a result. Rendered muted, and always counted. */
export const isExcluded = (row: ScorecardRow): boolean => row.answer !== 'Y' && row.answer !== 'N';

export interface PillarSummary {
  pillar: Pillar;
  score: Score;
  total: number;
  confirmed: number;
  /** Rows that are outside the fraction entirely — not tracked, not marked, or being watched. */
  excluded: number;
  notTracked: number;
  /** The one line under the pillar's name, in the words a manager would use. */
  line: string;
  tone: Tone;
}

export function summarise(rows: ScorecardRow[], pillar: Pillar, score: Score): PillarSummary {
  const mine = rows.filter(r => r.pillar === pillar);
  const excluded = mine.filter(isExcluded);
  const decided = mine.length - excluded.length;
  const confirmed = mine.filter(r => r.answer === 'Y').length;
  const notTracked = mine.filter(r => r.status === 'not_tracked').length;

  // From the constants, never typed: two places holding the same threshold is two places for
  // it to drift, and a threshold that drifts is invisible in review.
  const tone: Tone = score === null ? 'grey' : score >= AT_THE_STANDARD ? 'green' : score >= WATCH_FROM ? 'amber' : 'red';

  let line: string;
  if (!mine.length) {
    line = 'Nothing set against this pillar yet.';
  } else if (!decided) {
    line = `${mine.length} ${mine.length === 1 ? 'measure' : 'measures'}, none marked — this pillar has no score, which is not the same as a bad one.`;
  } else {
    const parts = [`${confirmed} of ${decided} confirmed`];
    if (notTracked) parts.push(`${notTracked} not tracked`);
    const otherExcluded = excluded.length - notTracked;
    if (otherExcluded > 0) parts.push(`${otherExcluded} still to mark`);
    line = `${parts.join(' · ')}.`;
  }

  return { pillar, score, total: mine.length, confirmed, excluded: excluded.length, notTracked, line, tone };
}

export interface ProvenanceLine {
  source: string;
  /** The KPIs this source stands behind on this card. */
  measures: string[];
  /** True when nothing produces this number yet — the honest version of a blank. */
  unbacked: boolean;
}

/**
 * Where these numbers come from.
 *
 * Every figure on the card traces to a system or to the person who confirmed it. A row with neither
 * is listed under "nothing produces this yet", because an unsourced number presented beside sourced
 * ones is the most misleading thing a report can do.
 */
export function provenance(rows: ScorecardRow[]): ProvenanceLine[] {
  const by = new Map<string, string[]>();
  const unbacked: string[] = [];
  for (const r of rows) {
    const source = r.source?.trim();
    if (!source) {
      unbacked.push(r.text);
      continue;
    }
    by.set(source, [...(by.get(source) ?? []), r.text]);
  }
  const out: ProvenanceLine[] = [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([source, measures]) => ({ source, measures, unbacked: false }));
  if (unbacked.length) out.push({ source: 'Nothing produces this yet', measures: unbacked, unbacked: true });
  return out;
}

/**
 * The header line: who prepared the card, who signs it off, the month, and the cadence.
 *
 * A card nobody has put their name to is a draft, and saying so is better than letting it pass for
 * a result.
 */
export function preparedBy(holder: string | null, marks: number): string {
  if (!holder) return 'Nobody holds this role — the card is kept for whoever comes next.';
  return marks ? holder : `${holder} — nothing marked yet`;
}

/** Rows that would reach the board pack as a miss with nothing written against them. */
export const unexplained = (rows: ScorecardRow[]): ScorecardRow[] =>
  rows.filter(r => r.answer === 'N' && !r.note);
