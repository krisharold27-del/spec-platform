/**
 * What a person sees when they start their work day — derived, never invented.
 *
 * Today is the one page everybody in the business opens first, so every line on it has to come from
 * something the business actually recorded: the marks on their scorecard, the roles reporting to
 * them, the systems that are connected. Nothing here reads a database; these are pure functions over
 * rows the page has already fetched through lib/scope, so the whole page is testable and the
 * authorisation stays in one place.
 *
 * Two rules from the rule book shape most of this:
 *  - **Pending is never red.** Not-measured-yet is a gap in the business, not a failure by a person,
 *    so an unmarked KPI produces a neutral light and never appears as a miss.
 *  - **Solutions, not commentary.** Every item this produces names where the work is done, so the
 *    page hands over a starting point rather than a diagnosis.
 */
import type { Pillar, RoleScore, Score } from './scoring';
import { PILLARS } from './scoring';
import type { ScorecardRow } from './queries';
import { STATUSES, type Status } from './status';

/** The four lights, and the neutral a pillar shows before anything has been measured. */
export type Light = 'green' | 'amber' | 'red' | 'pending';

/**
 * The 90% rule, read as a traffic light.
 *
 * Deliberately not `lib/scoring.band()`, which answers a different question — band asks how much of
 * a card was met (on track only at 100%), this asks whether a pillar is at the standard the business
 * is held to. Green is the 90% every pillar of the roll-up has to hold. Amber is close enough to
 * recover inside the month. Null has no light at all: it is an absence, not a red.
 */
export function light(score: Score, threshold = 0.9, watch = 0.75): Light {
  if (score === null) return 'pending';
  if (score >= threshold) return 'green';
  if (score >= watch) return 'amber';
  return 'red';
}

export const LIGHT_COLOUR: Record<Light, string> = {
  green: '#4f7a3f',
  amber: '#c67139',
  red: '#a63b26',
  // The design system's grey for not-applicable, not-tracked and excluded. Warm, and never red.
  pending: '#8c8681',
};

/**
 * The same four lights, dark enough to read as words — see the note on SCORE_INK in lib/pillars.
 * A light you LOOK at takes LIGHT_COLOUR; a light you READ takes this one.
 */
export const LIGHT_INK: Record<Light, string> = {
  green: '#56633f',
  amber: '#8c491a',
  red: '#8c3220',
  pending: '#645c50',
};

/**
 * A status pill: the light as a wash behind, and as words in front.
 *
 * This exact pair — a 14% tint of the colour, with the colour itself as the text — was written out
 * by hand in seven places, and every one of them was unreadable at amber and at pending. One
 * function so there is one place to be right, and so the next pill is right without anyone
 * remembering the rule.
 */
export function pillTone(l: Light | 'grey'): { background: string; color: string } {
  // Half the product calls the fourth band 'pending' and half calls it 'grey'. They are the same
  // band; accepting both here is cheaper and safer than a rename that touches every screen.
  const band = l === 'grey' ? 'pending' : l;
  return {
    background: `color-mix(in srgb, ${LIGHT_COLOUR[band]} 14%, transparent)`,
    color: LIGHT_INK[band],
  };
}

export const LIGHT_LABEL: Record<Light, string> = {
  green: 'At the standard',
  amber: 'Close',
  red: 'Behind',
  pending: 'Not measured yet',
};

/**
 * The sentence under a pillar's number. Says what the score is made of rather than what it means —
 * a leader can read a percentage; what they cannot see is how many of their KPIs it rests on.
 */
export function pillarNote(rows: ScorecardRow[], pillar: Pillar): string {
  const mine = rows.filter(r => r.pillar === pillar);
  if (!mine.length) return 'No KPIs set for this pillar yet.';
  const decided = mine.filter(r => r.answer === 'Y' || r.answer === 'N');
  const met = mine.filter(r => r.answer === 'Y');
  const unmarked = mine.length - decided.length;
  if (!decided.length) return `${mine.length} ${plural(mine.length, 'KPI')}, none marked yet. Nothing is counted against you.`;
  const base = `${met.length} of ${decided.length} ${plural(decided.length, 'KPI')} met`;
  return unmarked ? `${base}. ${unmarked} still to mark — excluded from the score.` : `${base}.`;
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/**
 * Something on this page that needs a person today, and the page it is actually done on.
 *
 * `pillar` is the light it moves, which is the part that makes the list worth working through:
 * every item says what improves if it is dealt with.
 */
export interface TodoItem {
  id: string;
  label: string;
  /** Why it matters, in the form "<pillar> · <consequence>". */
  meta: string;
  pillar: Pillar | null;
  /** Where the work is done. Never a dead end. */
  href: string;
}

export interface TodoInputs {
  myRoleId: string | null;
  myRows: ScorecardRow[];
  /** Direct reports and how their month is going. */
  reports: { roleId: string; title: string; holder: string | null; rows: ScorecardRow[]; score: RoleScore }[];
  /** Has this week's senior meeting been logged? */
  meetingLogged: boolean;
  /** Connections the business expected to be feeding numbers and that currently are not. */
  brokenConnections: { id: string; category: string }[];
  /** Modules on the path of the role this person holds whose due date has passed. */
  overdueTraining: { moduleId: string; title: string; minutes: number }[];
  /** Whether this person may mark and manage within their scope. A readonly seat gets a shorter list. */
  canManage: boolean;
}

/**
 * What needs me today.
 *
 * Ordered by what it costs to leave alone: a hard gate first, then a miss with no explanation
 * against it, then numbers nobody has marked, then the team, then the meeting. Nothing here is
 * invented — every item traces to a row somebody in the business created.
 */
export function whatNeedsMe(input: TodoInputs): TodoItem[] {
  const items: TodoItem[] = [];
  const scorecard = input.myRoleId ? `/scorecard/${input.myRoleId}` : '/me';

  // Compliance is a hard gate: a miss there stops the business being clear to work, whatever else
  // the month looks like. It leads the list for that reason alone.
  for (const r of input.myRows.filter(r => r.pillar === 'compliance' && r.answer === 'N')) {
    items.push({
      id: `gate:${r.criterionId}`,
      label: `Close out ${lower(r.text)}`,
      meta: 'Compliance · a hard gate, so it is reported whatever the scores say',
      pillar: 'compliance',
      href: scorecard,
    });
  }

  // A miss with nothing written against it is the one thing the board pack cannot explain.
  for (const r of input.myRows.filter(r => r.answer === 'N' && r.pillar !== 'compliance' && !r.note)) {
    items.push({
      id: `unexplained:${r.criterionId}`,
      label: `Say what happened on ${lower(r.text)}`,
      meta: `${name(r.pillar)} · a miss with no note reaches the board pack unexplained`,
      pillar: r.pillar,
      href: scorecard,
    });
  }

  if (input.canManage) {
    // Unmarked KPIs never drag a score down, but they do leave the month unfinished.
    const unmarked = input.myRows.filter(r => r.kpi && isUnmarked(r.status, r.answer));
    for (const p of PILLARS) {
      const n = unmarked.filter(r => r.pillar === p).length;
      if (!n) continue;
      items.push({
        id: `unmarked:${p}`,
        label: `Mark ${n} ${plural(n, 'number')} against ${name(p)}`,
        meta: `${name(p)} · until they are marked this pillar has no score`,
        pillar: p,
        href: scorecard,
      });
    }

    // A role reporting to you with nothing marked is a person whose month nobody has looked at.
    for (const rep of input.reports.filter(r => r.score.overall === null)) {
      items.push({
        id: `unscored:${rep.roleId}`,
        label: rep.holder
          ? `Go through the month with ${rep.holder}`
          : `${rep.title} has nobody in it — its month cannot be scored`,
        meta: `People · ${rep.title} has no score yet`,
        pillar: 'people',
        href: `/scorecard/${rep.roleId}`,
      });
    }
  }

  // Overdue training reaches the board pack whatever the scores say, so it belongs on the list
  // rather than only in the training block further down the page.
  for (const m of input.overdueTraining) {
    items.push({
      id: `training:${m.moduleId}`,
      // A module title is the name of a thing, so it keeps its own capitals — unlike a KPI, whose
      // wording is a descriptive phrase that has to read inside a sentence.
      label: `Finish ${m.title}`,
      meta: `Compliance · overdue, and about ${m.minutes} minutes`,
      pillar: 'compliance',
      href: '/today',
    });
  }

  for (const c of input.brokenConnections) {
    items.push({
      id: `connection:${c.id}`,
      label: `Reconnect the ${lower(c.category)} system`,
      meta: 'Every pillar · its KPIs fall back to being marked by hand until it is back',
      pillar: null,
      href: '/setup/systems',
    });
  }

  if (!input.meetingLogged) {
    items.push({
      id: 'meeting',
      label: "Log this week's meeting",
      meta: 'Every pillar · logging it is what keeps the month scoreable',
      pillar: null,
      href: '/today',
    });
  }

  return items;
}

const isUnmarked = (status: string | null, answer: string) =>
  (!status && !answer) || status === 'pending';

const name = (p: Pillar) => p.charAt(0).toUpperCase() + p.slice(1);
/** Lower-cases a KPI's own wording so it reads inside a sentence, without touching initialisms. */
const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/**
 * Something that changed under this person without them doing it — the things a start-of-day page
 * exists to stop being a surprise. Read from what the business recorded, so there is nothing here
 * until something genuinely moved.
 */
export interface ChangeItem {
  id: string;
  kind: 'KPI change' | 'Structure' | 'Compliance' | 'Systems';
  title: string;
  body: string;
  href: string;
}

export interface ChangeInputs {
  myRoleId: string | null;
  /** Criteria on this person's card where a target was proposed and a different one agreed. */
  renegotiated: { criterionId: string; text: string; proposedTarget: string | null; target: string | null }[];
  /** Roles reporting to this person that nobody holds. */
  vacantReports: { roleId: string; title: string }[];
  /** Compliance rows currently missed — the clear-to-work gate. */
  complianceMisses: ScorecardRow[];
  pendingConnections: { id: string; category: string; status: string }[];
}

export function changesToKnowAbout(input: ChangeInputs): ChangeItem[] {
  const items: ChangeItem[] = [];
  const scorecard = input.myRoleId ? `/scorecard/${input.myRoleId}` : '/me';

  for (const c of input.renegotiated) {
    items.push({
      id: `target:${c.criterionId}`,
      kind: 'KPI change',
      title: `${c.text} is now measured against ${c.target}`,
      body: `${c.proposedTarget} was proposed and ${c.target} was agreed. The negotiation is kept rather than hidden, so the month is read against what was actually settled.`,
      href: scorecard,
    });
  }

  for (const v of input.vacantReports) {
    items.push({
      id: `vacant:${v.roleId}`,
      kind: 'Structure',
      title: `${v.title} reports to you and nobody holds it`,
      body: 'A role with nobody in it keeps its KPIs and waits for whoever comes next. It has no score, so it is left out of your team average rather than counted as a zero.',
      href: '/org',
    });
  }

  if (input.complianceMisses.length) {
    const n = input.complianceMisses.length;
    items.push({
      id: 'gate:clear-to-work',
      kind: 'Compliance',
      title: `${n} ${plural(n, 'thing')} on your card ${n === 1 ? 'is' : 'are'} keeping you from clear to work`,
      body: `${input.complianceMisses.map(r => r.text).join('; ')}. Clear to Work is a hard gate — it is pass or fail and is reported separately from every score.`,
      href: scorecard,
    });
  }

  for (const c of input.pendingConnections) {
    items.push({
      id: `system:${c.id}`,
      kind: 'Systems',
      title: `The ${lower(c.category)} system is not feeding numbers yet`,
      body: 'Until it is connected its KPIs are marked by hand, which is a complete and permanent way to run them — not a downgrade.',
      href: '/setup/systems',
    });
  }

  return items;
}

/**
 * The Ask panel.
 *
 * Answers are computed from this person's own card, not generated: no model is called, no key
 * leaves the server, and nothing is written. That is the rule — read to inform, never write to
 * change — and it is also the honest shape of the feature, because every question below has an
 * exact answer sitting in the data already.
 */
export interface AskInputs {
  rows: ScorecardRow[];
  score: RoleScore;
  reports: { title: string; holder: string | null; score: RoleScore }[];
  meetingLogged: boolean;
}

export interface Answer {
  source: string;
  text: string;
}

export const ASK_PROMPTS = [
  'Which of my lights is furthest from 90%?',
  'What do I take to the weekly meeting?',
  'Who is not clear to work?',
] as const;

export function answerFor(question: string, input: AskInputs): Answer {
  switch (question) {
    case ASK_PROMPTS[0]: {
      const scored = PILLARS.filter(p => input.score.pillars[p] !== null);
      if (!scored.length) {
        return {
          source: 'Your card',
          text: 'None of them yet — nothing on your card has been marked this month, so no pillar has a score. That is a blank month, not a bad one.',
        };
      }
      const worst = scored.reduce((a, b) => (input.score.pillars[a]! <= input.score.pillars[b]! ? a : b));
      const v = input.score.pillars[worst]!;
      const gap = Math.round((0.9 - v) * 100);
      return {
        source: `${name(worst)}, this month`,
        text: gap <= 0
          ? `None. ${name(worst)} is your lowest at ${Math.round(v * 100)}% and it is already at or above 90%.`
          : `${name(worst)}, at ${Math.round(v * 100)}% — ${gap} points under the 90% standard. ${pillarNote(input.rows, worst)}`,
      };
    }

    case ASK_PROMPTS[1]: {
      const behind = PILLARS
        .filter(p => { const v = input.score.pillars[p]; return v !== null && v < 0.9; })
        .map(p => `${name(p)} at ${Math.round(input.score.pillars[p]! * 100)}%`);
      const unexplained = input.rows.filter(r => r.answer === 'N' && !r.note).length;
      const parts = [
        behind.length ? `The pillars under 90%: ${behind.join(', ')}.` : 'All four of your pillars are at or above 90%.',
        unexplained ? `${unexplained} ${plural(unexplained, 'miss')} with nothing written against ${unexplained === 1 ? 'it' : 'them'}.` : '',
        input.meetingLogged ? 'This week is already logged.' : 'This week is not logged yet.',
      ].filter(Boolean);
      return { source: 'Weekly meeting', text: parts.join(' ') };
    }

    case ASK_PROMPTS[2]: {
      const misses = input.rows.filter(r => r.pillar === 'compliance' && r.answer === 'N');
      if (!misses.length) {
        return {
          source: 'Clear to Work',
          text: 'Nothing on your own card is failing Compliance. Clear to Work is measured across the whole business, so the gate itself is reported on the executive summary.',
        };
      }
      return {
        source: 'Clear to Work',
        text: `${misses.length} ${plural(misses.length, 'thing')} on your card: ${misses.map(r => r.text).join('; ')}. The gate is pass or fail — there is no partial credit.`,
      };
    }

    default:
      return {
        source: 'Your card',
        text: 'SPEC answers from your own scorecard, the roles reporting to you and the systems that are connected. Pick one of the questions above — those are the ones it can answer exactly, from your own numbers, without sending anything anywhere.',
      };
  }
}

/**
 * Clear to Work, as the person holding the card sees it: their own Compliance KPIs and where each
 * one stands. There is no separate training module model in SPEC — training compliance IS the
 * Compliance pillar, and the Clear to Work gate reads it.
 */
export interface TrainingLine {
  criterionId: string;
  name: string;
  status: string;
  note: string;
  light: Light;
}

export function clearToWork(rows: ScorecardRow[]): TrainingLine[] {
  return rows
    .filter(r => r.pillar === 'compliance')
    .map(r => {
      const meta = r.status ? STATUSES[r.status as Status] : undefined;
      return {
        criterionId: r.criterionId,
        name: r.text,
        status: meta?.label ?? 'Pending',
        // The status's own words, or the target it is measured against — never a guess.
        note: r.note ?? meta?.help ?? (r.target ? `Measured against ${r.target}.` : 'Not marked this month.'),
        light: r.answer === 'Y' ? 'green' : r.answer === 'N' ? 'red' : 'pending',
      };
    });
}
