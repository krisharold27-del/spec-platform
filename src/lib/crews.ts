/**
 * Two crews on one job: split scopes, and one supervisor over the whole of it.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"multi crew is common - split scopes with one supervisor overall"*.
 *
 * Both halves are the requirement, and the second is the one a system usually gets wrong. Splitting
 * work is easy — the schedule already allows it, because its uniqueness rule is on person-and-day
 * rather than on job, so any number of people can be put on one job and nobody can be double-booked.
 * What was missing was anywhere to record who carries the WHOLE thing.
 *
 * ── Why that gap is the expensive one ────────────────────────────────────────────────────────────
 *
 * A job split into scopes runs fine right up until the scopes disagree: the switchboard crew is
 * waiting on the lighting crew, someone has to decide which one moves, and the customer is asking
 * one person for an answer about all of it. That is the day accountability matters, and it is
 * exactly the day a system with a lead-per-scope has nobody to point at — every lead is answerable
 * for their part and none of them for the join, which is where the problem always is.
 *
 * So a scope may have a lead, and that lead is not a supervisor. One name carries the job.
 *
 * ── The rule, enforced rather than encouraged ────────────────────────────────────────────────────
 *
 * A job with more than one scope must name a supervisor. Not a warning somebody dismisses — the
 * split is what creates the need, so the moment a second scope appears the question is asked, while
 * somebody is still thinking about the job rather than three weeks later when it has gone wrong.
 *
 * One scope needs nobody: a single crew on a single job already has one person on it, and asking a
 * sparkie to nominate themselves as their own supervisor is the kind of ceremony that teaches
 * people the software is not on their side.
 */

export interface Scope {
  id: string;
  jobId: string;
  /** What this part of the job IS, in the business's words: "Switchboard", "Lighting", "Final fix". */
  name: string;
  /** Who is running this part. NOT a supervisor — see the note above. */
  leadKey: string | null;
  leadName: string | null;
}

export interface SupervisedJob {
  id: string;
  ref: string;
  /** One name over the whole job. Null until somebody says. */
  supervisorKey: string | null;
  supervisorName: string | null;
}

/**
 * More than one scope means more than one crew, which means somebody has to carry the join.
 *
 * Counted rather than flagged. A business cannot forget to tick "this is a multi-crew job" if
 * nothing ever asks them to — the second scope IS the declaration.
 */
export const needsSupervisor = (scopeCount: number): boolean => scopeCount > 1;

export const hasSupervisor = (job: SupervisedJob): boolean =>
  Boolean(job.supervisorName?.trim());

export type CrewState = 'single' | 'split' | 'unheld';

export interface CrewWatch {
  job: SupervisedJob;
  scopes: Scope[];
  state: CrewState;
  says: string;
}

export function crewWatch(job: SupervisedJob, scopes: readonly Scope[]): CrewWatch {
  const mine = scopes.filter(s => s.jobId === job.id);

  if (!needsSupervisor(mine.length)) {
    return {
      job, scopes: mine, state: 'single',
      says: mine.length === 1
        ? `One scope — ${mine[0].name}. Nothing to hold together.`
        : 'One crew, one job.',
    };
  }
  if (!hasSupervisor(job)) {
    return {
      job, scopes: mine, state: 'unheld',
      says: `${mine.length} scopes and nobody over the whole job. The day they disagree — and they will — there is no one name to ask.`,
    };
  }
  return {
    job, scopes: mine, state: 'split',
    says: `${mine.length} scopes, ${job.supervisorName} over all of it.`,
  };
}

/** Every job that has been split and never given somebody to carry it. The list worth acting on. */
export function unheld(
  jobs: readonly SupervisedJob[],
  scopes: readonly Scope[],
): CrewWatch[] {
  return jobs.map(j => crewWatch(j, scopes)).filter(w => w.state === 'unheld');
}

/**
 * Who is on this job, across every scope, without repeating a name.
 *
 * Somebody leading two scopes is one person on the job, and counting them twice would make a
 * three-person job read as four — which matters because this is what the day's headcount and the
 * Take 5 attendance are both built from.
 */
export function onTheJob(scopes: readonly Scope[]): { key: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const s of scopes) {
    if (s.leadKey && s.leadName && !seen.has(s.leadKey)) seen.set(s.leadKey, s.leadName);
  }
  return [...seen].map(([key, name]) => ({ key, name }));
}

/**
 * A scope with nobody running it.
 *
 * Separate from the supervisor question and much softer. A scope written down before anybody has
 * been assigned to it is a normal way to plan a job, so this is a note rather than a fault — it
 * only becomes a problem on the morning the work is meant to start, which is a question for the
 * schedule rather than for this.
 */
export const unled = (scopes: readonly Scope[]): Scope[] =>
  scopes.filter(s => !s.leadName?.trim());

export function crewLine(w: CrewWatch): string {
  if (w.state === 'unheld') return w.says;
  const people = onTheJob(w.scopes);
  if (people.length === 0) return w.says;
  return `${w.says} ${people.length} ${people.length === 1 ? 'crew lead' : 'crew leads'}: ${people.map(p => p.name).join(', ')}.`;
}

/** Said where somebody is about to split a job, so the rule arrives before the refusal does. */
export const WHY_ONE_SUPERVISOR =
  'A second scope means a second crew, and somebody has to carry the join. A lead runs their own part; a supervisor answers for the whole job — including the morning one scope is waiting on another and the customer wants one person to ask.';
