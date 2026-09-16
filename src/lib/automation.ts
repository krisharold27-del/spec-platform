/**
 * Which parts of a role a coded process could do — pure, no I/O.
 *
 * ── Where this comes from ────────────────────────────────────────────────────────────────────────
 *
 * Kris, 16 September 2026, and he called it "a key for this entire system":
 *
 *   "map the roles that are done and kpi's associated and if able to be mapped and automated then
 *    do it — offer suggestions to the business leader on streamlining and the costs saved."
 *
 * It has a first real case, at JBI Electrical, and the case is the whole argument. Solar quote
 * turnaround was running at four days. The SPEC KPI is one day. The team said one day was not
 * achievable by a person — and they were right. The role was not backfilled; the quoting moved to
 * a coded process and the people kept the site visits and the closing.
 *
 * So the principle SPEC is encoding:
 *
 *   **When SPEC surfaces a KPI a human cannot meet, that gap is the signal to build a process.**
 *
 * That is the opposite of the usual reason for automating something. It is not cost-cutting looking
 * for a victim; it is a standard the business has already agreed to, which a person then cannot
 * reach at the required cadence. The number came first. And the corollary matters just as much: a
 * role a coded process CANNOT absorb is hereby confirmed as a real job, and the person in it gets
 * told plainly what is expected of them instead of being left to wonder.
 *
 * ── What this file will not do ───────────────────────────────────────────────────────────────────
 *
 * It will not decide anything. Every verdict below is a PROPOSAL carrying its own reason, for a
 * leader to adopt or reject — the same shape as lib/predict. SPEC proposes; the leader decides.
 * Nothing here writes to a role, removes a person, or changes a target.
 *
 * And it says `unknown` freely. A classifier that guesses confidently about somebody's job is worse
 * than one that shrugs: the leader would have to check every line anyway, and would stop reading.
 */
import { PILLARS, type Pillar } from './scoring';

/* ─────────────────────────────────────────────────────────────────────────────
 * The four verdicts
 * ───────────────────────────────────────────────────────────────────────────── */

export type Verdict = 'person' | 'assisted' | 'automated' | 'unknown';

export const VERDICT_MEANING: Record<Verdict, string> = {
  person: 'Needs a person. Judgement, relationship or accountability that cannot be handed to a process.',
  assisted: 'A person decides, but the gathering and chasing can be done for them.',
  automated: 'A coded process can do this end to end. A person checks the exceptions.',
  unknown: 'Not enough here to say. Somebody who does the job needs to look at it.',
};

/** What the leader sees as the heading on each group. Plain words, no jargon. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  person: 'Keep with a person',
  assisted: 'Do the legwork for them',
  automated: 'A process can do this',
  unknown: 'Needs somebody to look',
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Reading what kind of work a measure describes
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Measure {
  /** The criterion text, as the business wrote it. */
  text: string;
  pillar: Pillar;
  /** Whether it is a scored number rather than a done/not-done check. */
  kpi: boolean;
  /** The agreed target, if one has been agreed. */
  target?: string | null;
  /** What SPEC proposed, if nothing has been agreed. */
  proposedTarget?: string | null;
  /**
   * Whether the numbers behind it already arrive from a connected system.
   *
   * This is the single strongest signal in the file and the only one that is a FACT rather than a
   * reading of English. A measure whose data already lands in Simpro or HubSpot is a measure a
   * process can compute; one that lives in somebody's head is not, however automatable it sounds.
   */
  fedBySystem?: boolean;
  /**
   * How much of somebody's month this takes, when the business has said.
   *
   * An INPUT, not something SPEC works out. It is the only source of every hours and dollars figure
   * below, and there is no fallback estimate on purpose — see `saving`.
   */
  hoursPerMonth?: number;
}

export interface Assessment {
  verdict: Verdict;
  /** Why, in the leader's words. Always present — a verdict with no reason is an opinion. */
  why: string;
}

/*
  The words that actually separate the two kinds of work.

  This is a reading of English and it is the weakest part of the file, which is why nothing here
  decides anything on its own and why `unknown` is a normal outcome rather than a failure.

  The split is not "hard versus easy". It is whether the measure is about SOMEBODY BEING
  ACCOUNTABLE — a judgement, a relationship, a decision with a name on it — or about work being
  done accurately and on time. A process can do the second all day and cannot do the first at all.
*/
const NEEDS_A_PERSON = [
  // Judgement and decision
  'decide', 'decision', 'judge', 'judgement', 'approve', 'sign off', 'signed off', 'agree', 'negotiat',
  // Relationship and leadership
  'one-to-one', 'one to one', 'coach', 'mentor', 'lead ', 'leadership', 'culture', 'morale',
  'honest communication', 'safe to raise', 'confident', 'capable', 'trained', 'training plan',
  'relationship', 'client visit', 'site visit', 'toolbox', 'prestart', 'pre-start',
  // Presence and care
  'fit for work', 'wellbeing', 'turnover', 'retention', 'recruit', 'hire', 'interview',
  /*
    Safety outcomes, which are accountability before they are anything else.

    "Zero incidents on my sites" is not a counting exercise even though the count is trivially
    automatic. It is the one line on a supervisor's card that says the people who went to work came
    home, and the day SPEC files that under "a process can do this" is the day it has misunderstood
    its own Safety pillar. Reporting counts too: a process can remind, but somebody has to report.
  */
  'incident', 'near miss', 'near-miss', 'hazard', 'injury', 'harm', 'ppe',
];

const A_PROCESS_CAN_DO = [
  // Gathering, compiling, sending, filing
  'report submitted', 'submitted', 'logged', 'recorded', 'record', 'entered', 'captured',
  'timesheet', 'paperwork', 'notes completed', 'documentation', 'filed',
  // Chasing and reminding
  'on time', 'within', 'turnaround', 'response time', 'follow up', 'followed up', 'chased',
  'reminder', 'overdue', 'expiry', 'expired', 'current', 'renewed',
  // Counting and checking
  'count', 'number of', 'ratio', 'percentage', 'share of', 'conversion', 'volume',
  'complete', 'completed', 'closed out', 'reconcil', 'matched', 'duplicate',
  // Producing a document
  'quote', 'quoted', 'invoice', 'invoiced', 'statement', 'pack', 'summary', 'list',
];

const has = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.some(w => t.includes(w));
};

/* ─────────────────────────────────────────────────────────────────────────────
 * The trigger: a standard a person cannot reach
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Is this target beyond what a person can do at the cadence it asks for?
 *
 * The JBI case, exactly: turnaround was four days, the standard is one, and the team said one was
 * not achievable by a human. They were not making an excuse — at the volume and hours involved they
 * were right, and being right is the point. That sentence is the trigger.
 *
 * `actual` is what the business is achieving now, in the same unit as the target. Both are read
 * loosely, because a business writes "1 day", "24 hrs", "same day" and "<1 day" for the same thing.
 *
 * Returns null when there is nothing to compare — which is most of the time, and must never read as
 * "a person can manage it fine".
 */
export function beyondHuman(target: string | null | undefined, actual: string | null | undefined): boolean | null {
  const t = duration(target);
  const a = duration(actual);
  if (t === null || a === null) return null;
  // Not a near miss. A standard a person misses by a whisker is a standard they can be helped to
  // reach; one they miss by a multiple is a different job, and that is what this is looking for.
  return a >= t * 2;
}

/** Hours, from the handful of ways a business writes a turnaround. Null when it is not a duration. */
export function duration(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/same[- ]day/.test(s)) return 8;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(min|minute|hr|hour|day|week)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit.startsWith('min')) return n / 60;
  if (unit.startsWith('hr') || unit.startsWith('hour')) return n;
  if (unit.startsWith('day')) return n * 8;   // a working day, not a calendar one
  return n * 40;                               // a working week
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The assessment
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * What a coded process could do with one measure.
 *
 * Order matters, and it is deliberately most-certain-first:
 *
 *   1. A standard a person cannot reach. The business has already said so; nothing else outranks it.
 *   2. Accountability. A measure about judgement stays with a person even when a system feeds it —
 *      the number being automatic does not make the decision automatic.
 *   3. Fed by a connected system AND clerical. This is the only combination that earns `automated`
 *      on the strength of a fact rather than a reading of English.
 *   4. Clerical, but nothing feeds it yet. `assisted`: worth doing, not yet possible unattended.
 *   5. Anything else: `unknown`, said plainly.
 */
export function assess(m: Measure, opts: { actual?: string | null } = {}): Assessment {
  const beyond = beyondHuman(m.target ?? m.proposedTarget, opts.actual);
  if (beyond === true) {
    return {
      verdict: 'automated',
      why: `The standard is ${m.target ?? m.proposedTarget} and the business is running at ${opts.actual}. `
        + 'That is not a person trying harder — it is a different way of doing the work.',
    };
  }

  if (has(m.text, NEEDS_A_PERSON)) {
    return {
      verdict: 'person',
      why: m.fedBySystem
        ? 'The number can be gathered automatically, but the judgement behind it belongs to somebody with their name on it.'
        : 'This is judgement, a relationship, or an accountability. A process cannot hold any of the three.',
    };
  }

  if (has(m.text, A_PROCESS_CAN_DO)) {
    return m.fedBySystem
      ? {
        verdict: 'automated',
        why: 'The work is gathering, checking or producing, and the data already arrives from a connected system.',
      }
      : {
        verdict: 'assisted',
        why: 'The work itself is clerical, but nothing feeds it yet. Connect the system it lives in and it becomes a process.',
      };
  }

  return {
    verdict: 'unknown',
    why: 'SPEC cannot tell from the wording what kind of work this is. Somebody who does the job should say.',
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The whole role
 * ───────────────────────────────────────────────────────────────────────────── */

export interface RoleReview {
  /** Every measure, with its verdict. */
  lines: (Measure & Assessment)[];
  counts: Record<Verdict, number>;
  /**
   * True only when every measure in the role could move and nothing is unknown.
   *
   * ── Named carefully, and renamed once ────────────────────────────────────────────────────────
   *
   * This was `roleCouldBeAProcess`, which was the wrong name for the right idea. The engine brief
   * is explicit: *"Never insult the owner or the people. The output is 'here's the drudge we can
   * take off your team,' not 'here's who's redundant'"*, and *"No suggestion is ever phrased as a
   * headcount reduction."*
   *
   * What is actually true is narrower and more useful: every measure CURRENTLY ON THE CARD is
   * drudge a process could take on. A scorecard is not a job. The judgement, the relationships and
   * the hundred things nobody wrote down are not on it — so this says the measures could move, and
   * says nothing whatsoever about the person.
   *
   * Deliberately strict either way: one `unknown` means part of the role was never read.
   */
  everyMeasureCouldMove: boolean;
  /** One sentence for the leader, which is what most of them will read. */
  headline: string;
}

export function reviewRole(title: string, measures: (Measure & { actual?: string | null })[]): RoleReview {
  const lines = measures.map(m => ({ ...m, ...assess(m, { actual: m.actual }) }));
  const counts: Record<Verdict, number> = { person: 0, assisted: 0, automated: 0, unknown: 0 };
  for (const l of lines) counts[l.verdict] += 1;

  const everyMeasureCouldMove = lines.length > 0 && counts.person === 0 && counts.unknown === 0;

  return { lines, counts, everyMeasureCouldMove, headline: headline(title, counts, everyMeasureCouldMove, lines.length) };
}

/*
  One sentence, because most leaders will read this and nothing else.

  It has to carry three things without becoming a paragraph: what could move, what must not, and —
  the one most easily lost — what SPEC has not actually read. An `unknown` swallowed into "the other
  two should not move" is a lie of omission, and it is the line a leader would act on.
*/
function headline(title: string, c: Record<Verdict, number>, whole: boolean, total: number): string {
  if (!total) return `${title} has nothing measured yet, so there is nothing to assess.`;
  if (whole) {
    /*
      Positive only, and the negation was removed on purpose.

      This first read "...that is time back, NOT a headcount question", which is the forbidden idea
      smuggled in as a denial. Telling a leader not to think about headcount is how you get them
      thinking about headcount — the word does its work whichever way round it is used. So the
      sentence simply does not go there, and the test bans the word outright rather than trusting
      the next person to phrase the disclaimer well.
    */
    return `Everything ${title} is measured on today is drudge a process could take on. `
      + 'That is time back for whoever holds it — worth asking them what it should buy.';
  }
  if (c.person === total) return `${title} is a person's job from end to end. Nothing here should be automated.`;

  const movable = c.automated + c.assisted;
  const unread = c.unknown ? ` ${c.unknown} of them still need somebody to look.` : '';
  if (!movable) {
    return `Nothing in ${title} can be moved yet.${unread || ` All ${total} need a person.`}`;
  }
  return `${movable} of ${total} measures in ${title} could come off a person's plate; `
    + `${c.person} should not.${unread}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What it is worth
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Saving {
  hoursPerMonth: number;
  hoursPerYear: number;
  costPerYear: number;
  /** True when the figure rests on hours the business has actually estimated, not on a guess. */
  measured: boolean;
  line: string;
}

/**
 * What the time is worth, and nothing more.
 *
 * ── The rule this file will not break ────────────────────────────────────────────────────────────
 *
 * **Hours saved are only counted where the business has said how many hours it takes.** A savings
 * figure invented from a guess is the most dangerous number in this whole product: it is the one a
 * leader would repeat to a board, and the one that would make every other number here untrustworthy
 * the day somebody checked it.
 *
 * So a measure with no stated hours contributes nothing, and the result says how many were counted.
 * An honest small number beats an impressive one nobody can stand behind.
 */
export function saving(lines: (Measure & Assessment)[], hourlyRate: number | null): Saving {
  const movable = lines.filter(l => l.verdict === 'automated');
  const withHours = movable.filter(l => typeof l.hoursPerMonth === 'number' && l.hoursPerMonth > 0);
  const hoursPerMonth = withHours.reduce((n, l) => n + (l.hoursPerMonth ?? 0), 0);
  const hoursPerYear = hoursPerMonth * 12;
  const costPerYear = hourlyRate && hourlyRate > 0 ? Math.round(hoursPerYear * hourlyRate) : 0;

  const measured = withHours.length === movable.length && movable.length > 0;
  return { hoursPerMonth, hoursPerYear, costPerYear, measured, line: savingLine(movable.length, withHours.length, hoursPerMonth, costPerYear, hourlyRate) };
}

function savingLine(movable: number, counted: number, hours: number, cost: number, rate: number | null): string {
  if (!movable) return 'Nothing here is ready to move, so there is nothing to claim.';
  if (!counted) {
    return `${movable} measure(s) could move, but nobody has said how long they take. `
      + 'Until somebody does, SPEC will not put a figure on it.';
  }
  const money = rate && cost > 0 ? `, about $${cost.toLocaleString('en-AU')} a year at $${rate}/hr` : '';
  const caveat = counted < movable
    ? ` Based on ${counted} of ${movable} — the rest have no hours against them and are not counted.`
    : '';
  return `About ${hours} hours a month${money}.${caveat}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Who may read any of this
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The GM, the CEO and the board. Nobody else, ever.
 *
 * Kris: *"only provide this info to the General Manager/CEO and the Board."*
 *
 * This is not ordinary confidentiality, and it is worth being exact about why. A page that says
 * which parts of a job a machine could do is, read from one desk down, a page about whether
 * somebody still has a job. Showing a supervisor that three of their six measures are marked
 * "a process can do this" — before any decision has been made, while it is still a proposal — does
 * real harm to a real person for no gain at all.
 *
 * So it sits above the line where that decision actually gets made. `director` is the board; `gm`
 * runs the business. A manager cannot see it even for their own team, and no administrator can
 * grant it, because the restriction is about what the information DOES rather than about trust.
 */
export type ReviewLevel = 'director' | 'gm' | 'manager' | 'scored' | 'checklist';

export function mayReadAutomationReview(level: ReviewLevel | null | undefined): boolean {
  return level === 'director' || level === 'gm';
}

export const WHY_RESTRICTED =
  'This is only visible to the Managing Director, the CEO and the board. Read one desk down it is a '
  + 'page about whether somebody still has a job, and no proposal should reach anybody in that form '
  + 'before a decision has been made.';

/* ─────────────────────────────────────────────────────────────────────────────
 * Ordering, for the screen
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Most actionable first: what a process can take, then what it can help with, then what needs
 * somebody to look, and last what stays with a person — which needs no action at all.
 */
export const VERDICT_ORDER: Verdict[] = ['automated', 'assisted', 'unknown', 'person'];

export function byPillar(lines: (Measure & Assessment)[]): { pillar: Pillar; lines: (Measure & Assessment)[] }[] {
  return PILLARS
    .map(pillar => ({ pillar, lines: lines.filter(l => l.pillar === pillar) }))
    .filter(g => g.lines.length > 0);
}
