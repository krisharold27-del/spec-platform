/**
 * People — pure functions, no I/O.
 *
 * Two things a business does with people: look after the ones it has, and find the ones it needs.
 * Both are answered from the chart rather than from a separate HR silo, because the role is what
 * the business actually needs and the person is who is in it.
 *
 * The rule that shapes this file: **records held against a PERSON sit outside the scorecard.** Pay,
 * leave and personal documents are nobody's KPI. They appear here, they gate Clear to Work, and
 * they never become a score.
 */
import type { Pillar } from './scoring';
import { PILLARS } from './scoring';

export type Placement = 'held' | 'pencilled' | 'vacant';

export interface PersonRow {
  roleId: string;
  roleTitle: string;
  name: string | null;
  placement: Placement;
  /** Whether they hold a seat — invited or signed in. A name on the chart costs nothing. */
  seated: boolean;
  /** Compliance measures on their role that are currently missed. */
  blocking: string[];
  /** Training modules on their role's path that are overdue. */
  overdue: string[];
}

export type ClearState = 'clear' | 'blocked' | 'unknown';

export interface ClearToWork {
  state: ClearState;
  label: string;
  note: string;
}

/**
 * Clear to Work, per person.
 *
 * Pass or fail, and never a percentage: somebody is either allowed on site or they are not. Where
 * nothing has been recorded the answer is "not established" rather than "clear" — assuming clear
 * because nobody checked is exactly the failure the gate exists to prevent.
 */
export function clearToWork(person: PersonRow): ClearToWork {
  if (person.placement === 'vacant') {
    return { state: 'unknown', label: 'Nobody in the role', note: 'Nothing to establish until somebody holds it.' };
  }
  const reasons = [...person.blocking, ...person.overdue];
  if (reasons.length) {
    return {
      state: 'blocked',
      label: 'Not clear',
      note: `${reasons.join('; ')}. Clear to Work is a hard gate — pass or fail, and reported separately from every score.`,
    };
  }
  if (!person.seated) {
    return {
      state: 'unknown',
      label: 'Not established',
      note: 'Pencilled in and not invited, so nothing has been recorded against them yet. Not established is not the same as clear.',
    };
  }
  return { state: 'clear', label: 'Clear to work', note: 'Nothing on their role is blocking.' };
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  note: string;
}

/**
 * What has to happen before somebody is genuinely working, in the order it happens.
 *
 * Each step is read from something the business actually did, so nobody ticks anything here: the
 * step is done when the thing is done.
 */
export function onboarding(person: PersonRow, hasPath: boolean, pathComplete: boolean, signedOff: boolean): OnboardingStep[] {
  return [
    {
      key: 'placed',
      label: 'In a role on the chart',
      done: person.placement !== 'vacant',
      note: person.placement === 'pencilled'
        ? 'Pencilled in. Free, silent, and reversible until you invite them.'
        : person.placement === 'held' ? 'Assigned.' : 'Nobody in this role yet.',
    },
    {
      key: 'seated',
      label: 'Invited in',
      done: person.seated,
      note: person.seated
        ? 'They have a way into SPEC. This is the seat that bills.'
        : 'No account yet, so nothing is recorded against them and nothing is charged.',
    },
    {
      key: 'path',
      label: 'Training path assigned',
      done: hasPath,
      note: hasPath ? 'Inherited from the role.' : 'The role has no path set, so there is nothing for them to complete.',
    },
    {
      key: 'trained',
      label: 'Path complete',
      done: pathComplete,
      note: pathComplete ? 'Every module passed.' : 'Still working through it.',
    },
    {
      key: 'signed',
      label: 'Signed off as capable',
      done: signedOff,
      note: signedOff
        ? 'Their manager has confirmed it. The Ace run can start from here.'
        : 'A manager’s decision about somebody they work with — never something the bar awards itself.',
    },
  ];
}

export interface Vacancy {
  roleId: string;
  title: string;
  /** Scored roles leave a hole in the roll-up; a checklist role leaves a hole in the work. */
  scored: boolean;
  /** Pillars the role's own KPIs sit under — what stops being measured while it is empty. */
  pillars: Pillar[];
  /** Roles reporting into the vacancy, who currently have no direct manager. */
  orphaned: number;
}

/**
 * What an empty role actually costs, in the terms the business already uses.
 *
 * Never in dollars: SPEC does not know what the work was worth, and inventing a figure to make the
 * point would undermine every real number on the page.
 */
export function costOfVacancy(v: Vacancy): string {
  const parts: string[] = [];
  if (v.scored && v.pillars.length) {
    parts.push(`${v.pillars.map(cap).join(', ')} ${v.pillars.length === 1 ? 'has' : 'have'} nothing measuring ${v.pillars.length === 1 ? 'it' : 'them'} at this level`);
  }
  if (v.orphaned) {
    parts.push(`${v.orphaned} ${v.orphaned === 1 ? 'role reports' : 'roles report'} into it with no direct manager`);
  }
  if (!parts.length) return 'Nothing is measured through this role yet, so the chart is the only thing missing it.';
  return `${parts.join(', and ')}. A vacancy usually shows up as amber numbers around it before it shows up as its own.`;
}

const cap = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

export type Stage = 'applied' | 'screening' | 'interview' | 'offer' | 'placed' | 'declined';

export const STAGES: { key: Stage; label: string; note: string }[] = [
  { key: 'applied', label: 'Applied', note: 'In the pile.' },
  { key: 'screening', label: 'Screening', note: 'Checking what has to be checked before anybody’s time is spent.' },
  { key: 'interview', label: 'Interview', note: 'Rated against the four pillars the role is scored on.' },
  { key: 'offer', label: 'Offer', note: 'Agreed, and waiting on a start date.' },
  { key: 'placed', label: 'Placed', note: 'In the role. The chart is updated and the path is inherited.' },
  { key: 'declined', label: 'Not proceeding', note: 'Closed, with the reason kept.' },
];

export type Ratings = Partial<Record<Pillar, number>>;

/** JSON written by this app, but a bad row must not take the page down. */
export function parseRatings(raw: string | null): Ratings {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: Ratings = {};
    for (const p of PILLARS) {
      const n = (v as Record<string, unknown>)[p];
      if (typeof n === 'number' && n >= 1 && n <= 5) out[p] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The mean of whatever has been rated, out of 5 — or null when nothing has.
 *
 * Unrated pillars are left out rather than counted as zero, for exactly the reason an unmarked KPI
 * is: an absence is not a low score. A candidate rated on one pillar is not a bad candidate.
 */
export function candidateScore(ratings: Ratings): number | null {
  const values = PILLARS.map(p => ratings[p]).filter((v): v is number => typeof v === 'number');
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

/** What the interview is actually asking, pillar by pillar. The same four questions as the card. */
export const INTERVIEW_PROMPTS: Record<Pillar, string> = {
  safety: 'Tell me about a time you stopped work. What happened afterwards?',
  people: 'Who have you brought on, and where are they now?',
  earnings: 'Describe a job that lost money. What did you do about it?',
  compliance: 'What do you check before a crew starts, and how do you evidence it?',
};

export interface HiringCheck {
  key: string;
  label: string;
  note: string;
}

/**
 * What has to be verified before somebody starts.
 *
 * Deliberately generic: the specifics — which licence, which award, which band — belong to the
 * business and its region, and hardcoding one industry's would make SPEC fit exactly one client.
 * What is fixed is that each of these has to have an answer.
 */
export const HIRING_CHECKS: HiringCheck[] = [
  { key: 'right_to_work', label: 'Right to work', note: 'Established before anything else. No exceptions, and no starting while it is pending.' },
  { key: 'licence', label: 'Licence or ticket', note: 'Whatever the role legally requires, verified with the issuer rather than sighted. No licence, no Clear to Work.' },
  { key: 'band', label: 'Pay band', note: 'What this role pays in this region, agreed before an offer rather than negotiated after it.' },
  { key: 'award', label: 'Award or agreement', note: 'What is set by instrument rather than by you — overtime, allowances, travel.' },
  { key: 'references', label: 'References', note: 'Against the four pillars, so they answer the same questions the scorecard will.' },
];
