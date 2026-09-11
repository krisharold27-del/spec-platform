/**
 * Closing the month — pure functions, no I/O.
 *
 * Scoring a month is mostly a question of provenance. Every number is in one of four states, and
 * the difference between them is who or what stands behind it:
 *
 *   fed              — a connected system produced it. Nobody types it, nobody can quietly edit it.
 *   confirmed        — a person put their name against it. That is a complete way to run SPEC.
 *   needs confirming — a manual number with nobody against it yet. Not wrong; not finished.
 *   not tracked      — nothing produces it and nobody can confirm it. A gap in the business,
 *                      reported as a gap and excluded from the score rather than counted as zero.
 *
 * The last one is the rule that makes the whole report honest. A business that scores what it
 * cannot measure is not measuring, it is guessing.
 */
import type { Pillar, RoleScore, Score } from './scoring';
import { PILLARS } from './scoring';
import type { ScorecardRow } from './queries';
import type { Status } from './status';

export type RowState = 'fed' | 'confirmed' | 'needs_confirming' | 'not_tracked' | 'missed' | 'watch';

export const ROW_STATE_LABEL: Record<RowState, string> = {
  fed: 'Fed',
  confirmed: 'Confirmed',
  needs_confirming: 'Needs confirming',
  not_tracked: 'Not tracked',
  missed: 'Not met',
  watch: 'Watch',
};

export interface RowView {
  row: ScorecardRow;
  state: RowState;
  /** A fed number is read-only: it came from a system, and hand-editing it would break the trace. */
  readOnly: boolean;
  /** The source line, with the honest suffix when nobody stands behind it yet. */
  sourceLine: string;
  tone: 'green' | 'amber' | 'red' | 'grey';
}

/**
 * Which of the four states a row is in.
 *
 * `liveSources` is the set of connected systems, matched against what the row says its source is.
 * A row claiming a source that is not connected is NOT treated as fed — that is the case where a
 * number would silently stop updating and nobody would know.
 */
export function rowState(row: ScorecardRow, liveSources: string[]): RowState {
  if (row.status === 'not_tracked') return 'not_tracked';
  if (row.status === 'watch') return 'watch';
  if (row.answer === 'N') return 'missed';
  const source = row.source?.trim().toLowerCase() ?? '';
  const fed = source.length > 0 && liveSources.some(s => s && source.includes(s.toLowerCase()));
  if (fed) return 'fed';
  return row.answer === 'Y' ? 'confirmed' : 'needs_confirming';
}

export function viewRow(row: ScorecardRow, liveSources: string[]): RowView {
  const state = rowState(row, liveSources);
  const base = row.source?.trim() || 'No source named';
  return {
    row,
    state,
    readOnly: state === 'fed',
    // The suffix belongs only to a number nobody has stood behind yet. A confirmed row already has
    // a person against it, and nagging about one that is finished teaches people to ignore the line.
    sourceLine: state === 'needs_confirming' ? `${base} · needs a name against it` : base,
    tone:
      state === 'fed' || state === 'confirmed' ? 'green'
      : state === 'missed' ? 'red'
      : state === 'watch' || state === 'needs_confirming' ? 'amber'
      : 'grey',
  };
}

export interface Flag {
  id: string;
  title: string;
  detail: string;
  severity: 'blocking' | 'noted';
}

/**
 * What has to be looked at before the month is handed up.
 *
 * Blocking flags stop a submission because they would make the report untrue: a miss with no
 * explanation, or a manual number nobody has confirmed. Noted flags do not — a gap that is honestly
 * reported as a gap is a legitimate way to close a month, and pretending otherwise would push
 * people to invent numbers.
 */
export function flagsFor(roles: { roleId: string; title: string; rows: ScorecardRow[]; scored: boolean }[], liveSources: string[]): Flag[] {
  const flags: Flag[] = [];
  for (const role of roles) {
    if (!role.scored) continue;
    for (const r of role.rows) {
      const state = rowState(r, liveSources);
      if (state === 'missed' && !r.note) {
        flags.push({
          id: `unexplained:${r.criterionId}`,
          title: `${role.title}: ${r.text} missed with no reason given`,
          detail: 'A miss with nothing written against it reaches the board as exactly that. Say what happened before the month is handed up.',
          severity: 'blocking',
        });
      }
      if (state === 'needs_confirming') {
        flags.push({
          id: `unconfirmed:${r.criterionId}`,
          title: `${role.title}: ${r.text} has nobody against it`,
          detail: 'A manual number needs a name. Confirm it, or mark it not tracked if the business genuinely cannot measure it.',
          severity: 'blocking',
        });
      }
      if (state === 'not_tracked') {
        flags.push({
          id: `untracked:${r.criterionId}`,
          title: `${role.title}: ${r.text} is not tracked`,
          detail: 'Reported to the board as a gap rather than a score, which is the honest treatment. It is excluded from the fraction on both sides.',
          severity: 'noted',
        });
      }
    }
  }
  return flags;
}

export const blocking = (flags: Flag[]) => flags.filter(f => f.severity === 'blocking');

export interface ProgressLine {
  roleId: string;
  title: string;
  holder: string | null;
  marked: number;
  total: number;
  done: boolean;
  score: Score;
}

export function progressFor(roles: { roleId: string; title: string; holder: string | null; rows: ScorecardRow[]; score: RoleScore; scored: boolean }[]): ProgressLine[] {
  return roles.filter(r => r.scored).map(r => {
    const marked = r.rows.filter(x => x.answer !== '' || x.status).length;
    return {
      roleId: r.roleId, title: r.title, holder: r.holder,
      marked, total: r.rows.length, done: r.rows.length > 0 && marked === r.rows.length,
      score: r.score.overall,
    };
  });
}

export type PeriodStatus = 'open' | 'submitted' | 'locked';

export interface TrailStep {
  step: string;
  who: string;
  state: string;
  done: boolean;
}

/**
 * The four steps between an open month and a closed one. Each names who does it, because a step
 * with no name against it is how a month sits unclosed for three weeks.
 */
export function signoffTrail(
  status: PeriodStatus,
  progress: ProgressLine[],
  people: { gm: string | null; director: string | null; submittedBy: string | null; signedBy: string | null },
): TrailStep[] {
  const done = progress.filter(p => p.done).length;
  const allScored = progress.length > 0 && done === progress.length;
  return [
    {
      step: 'Roles scored',
      who: 'Each manager, for their own reports',
      state: allScored ? 'Done' : `${done} of ${progress.length}`,
      done: allScored,
    },
    {
      step: 'Submitted for sign-off',
      who: people.submittedBy ?? people.gm ?? 'The top of the chart',
      state: status === 'open' ? 'Waiting' : 'Done',
      done: status !== 'open',
    },
    {
      step: 'Signed',
      who: people.signedBy ?? people.director ?? 'The board',
      state: status === 'locked' ? 'Signed' : 'Waiting',
      done: status === 'locked',
    },
    {
      step: 'Period locked',
      who: 'Nothing recalculates history afterwards',
      state: status === 'locked' ? 'Locked' : 'Open',
      done: status === 'locked',
    },
  ];
}

/** The verdict under the live roll-up: the figure the board sees, and whether it is at the standard. */
export function verdict(team: RoleScore | null, threshold = 0.9): { line: string; met: boolean } {
  if (!team) {
    return { line: 'Nothing is scored yet, so there is no figure. A blank month is not a failing one.', met: false };
  }
  const behind = PILLARS.filter(p => { const v = team.pillars[p]; return v !== null && v < threshold; });
  const unscored = PILLARS.filter(p => team.pillars[p] === null);
  if (behind.length === 0 && unscored.length === 0) {
    return { line: `Every pillar is at or above ${Math.round(threshold * 100)}%. Two closed months like this and the business is SPEC.`, met: true };
  }
  const parts: string[] = [];
  if (behind.length) parts.push(`${behind.map(cap).join(', ')} under ${Math.round(threshold * 100)}%`);
  if (unscored.length) parts.push(`${unscored.map(cap).join(', ')} with no score at all`);
  return { line: `${parts.join('; ')}. The 90% rule needs all four, two months running.`, met: false };
}

const cap = (p: Pillar) => p.charAt(0).toUpperCase() + p.slice(1);

/** A status a person may set by hand. A fed row is never set here — it comes from its system. */
export const MANUAL_STATUSES: Status[] = ['confirmed', 'met', 'on_track', 'watch', 'not_met', 'pending', 'not_tracked'];
