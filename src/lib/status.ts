/**
 * The status labels a business actually uses on a scorecard, and how they score.
 *
 * A tick-box cannot say the difference between a target that was missed and a target nobody can
 * measure yet. "Not tracked" means there is no system producing the number — that is a gap in the
 * business's instrumentation, not a failure by the person, and it must not be scored as one.
 *
 * Scoring is unchanged underneath: every status maps onto the existing Y/N/NA engine.
 *   Y  — achieved
 *   N  — not achieved (Watch included: close is still not met)
 *   NA — excluded from the denominator entirely
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
  confirmed:   { label: 'Confirmed',   answer: 'Y',  tone: 'good',    help: 'Verified against the source. Nothing outstanding.' },
  on_track:    { label: 'On track',    answer: 'Y',  tone: 'good',    help: 'Meeting the target this period.' },
  met:         { label: 'Met',         answer: 'Y',  tone: 'good',    help: 'Target achieved.' },
  watch:       { label: 'Watch',       answer: 'N',  tone: 'bad',     help: 'Close, but under target — scores as not achieved.' },
  not_met:     { label: 'Not met',     answer: 'N',  tone: 'bad',     help: 'Target missed.' },
  pending:     { label: 'Pending',     answer: 'NA', tone: 'neutral', help: 'Agreed but not yet in force. Excluded from the score.' },
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
