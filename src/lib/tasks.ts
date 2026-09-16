/**
 * Breaking a role into tasks, and sorting them — pure, no I/O.
 *
 * ── The engine, not the instance ─────────────────────────────────────────────────────────────────
 *
 * The solar quoting build was the first one done by hand. This is the thing that finds the next
 * hundred without anybody having to spot each one.
 *
 *   "any sequential, rule-based job can be automated. What's left are the must-do human jobs —
 *    those get protected and streamlined. SPEC sorts one from the other."
 *
 * ── Why tasks and not KPIs ───────────────────────────────────────────────────────────────────────
 *
 * The first version of this assessed KPIs, because KPIs were already in the database. It worked and
 * it was the wrong unit. A KPI is an OUTCOME — "quote turnaround within 1 day" — and an outcome is
 * not a thing you can build. What you build is the work behind it: read the enquiry, find the roof,
 * size the system, price it, send it. Those are tasks, they are what a brief describes, and one KPI
 * usually sits on several of them.
 *
 * The KPI still matters, and it decides the ORDER: a failing KPI is what makes a task worth doing
 * first. But it is the reason, not the unit.
 *
 * ── The rule that outranks everything below ──────────────────────────────────────────────────────
 *
 * From the brief's guardrails, and it governs every sentence this file produces:
 *
 *   **"Never insult the owner or the people. The output is 'here's the drudge we can take off your
 *   team,' not 'here's who's redundant.'"**
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * What kind of work a task is
 * ───────────────────────────────────────────────────────────────────────────── */

export type TaskKind = 'sequential' | 'judgement' | 'mixed';

export const KIND_MEANING: Record<TaskKind, string> = {
  sequential: 'Same steps every time. The inputs and the outputs are known.',
  judgement: 'Somebody has to weigh it up, be there, or put their name to it.',
  mixed: 'A judgement wrapped in admin — the thinking is a person\'s, the compiling is not.',
};

/*
  The words that separate the two.

  A reading of English, and the weakest thing in the file — which is why a task can be re-tagged by
  the person who does it, and why `mixed` is the honest answer whenever both kinds of signal appear
  rather than a tie being broken silently.

  MIXED IS THE MOST VALUABLE OUTCOME HERE, and it is worth saying why. A supervisor's weekly report
  is judgement (what did I see on site) wrapped in admin (finding the numbers, formatting the thing,
  chasing the stragglers). Automating it whole would throw away the observation, which was the only
  part worth having. Leaving it alone keeps a supervisor doing data entry on a Friday afternoon.
  Splitting it gives the business both. Most real work in a trade business is mixed.
*/
const JUDGEMENT_WORDS = [
  'decide', 'decision', 'judge', 'assess', 'approve', 'sign off', 'sign-off', 'negotiate', 'agree',
  'visit', 'walk', 'inspect', 'meet', 'meeting', 'call with', 'phone', 'conversation', 'discuss',
  'coach', 'mentor', 'train', 'lead', 'manage', 'supervise', 'review with', 'one-to-one',
  'toolbox', 'prestart', 'pre-start', 'induct', 'interview', 'hire', 'discipline', 'performance',
  'quote a', 'price up', 'estimate', 'scope', 'design', 'plan', 'prioritise', 'resolve', 'complaint',
  'incident', 'near miss', 'hazard', 'injury', 'safety',
];

const SEQUENTIAL_WORDS = [
  'raise', 'issue', 'send', 'email', 'file', 'log', 'enter', 'record', 'copy', 'update',
  'chase', 'remind', 'follow up', 'collect', 'gather', 'compile', 'collate', 'assemble',
  'reconcile', 'match', 'check against', 'cross-check', 'verify', 'validate',
  'report', 'export', 'import', 'upload', 'download', 'format', 'print', 'distribute',
  'timesheet', 'invoice', 'purchase order', ' po ', 'statement', 'spreadsheet', 'list',
  'count', 'calculate', 'total', 'schedule', 'book in', 'allocate', 'assign',
];

const hit = (text: string, words: string[]) => {
  const t = ` ${text.toLowerCase()} `;
  return words.some(w => t.includes(w));
};

export interface Tagged {
  kind: TaskKind;
  /** Why it was tagged that way. Every score in this engine has to be explainable. */
  why: string;
}

/**
 * What kind of work this task is, from how somebody described it.
 *
 * Both kinds of signal present means `mixed`, never a coin toss. Neither present means `judgement`,
 * and that default is deliberate: an unrecognised task belongs to the person who does it until
 * somebody says otherwise. Guessing `sequential` on a description SPEC could not read would put
 * unread work into the build queue, which is exactly the wrong direction to be wrong in.
 */
export function tagTask(name: string): Tagged {
  const judgement = hit(name, JUDGEMENT_WORDS);
  const sequential = hit(name, SEQUENTIAL_WORDS);

  if (judgement && sequential) {
    return {
      kind: 'mixed',
      why: 'Part of this needs somebody to weigh it up, and part of it is admin around that. Worth splitting.',
    };
  }
  if (sequential) {
    return { kind: 'sequential', why: 'Same steps every time, with known inputs and outputs.' };
  }
  if (judgement) {
    return { kind: 'judgement', why: 'This needs a person to weigh it up, be there, or put their name to it.' };
  }
  return {
    kind: 'judgement',
    why: 'SPEC could not read what kind of work this is, so it stays with the person who does it until they say otherwise.',
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The three buckets
 * ───────────────────────────────────────────────────────────────────────────── */

export type Bucket = 'automate' | 'streamline' | 'keep_human';

export const BUCKET_LABEL: Record<Bucket, string> = {
  automate: 'Automate',
  streamline: 'Streamline',
  keep_human: 'Keep human',
};

export const BUCKET_MEANING: Record<Bucket, string> = {
  automate: 'Build it. The steps are known and the systems it needs are connected.',
  streamline: 'Half-build it. Strip the admin out and leave the person the part that needed them.',
  keep_human: 'This is the job. It gets protected, and whoever does it gets told plainly what good looks like.',
};

export interface Task {
  id: string;
  name: string;
  kind: TaskKind;
  /** Hours a week across everyone who does it, when the business has said. Never estimated. */
  hoursPerWeek?: number | null;
  /** Connected-system categories this task reads from or writes to. */
  systems: string[];
  /** Which KPI it feeds, if any. */
  kpi?: { text: string; met: boolean | null } | null;
  /** How much it hurts, from the intake box. Higher is worse. */
  pain?: number;
  /**
   * True for anything safety- or compliance-critical.
   *
   * The brief is unambiguous: *"never fully automate. Best case is streamline with mandatory human
   * sign-off, and the brief must say so."* This is the one flag that overrides every other signal,
   * including a perfectly sequential description and every system being connected.
   */
  critical?: boolean;
}

export interface Sorted {
  bucket: Bucket;
  /** Why it landed there, in the leader's words. */
  why: string;
  /**
   * Systems it needs that are not connected yet.
   *
   * Never a reason to hide the task — the brief says list it and mark it. A task nobody can see is
   * a task nobody connects the system for.
   */
  needs: string[];
  /** True when a person must sign off before anything this builds takes effect. */
  humanSignOff: boolean;
}

/**
 * Which bucket a task belongs in, and what is standing in its way.
 *
 * Order is most-binding-first. Safety outranks everything; after that the kind of work decides, and
 * a missing connection is recorded as a blocker rather than as a demotion.
 */
export function sortTask(task: Task, liveSystems: readonly string[]): Sorted {
  const live = new Set(liveSystems);
  const needs = task.systems.filter(s => !live.has(s));

  if (task.critical) {
    return {
      bucket: 'streamline',
      why: 'Safety and compliance work never gets fully automated. The admin around it can go; '
        + 'the judgement and the sign-off stay with a person, by name.',
      needs,
      humanSignOff: true,
    };
  }

  if (task.kind === 'judgement') {
    return {
      bucket: 'keep_human',
      why: 'This is the job. A process cannot weigh it up, be there, or carry the consequence.',
      needs: [],
      humanSignOff: false,
    };
  }

  if (task.kind === 'mixed') {
    return {
      bucket: 'streamline',
      why: 'The thinking here is a person\'s and the admin around it is not. Take the admin; leave the thinking.',
      needs,
      humanSignOff: true,
    };
  }

  // Sequential. The only bucket that means "build the whole thing".
  return {
    bucket: 'automate',
    why: needs.length
      ? `Same steps every time, so it can be built — once ${needs.join(' and ')} ${needs.length === 1 ? 'is' : 'are'} connected.`
      : 'Same steps every time, and everything it needs is already connected.',
    needs,
    humanSignOff: false,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Automation fit
 * ───────────────────────────────────────────────────────────────────────────── */

export type Fit = 'high' | 'medium' | 'low';

/**
 * How buildable this is right now.
 *
 * Distinct from the bucket on purpose. The bucket says what KIND of thing it is and does not change
 * when a system gets connected; the fit says how ready it is today, and does. A leader deciding
 * what to build next quarter reads the bucket; a leader deciding what to build next week reads this.
 */
export function fitOf(task: Task, sorted: Sorted): Fit {
  if (sorted.bucket === 'keep_human') return 'low';
  if (sorted.needs.length) return 'medium';
  return sorted.bucket === 'automate' ? 'high' : 'medium';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The order to do them in
 * ───────────────────────────────────────────────────────────────────────────── */

export type Scored = Task & Sorted & { fit: Fit };

export function score(task: Task, liveSystems: readonly string[]): Scored {
  const sorted = sortTask(task, liveSystems);
  return { ...task, ...sorted, fit: fitOf(task, sorted) };
}

/**
 * Failing KPI first, then hours saved, then pain.
 *
 * ── Why a failing KPI outranks a bigger time saving ──────────────────────────────────────────────
 *
 * A task that takes ten hours a week and feeds a KPI the business is already hitting is ten hours of
 * something that is working. A task that takes two hours and feeds a KPI nobody can meet is the
 * thing the business is actually failing at — and, per the principle this whole engine rests on, a
 * standard a person cannot reach is the signal to build rather than a person to push harder.
 *
 * Hours are a saving. A failing KPI is a promise the business is breaking.
 *
 * `keep_human` never ranks, because there is nothing to queue. Those are listed separately, with
 * what is expected of the person rather than with a build order.
 */
export function rank<T extends Scored>(scored: T[]): T[] {
  return scored
    .filter(t => t.bucket !== 'keep_human')
    .slice()
    .sort((a, b) => {
      const failing = Number(b.kpi?.met === false) - Number(a.kpi?.met === false);
      if (failing) return failing;
      const hours = (b.hoursPerWeek ?? 0) - (a.hoursPerWeek ?? 0);
      if (hours) return hours;
      const pain = (b.pain ?? 0) - (a.pain ?? 0);
      if (pain) return pain;
      // Stable and readable when everything else ties, so the list does not reshuffle on reload.
      return a.name.localeCompare(b.name);
    });
}

/**
 * The top ten get the full build brief; the rest are a backlog.
 *
 * Ten because a leader will act on ten and will skim a hundred. The backlog is not hidden — the
 * count is shown and it can be opened — but the page leads with what somebody could start on Monday.
 */
export const TOP_N = 10;

export const topAndBacklog = <T extends Scored>(ranked: T[]) => ({
  top: ranked.slice(0, TOP_N),
  backlog: ranked.slice(TOP_N),
});

/* ─────────────────────────────────────────────────────────────────────────────
 * The summary a leader reads first
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Summary {
  roles: number;
  tasks: number;
  /**
   * Hours a week of sequential admin — the automatable pool.
   *
   * Counted only from tasks whose hours somebody actually stated. The brief's own guardrail: *"The
   * engine never invents a KPI target or a cost saving. If it doesn't have the number, it says so."*
   */
  sequentialHoursPerWeek: number;
  /** How many of those tasks had no hours against them, so the figure above is honest about itself. */
  uncounted: number;
  /** Failing KPIs that at least one automate or streamline candidate would move. */
  failingKpisAddressable: number;
  line: string;
}

export function summarise(roles: number, scored: Scored[]): Summary {
  const movable = scored.filter(t => t.bucket !== 'keep_human');
  const counted = movable.filter(t => typeof t.hoursPerWeek === 'number' && t.hoursPerWeek! > 0);
  const sequentialHoursPerWeek = counted.reduce((n, t) => n + (t.hoursPerWeek ?? 0), 0);

  const failing = new Set(
    movable.filter(t => t.kpi?.met === false).map(t => t.kpi!.text),
  );

  return {
    roles,
    tasks: scored.length,
    sequentialHoursPerWeek,
    uncounted: movable.length - counted.length,
    failingKpisAddressable: failing.size,
    line: summaryLine(roles, scored.length, movable.length, counted.length, sequentialHoursPerWeek, failing.size),
  };
}

function summaryLine(
  roles: number, tasks: number, movable: number, counted: number, hours: number, failing: number,
): string {
  if (!tasks) return `${roles} role(s) reviewed, and no tasks written down against any of them yet.`;

  const hoursPart = counted === 0
    ? 'Nobody has said how long any of them take, so there is no figure to quote yet'
    : `${hours} hours a week of it has been counted${counted < movable ? `, across ${counted} of ${movable}` : ''}`;

  const kpiPart = failing
    ? ` ${failing} KPI${failing === 1 ? '' : 's'} the business is currently missing would be moved by this work.`
    : '';

  return `${tasks} tasks across ${roles} role(s). ${movable} could move off somebody's plate. ${hoursPart}.${kpiPart}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Matching what somebody wrote in to the work it is about
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Which task somebody's complaint is about, or null when nothing is close enough.
 *
 * ── Why prefixes rather than stemming ────────────────────────────────────────────────────────────
 *
 * The first version chopped -ing, -ed and -s off each word. It turned "chasing" into "cha" — strip
 * the -ing, then strip the trailing s of what was left — and "I spend Friday afternoons chasing
 * timesheets" failed to reach "Chase timesheets that have not been submitted". The complaint would
 * have created a second task saying the same thing as one that already existed, which is how an
 * intake box fills with duplicates and stops being read.
 *
 * Comparing on a shared prefix does the same job without the trap: chase/chasing, walk/walks,
 * submit/submitted and quote/quoted all meet at four characters, and nothing has to be chopped off
 * correctly for it to work.
 */
export function bestMatch(text: string, tasks: { id: string; name: string }[]): string | null {
  const stop = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it',
    'i', 'we', 'my', 'our', 'this', 'that', 'with', 'at', 'be', 'are', 'do', 'does', 'have', 'has',
    'spend', 'want', 'every', 'all', 'takes', 'take', 'hate', 'always', 'not', 'been', 'from']);

  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !stop.has(w));

  /**
   * Same word, allowing for how it was conjugated.
   *
   * The SHARED prefix has to reach four characters — not "the first min(length) characters match",
   * which was the first attempt and failed on the exact case this was written for: `chasing` and
   * `chase` agree for four characters and then disagree at the fifth, so comparing five got nothing.
   *
   * Four is the floor because three lets `sit` reach `site` and `pay` reach `payroll`, which is how
   * a matcher starts confidently filing complaints under the wrong job.
   */
  const alike = (a: string, b: string) => {
    if (a === b) return true;
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
    return n >= 4;
  };

  const mine = words(text);
  if (!mine.length) return null;

  let best: { id: string; overlap: number } | null = null;
  for (const t of tasks) {
    const theirs = words(t.name);
    let overlap = 0;
    for (const w of mine) if (theirs.some(x => alike(w, x))) overlap += 1;
    if (!best || overlap > best.overlap) best = { id: t.id, overlap };
  }

  /*
    Two shared words. One is a coincidence.

    "Report", "job" and "site" appear in half the task list of a trade business, and matching on a
    single one would file every complaint under the same heading — which looks like the box is
    working and means nobody's problem is ever actually read.
  */
  return best && best.overlap >= 2 ? best.id : null;
}
