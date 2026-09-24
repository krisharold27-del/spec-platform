/**
 * The Ace — one rule, every role in the business.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Complete the training path for your role, then score 90%+ on your board for **three closed months
 * in a row**, and you hold the Ace. Where incentives are switched on for that person, the quarter's
 * incentive doubles. Then the run restarts from zero.
 *
 * It is the same rule for Sales, Jobs, Safety, Office, Crew and Apprentice, and that is the whole
 * design. A business with six different bonus schemes has six arguments; a business with one rule
 * has one conversation, and the only thing that varies between roles is which numbers the board is
 * made of.
 *
 * ── Three CLOSED months, and why it restarts ─────────────────────────────────────────────────────
 *
 * A month counts only once it is closed and signed off — the live month is shown but never counted,
 * because a run that could be won on an unclosed month is a run that gets won by not recording
 * things. And the restart is what stops the Ace becoming a pension: it is held by people who are
 * doing it now, not by whoever had a good quarter in March.
 *
 * ── The board is fed, never typed ────────────────────────────────────────────────────────────────
 *
 * Every number on an Ace board comes from what SPEC already holds — the CRM for sales, the schedule
 * and timesheets for jobs. Nobody types their own score. A board somebody can type is a board that
 * measures typing.
 */

/** How many closed months in a row it takes. */
export const RUN_LENGTH = 3;

/** The score a month has to reach to count towards a run. */
export const ACE_STANDARD = 90;

export type AceKind = 'sales' | 'jobs' | 'safety' | 'office' | 'crew' | 'apprentice';

export const ACES: { key: AceKind; label: string; who: string; blurb: string }[] = [
  { key: 'sales', label: 'Sales Ace', who: 'Estimators and anybody who quotes', blurb: 'Fed live from the CRM: quotes out within two days, win rate, leads followed up within 24 hours, pipeline coverage, quoted margin.' },
  { key: 'jobs', label: 'Jobs Ace', who: 'Operations managers and site supervisors', blurb: 'Fed from the schedule, timesheets and sign-offs: billable hours, jobs on the hours quoted, rework, same-day sign-off, safety actions closed on time.' },
  { key: 'safety', label: 'Safety Ace', who: 'Whoever carries safety', blurb: 'Reports closed on time, corrective actions, Clear to Work across the crew, zero harm.' },
  { key: 'office', label: 'Office Ace', who: 'Admin and accounts', blurb: 'Invoices out on sign-off, debtors chased on the ladder, pay run checked before it goes.' },
  { key: 'crew', label: 'Crew Ace', who: 'Technicians', blurb: 'Billable hours, jobs finished on the hours quoted, SWMS signed, sign-off the same day.' },
  { key: 'apprentice', label: 'Apprentice Ace', who: 'Apprentices', blurb: 'Training path, hours logged, supervision signed off, the ticket on time.' },
];

export const isAceKind = (v: string): v is AceKind => ACES.some(a => a.key === v);

export const aceLabel = (v: string): string => ACES.find(a => a.key === v)?.label ?? 'Ace';

/** One month in a run. `score` is null while the month is still open. */
export interface AceMonth {
  /** YYYY-MM. */
  period: string;
  score: number | null;
  closed: boolean;
}

export interface Run {
  /** How many closed months in a row are at or above the standard, counting back from the latest. */
  streak: number;
  /** True when the path is done and the streak is long enough. */
  held: boolean;
  /** How many more closed months at the standard it would take. */
  toGo: number;
  /** The live month, which is shown and never counted. */
  live: AceMonth | null;
}

/**
 * Where somebody is in their run.
 *
 * Counts back from the most recent CLOSED month and stops at the first one below the standard —
 * "three in a row" means in a row. A run of 90, 85, 92, 94 is a streak of two, not three.
 */
export function runOf(months: readonly AceMonth[], pathComplete: boolean): Run {
  const closed = months.filter(m => m.closed);
  const live = months.find(m => !m.closed) ?? null;

  let streak = 0;
  for (let i = closed.length - 1; i >= 0; i--) {
    if ((closed[i].score ?? 0) >= ACE_STANDARD) streak++;
    else break;
  }
  const capped = Math.min(streak, RUN_LENGTH);
  return {
    streak: capped,
    held: pathComplete && capped >= RUN_LENGTH,
    toGo: Math.max(0, RUN_LENGTH - capped),
    live,
  };
}

/**
 * What the run says, in a sentence.
 *
 * Names what is missing rather than congratulating progress. Somebody two months in wants to know
 * the training path is the thing standing in the way, not that they are doing well.
 */
export function runLine(r: Run, pathComplete: boolean): string {
  if (r.held) return `Ace. Held on ${RUN_LENGTH} closed months at ${ACE_STANDARD}%+ — the run restarts now.`;
  if (!pathComplete) {
    return r.streak > 0
      ? `${r.streak} of ${RUN_LENGTH} months at ${ACE_STANDARD}%+, and the training path is not finished. The path is what is standing in the way.`
      : 'The training path for this role is not finished yet. That comes before the run starts.';
  }
  if (r.streak === 0) return `No closed month at ${ACE_STANDARD}%+ yet. ${RUN_LENGTH} in a row does it.`;
  return `${r.streak} of ${RUN_LENGTH}. ${r.toGo} more closed ${r.toGo === 1 ? 'month' : 'months'} at ${ACE_STANDARD}%+.`;
}

/**
 * What an incentive is worth if the run lands.
 *
 * Shown only where incentives are switched on for that person — a doubled number in front of
 * somebody who is not on an incentive is a promise nobody made.
 */
export function atStake(ceilingCents: number, on: boolean): number | null {
  return on ? ceilingCents * 2 : null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The board
 * ───────────────────────────────────────────────────────────────────────────── */

export interface BoardLine {
  label: string;
  value: string;
  target: string;
  /** 0–100, how close this line is to its own target. */
  score: number;
}

/** The board's score: the average of its lines, capped at 100 so one runaway cannot carry the rest. */
export function boardScore(lines: readonly BoardLine[]): number {
  if (!lines.length) return 0;
  return Math.round(lines.reduce((t, l) => t + Math.min(100, l.score), 0) / lines.length);
}

/** How close a number is to its target, as a percentage, where more is better. */
export const towards = (value: number, target: number): number =>
  target <= 0 ? 100 : Math.max(0, Math.round((value / target) * 100));

/** …and where LESS is better — rework, overdue actions, days to quote. */
export const under = (value: number, target: number): number =>
  value <= target ? 100 : target <= 0 ? 0 : Math.max(0, Math.round((target / value) * 100));

/**
 * What to do today: the actions that move the board most.
 *
 * Not a to-do list somebody typed — each one is a row SPEC is already holding that is dragging a
 * line down, with the reason attached. And nothing sends without approval: SPEC drafts the message,
 * a person presses the button.
 */
export interface AceAction {
  id: string;
  title: string;
  /** Why this one, in numbers. A reason without a number is an opinion. */
  why: string;
  /** What the button says. */
  action: string;
  where: string;
}
