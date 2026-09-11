/**
 * Reading a target out of a template — pure, no I/O.
 *
 * Lives here rather than in lib/provision because provision opens a database connection at import,
 * and every rule in SPEC is meant to be testable without one.
 */

/**
 * A template target is a placeholder, not a number.
 *
 * The seed writes `{utilisation_target, default 85%}`, meaning: this is the business's to decide,
 * and 85% is a sensible opening. Left alone it renders as a variable name leaking through the UI,
 * which looks broken and says the opposite of what it means.
 *
 * So it is split the way the product actually works. The DEFAULT becomes the proposed target — SPEC
 * proposes, the leader edits — and the agreed target stays empty until somebody agrees it. A
 * placeholder with no default proposes nothing, because inventing a number for a business SPEC
 * knows nothing about is the one thing it must never do.
 */
export function resolveTarget(raw: string | undefined | null): { target: string | null; proposed: string | null } {
  const value = raw?.trim();
  if (!value) return { target: null, proposed: null };
  const placeholder = value.match(/^\{([^}]*)\}$/);
  if (!placeholder) return { target: value, proposed: value };
  const fallback = placeholder[1].match(/default\s+(.+)$/i);
  return { target: null, proposed: fallback ? fallback[1].trim() : null };
}

/** What a target reads as before anybody has agreed one. Never a blank, and never a variable name. */
export const targetLabel = (target: string | null, proposed: string | null): string =>
  target ?? (proposed ? `${proposed} proposed, not yet agreed` : 'Not set yet');

/* ─────────────────────────────────────────────────────────────────────────────
 * Whether a target is SOUND, which is a different question from whether it was agreed.
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Which way is good.
 *
 * Gross profit wants to be higher; incidents and overdue invoices want to be lower. Without this a
 * soundness test reads every improvement as a decline for half the measures in the business.
 */
export type Direction = 'higher' | 'lower';

/**
 * How many closed months it takes before SPEC will judge a target at all.
 *
 * Under six, a run of actuals is a season rather than a level: one good quarter, one bad job, one
 * month with a shutdown in it. Judging a target against that would produce a confident answer from
 * evidence that does not support one, which is worse than declining to answer.
 */
export const MIN_MONTHS_TO_JUDGE = 6;

/** The span a target is properly set from, once a business has it. */
export const FULL_HISTORY_MONTHS = 12;

/**
 * The most a target may ask above what the business actually runs at: a fifth.
 *
 * This is a judgement, not a law, and it is written here as one number so it can be argued with —
 * the same treatment as the J curve's discovery benchmark. The reasoning: a target within reach of
 * the actual is a stretch, and a target far outside it is an announcement. People stop trying at
 * announcements, and a measure nobody can ever meet does more damage than no measure at all,
 * because it also teaches everyone that the board's numbers are decoration.
 */
export const MAX_STRETCH = 0.2;

export type Verdict =
  /** At or beyond what the business already achieves. Meeting it requires nothing. */
  | 'too_easy'
  /** Above the actual, within reach of it. */
  | 'sound'
  /** So far above the actual that nobody expects to meet it. */
  | 'out_of_reach'
  /** Not enough closed months to say — an honest gap, never a failure. */
  | 'unproven'
  /** A charter commitment. Not measured against what the business has been managing, by design. */
  | 'absolute';

export interface Soundness {
  verdict: Verdict;
  /** What the business actually runs at, from its own closed months. */
  actual: number | null;
  /** Closed months behind that figure. */
  months: number;
  /** The band a sound target sits in, where one can be computed. */
  band: { from: number; to: number } | null;
  line: string;
}

/**
 * Pull the number out of a result written for a human.
 *
 * Results are stored as people report them — "$827,172 (94.0%)", "40.24%", "16 invoices over 90
 * days". A percentage wins wherever there is one, because a figure in brackets after a dollar
 * amount is the ratio the measure is actually about. Otherwise the first number in the string.
 * Nothing numeric returns null rather than nought: a result of "not measured" is not a result of 0.
 */
export function readNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '');
  const percent = cleaned.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (percent) return Number.parseFloat(percent[1]);
  const first = cleaned.match(/-?\d+(?:\.\d+)?/);
  return first ? Number.parseFloat(first[0]) : null;
}

/**
 * Which way a target points, read from how it is written.
 *
 * "≤ 1%", "Zero incidents" and "No breaches" all mean lower is better. This is SPEC proposing, the
 * same as everywhere else — the direction is stored against the measure and a business that
 * disagrees corrects it, rather than the product insisting it knows.
 */
export function inferDirection(text: string, target: string | null): Direction {
  const both = `${text} ${target ?? ''}`.toLowerCase();
  return /[≤<]|\bzero\b|\bno more than\b|\bwithin\b|\bunder\b|\bnot? \w+s\b|\bvariance\b|\boverdue\b/.test(both)
    ? 'lower'
    : 'higher';
}

/** The level a business actually runs at: the middle month, not the average. */
export function rollingActual(actuals: number[]): number | null {
  if (!actuals.length) return null;
  const sorted = [...actuals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  // The median, because one shutdown month or one enormous job should not move what a business is
  // held to. A mean lets a single freak month reset everybody's target for the year.
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Is this target too easy, too hard, or about right — judged against the business's own record?
 *
 * This is the question nobody asks. A target gets agreed in a room, everybody nods, and then it is
 * either met every month for a year (so it was never a target) or missed every month for a year (so
 * nobody is trying to meet it any more). Both read as a working scorecard from the outside. Both
 * deepen the dip: one because nothing improves, the other because people stop believing the numbers.
 *
 * A charter commitment is exempt and says so. Nought harm is not a stretch above what the business
 * managed last year — see lib/charter.
 */
export function soundness(input: {
  target: number | null;
  actuals: number[];
  direction: Direction;
  basis?: 'absolute' | 'earned';
  /** Appended to every figure in the line, where the measure has one: "%", " days", " invoices". */
  unit?: string;
}): Soundness {
  const { target, actuals, direction } = input;
  const months = actuals.length;
  const actual = rollingActual(actuals);
  const u = input.unit ?? '';
  const show = (n: number) => `${round(n)}${u}`;

  if (input.basis === 'absolute') {
    return {
      verdict: 'absolute', actual, months, band: null,
      line: 'A charter commitment. It is not set from what the business has been managing, and it is not meant to be reachable by improving on last year — it is the line underneath the scorecard.',
    };
  }

  /**
   * A target of nought is a commitment, not a stretch, wherever it appears.
   *
   * The stretch band is relative, and nothing is within a fifth of nought — so a relative test
   * declares every zero target out of reach, including "zero incidents" and "zero breaches". That
   * is a category error rather than a finding: nobody sets zero harm by improving twenty per cent
   * on last year's injuries, and telling a business its zero-incident target is unrealistic would
   * be the single worst sentence this product could produce.
   *
   * These are the charter's absolutes appearing at role level, and they get the charter's treatment.
   */
  if (target === 0) {
    return {
      verdict: 'absolute', actual, months, band: null,
      line: 'A target of nought is a commitment rather than a stretch, so it is not judged against what the business has been managing. Whether it is being held is a separate question from whether it was set well.',
    };
  }

  if (target === null) {
    return {
      verdict: 'unproven', actual, months, band: null,
      line: months >= MIN_MONTHS_TO_JUDGE && actual !== null
        ? `No target is agreed. ${months} closed months put this business at ${show(actual)}, which is where the conversation should start.`
        : 'No target is agreed, and there are not enough closed months to propose one from the business’s own record yet.',
    };
  }

  if (months < MIN_MONTHS_TO_JUDGE || actual === null) {
    return {
      verdict: 'unproven', actual, months, band: null,
      line: `${months} closed ${months === 1 ? 'month' : 'months'} behind this. It takes ${MIN_MONTHS_TO_JUDGE} before a target can be judged against the record rather than against an opinion, so SPEC is not going to say. That is a gap in the history, not a fault in the target.`,
    };
  }

  const band = direction === 'higher'
    ? { from: round(actual), to: round(actual * (1 + MAX_STRETCH)) }
    : { from: round(actual * (1 - MAX_STRETCH)), to: round(actual) };

  const easy = direction === 'higher' ? target <= actual : target >= actual;
  if (easy) {
    return {
      verdict: 'too_easy', actual, months, band,
      line: `This business already runs at ${show(actual)} across ${months} closed months, so the target is met by carrying on exactly as before. A measure that cannot be missed is not measuring anything — it is quietly adding a green light to every month.`,
    };
  }

  const reach = direction === 'higher' ? band.to : band.from;
  const beyond = direction === 'higher' ? target > reach : target < reach;
  if (beyond) {
    return {
      verdict: 'out_of_reach', actual, months, band,
      line: `The record says ${show(actual)} and the target says ${show(target)}. That is further than a fifth above what this business has actually managed in ${months} months, so it will be missed every month — and a measure that is always red stops being read.`,
    };
  }

  return {
    verdict: 'sound', actual, months, band,
    line: `${show(actual)} across ${months} closed months, with the target at ${show(target)}. That is a stretch this business can be held to, because it is above what it does now and inside what it has shown it can do.`,
  };
}

/** The short label. Deliberately about the TARGET, never about the people measured by it. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  too_easy: 'Too easy',
  sound: 'Sound',
  out_of_reach: 'Out of reach',
  unproven: 'Not enough history',
  absolute: 'Charter commitment',
};
