/**
 * The seven statuses a KPI can carry, and how each scores. docs/BUILD_SPEC.md §3.1 is
 * authoritative. The vocabulary is fixed — a business cannot add an eighth.
 *
 *   Y  — confirmed, met, on_track
 *   N  — not_met
 *   NA — watch, pending, not_tracked: excluded from both sides of the pillar fraction
 *
 * Watch is neutral, not a soft fail: started, not finished, outcome not yet known. The guard
 * against abuse is resolveWatchAtLock — Watch two closed months running becomes Not met.
 */
import type { Answer } from './scoring';

export type Status = 'confirmed' | 'on_track' | 'met' | 'watch' | 'not_met' | 'pending' | 'not_tracked';

export interface StatusMeta {
  label: string;
  /** How this status scores. */
  answer: Answer;
  /** What it means, in the words a manager would use. */
  help: string;
  tone: 'good' | 'bad' | 'neutral';
}

export const STATUSES: Record<Status, StatusMeta> = {
  confirmed:   { label: 'Confirmed',   answer: 'Y',  tone: 'good',    help: 'A non-negotiable that held.' },
  on_track:    { label: 'On track',    answer: 'Y',  tone: 'good',    help: 'Inside target, ongoing measure.' },
  met:         { label: 'Met',         answer: 'Y',  tone: 'good',    help: 'Target reached.' },
  watch:       { label: 'Watch',       answer: 'NA', tone: 'neutral', help: 'Started, not finished — the outcome is not known yet. Excluded from the score. Watch two closed months running becomes Not met.' },
  not_met:     { label: 'Not met',     answer: 'N',  tone: 'bad',     help: 'Target missed.' },
  pending:     { label: 'Pending',     answer: 'NA', tone: 'neutral', help: 'Not yet marked this period. Excluded from the score.' },
  not_tracked: { label: 'Not tracked', answer: 'NA', tone: 'neutral', help: 'No system produces this number yet. Excluded from the score — a gap in the business, not a failure by the person.' },
};

export const STATUS_ORDER: Status[] = ['confirmed', 'on_track', 'met', 'watch', 'not_met', 'pending', 'not_tracked'];

export function answerFor(status: string | null | undefined): Answer {
  const meta = STATUSES[status as Status];
  return meta ? meta.answer : '';
}

/** Legacy rows recorded before statuses existed still need something sensible to show. */
export function statusFromAnswer(answer: Answer): Status | null {
  if (answer === 'Y') return 'met';
  if (answer === 'N') return 'not_met';
  if (answer === 'NA') return 'pending';
  return null;
}

/**
 * The Watch guard, applied when a month is locked. `previous` is the same KPI's status in the
 * previous closed month. Something started and still not finished after two months has failed —
 * without this rule, Watch becomes the way a business never fails at anything.
 */
export function resolveWatchAtLock(previous: Status | null, current: Status | null): Status | null {
  return previous === 'watch' && current === 'watch' ? 'not_met' : current;
}
