/**
 * The virtual GM's home: one question about the meter, four about the business, and the levers.
 *
 * ── The one question ─────────────────────────────────────────────────────────────────────────────
 *
 * *"Has the power meter got better?"* — week on week, not against a target and not against the
 * industry. A score out of a hundred tells an owner where they are, which they mostly already know.
 * The change tells them whether what they did last week worked, which is the only thing a week's
 * effort can actually answer, and it is the question a real GM would be asked on a Monday.
 *
 * A consequence worth stating: this module will say "no better and no worse" out loud. A dashboard
 * that only reports movement teaches people that a flat week is a failure of measurement rather than
 * a flat week.
 *
 * ── The GM's four questions ──────────────────────────────────────────────────────────────────────
 *
 * Safety, people, earnings, and whether we do what we say. Between them they are the whole of what a
 * general manager is for, and each is answered with the READ behind it rather than a number — an
 * owner does not need to be told their TRIFR, they need to be told whether anybody got hurt and what
 * is being done about it.
 *
 * ── Levers ───────────────────────────────────────────────────────────────────────────────────────
 *
 * Each carries what it is worth on the meter, because "improve your margins" is advice and "collect
 * Bean There's invoice, worth 4 points" is a job. The power is the honest part: SPEC will not list a
 * lever it cannot price, because an unpriced list is a to-do list, and an owner already has one.
 */
import type { PowerReading } from './power-meter';

/* ─────────────────────────────────────────────────────────────────────────────
 * Has it got better?
 * ───────────────────────────────────────────────────────────────────────────── */

export type Movement = 'better' | 'worse' | 'level' | 'unknown';

export interface WeekOnWeek {
  now: number | null;
  was: number | null;
  /** Points of change. Null when either end is missing. */
  change: number | null;
  movement: Movement;
  says: string;
}

export function weekOnWeek(now: number | null, was: number | null): WeekOnWeek {
  if (now === null) {
    return { now, was, change: null, movement: 'unknown', says: 'Not enough measured yet to give you a score.' };
  }
  if (was === null) {
    return {
      now, was, change: null, movement: 'unknown',
      says: `${now} out of 100 this week. There is nothing to compare it to yet — next Monday there will be.`,
    };
  }
  const change = now - was;
  if (change === 0) {
    return {
      now, was, change, movement: 'level',
      says: `${now} out of 100, the same as last week. Level is an answer: nothing you did last week moved it, and nothing went backwards either.`,
    };
  }
  if (change > 0) {
    return {
      now, was, change, movement: 'better',
      says: `Better. ${was} to ${now}, up ${change} ${change === 1 ? 'point' : 'points'} on last week.`,
    };
  }
  return {
    now, was, change, movement: 'worse',
    says: `Worse. ${was} to ${now}, down ${Math.abs(change)} ${Math.abs(change) === 1 ? 'point' : 'points'} on last week.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The four questions
 * ───────────────────────────────────────────────────────────────────────────── */

export type QuestionKey = 'safety' | 'people' | 'earnings' | 'promises';

export interface GmQuestion {
  key: QuestionKey;
  question: string;
  /** What a bad answer costs, so the question is not mistaken for a formality. */
  why: string;
}

export const GM_QUESTIONS: GmQuestion[] = [
  { key: 'safety',   question: 'Any safety issues?',        why: 'Everything else on this page is worth nothing on the day somebody does not go home.' },
  { key: 'people',   question: 'Any people issues?',        why: 'A business loses its best person three weeks before anybody official notices.' },
  { key: 'earnings', question: 'Any earnings issues?',      why: 'Busy and profitable are different, and only one of them pays wages.' },
  { key: 'promises', question: 'Do we do what we say?',     why: 'Every repeat customer and every referral rests on this one and nothing else.' },
];

export type Answer = 'clear' | 'watch' | 'problem' | 'unknown';

export interface AnsweredQuestion {
  q: GmQuestion;
  answer: Answer;
  /** The read behind it — what SPEC actually saw. Never a number on its own. */
  read: string;
  /** Where to go and do something about it. Null when there is nothing to do. */
  to: string | null;
}

/**
 * How loud the page should be, taken from the worst of the four.
 *
 * Worst rather than average, because a business with three clear answers and one person in hospital
 * has not had a 75% week.
 */
export function worstAnswer(list: readonly AnsweredQuestion[]): Answer {
  if (list.some(a => a.answer === 'problem')) return 'problem';
  if (list.some(a => a.answer === 'watch')) return 'watch';
  if (list.some(a => a.answer === 'unknown')) return 'unknown';
  return 'clear';
}

export function gmLine(list: readonly AnsweredQuestion[]): string {
  const worst = worstAnswer(list);
  const problems = list.filter(a => a.answer === 'problem');
  if (worst === 'clear') return 'Safety, people, earnings and promises all clear this week.';
  if (worst === 'unknown') {
    const missing = list.filter(a => a.answer === 'unknown').map(a => a.q.question.replace(/\?$/, '').toLowerCase());
    return `SPEC cannot answer ${missing.join(' or ')} yet — those areas are not running here.`;
  }
  if (problems.length > 0) {
    return `${problems.length} of the four ${problems.length === 1 ? 'needs' : 'need'} you: ${problems.map(p => p.q.question.replace(/^Any |\?$/g, '').replace(/ issues$/, '')).join(', ')}.`;
  }
  return 'Nothing broken, one to keep an eye on.';
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The levers
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Lever {
  key: string;
  /** What to do, as a thing a person does this week. Not "improve X". */
  what: string;
  /** Why it is worth doing, in the business's own facts. */
  because: string;
  /** Points it would add to the Power Meter. */
  worth: number;
  to: string;
}

/**
 * The levers worth pulling this week, biggest first.
 *
 * Capped at three. A list of eleven levers is a list nobody pulls — the whole value of ranking them
 * is lost the moment the page stops being a decision and starts being an inventory.
 */
export const PULL_AT_MOST = 3;

export function leversToPull(all: readonly Lever[]): Lever[] {
  return [...all]
    .filter(l => l.worth > 0)
    .sort((a, b) => b.worth - a.worth)
    .slice(0, PULL_AT_MOST);
}

export function leversLine(pulled: readonly Lever[], reading: PowerReading | null): string {
  if (pulled.length === 0) {
    return 'Nothing SPEC can price as a lever this week. That usually means the obvious ones are already pulled.';
  }
  const worth = pulled.reduce((a, l) => a + l.worth, 0);
  const to = reading?.score !== null && reading?.score !== undefined ? ` — ${reading.score} to ${reading.score + worth}` : '';
  return `${pulled.length} ${pulled.length === 1 ? 'lever' : 'levers'} worth ${worth} ${worth === 1 ? 'point' : 'points'} between them${to}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * I'm away
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * The switch that lets an owner have a holiday.
 *
 * Every alert and every lever goes to the deputy. One thing still reaches the owner and it is not
 * negotiable: somebody hurt. Not a big invoice, not a lost tender, not a resignation — those all
 * wait, and an owner who has been told they all wait is an owner who actually stops checking.
 *
 * The exception is injury alone because the moment it is "injury and anything urgent", everything
 * becomes urgent and the switch is decoration.
 */
export const ONLY_INJURY_REACHES_YOU =
  'While you are away, one thing still reaches you and it is somebody getting hurt. Everything else — money, jobs, people, the lot — goes to your deputy and waits for you.';

export interface AwaySetting {
  away: boolean;
  from: string | null;
  until: string | null;
  deputyKey: string | null;
  deputyName: string | null;
}

export type AwayState = 'here' | 'away' | 'away_no_deputy';

export interface AwayWatch {
  state: AwayState;
  says: string;
}

export function awayWatch(s: AwaySetting): AwayWatch {
  if (!s.away) {
    return { state: 'here', says: 'Turn this on for a holiday or a sick week and everything goes to your deputy.' };
  }
  if (!s.deputyName?.trim()) {
    /*
      Away with nobody named is the worst of the three states and it is the easy one to get wrong:
      the alerts have to go somewhere, and silently leaving them with the owner would mean the switch
      lied. So it stays on, it says it is not working, and it keeps delivering to the owner until
      somebody is named.
    */
    return {
      state: 'away_no_deputy',
      says: 'You are marked away and nobody is named as deputy, so everything is still coming to you. Name somebody and it stops.',
    };
  }
  const until = s.until ? ` until ${s.until.slice(0, 10)}` : '';
  return { state: 'away', says: `Away${until}. ${s.deputyName} has everything except an injury, which still reaches you.` };
}

/** Does this alert still go to an owner who is away? One kind does. */
export const reachesAwayOwner = (kind: string): boolean => kind === 'injury';

/* ─────────────────────────────────────────────────────────────────────────────
 * What siteVIP saved you
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Saving {
  what: string;
  hours: number;
  /** Dollars, in cents. Null where SPEC can count the hours but not price them. */
  cents: number | null;
}

export interface Saved {
  hours: number;
  cents: number | null;
  items: Saving[];
  says: string;
}

/**
 * The monthly "siteVIP saved you", in hours AND dollars.
 *
 * The dollars are the part to be careful with. Hours are countable — a quote SPEC priced is a quote
 * nobody sat and priced. Dollars are a claim, and the honest ones are only two kinds: hours at a
 * rate the business actually pays, and margin kept because the job was quoted at the right hours.
 * Anything else is marketing, so a saving with no `cents` contributes hours and no money rather than
 * being given a plausible figure.
 */
export function totalSaved(items: readonly Saving[]): Saved {
  const hours = items.reduce((a, i) => a + i.hours, 0);
  const priced = items.filter(i => i.cents !== null);
  const cents = priced.length > 0 ? priced.reduce((a, i) => a + (i.cents ?? 0), 0) : null;

  if (items.length === 0) {
    return { hours: 0, cents: null, items: [], says: 'Nothing to count yet. This fills in over your first month.' };
  }
  const h = `${Math.round(hours)} ${Math.round(hours) === 1 ? 'hour' : 'hours'}`;
  if (cents === null) {
    return { hours, cents, items: [...items], says: `${h} this month. SPEC will not put a dollar figure on it until it knows what an hour costs you.` };
  }
  const unpriced = items.length - priced.length;
  const money = `$${Math.round(cents / 100).toLocaleString('en-AU')}`;
  const tail = unpriced > 0 ? ` ${unpriced} more ${unpriced === 1 ? 'thing is' : 'things are'} counted in hours but not priced.` : '';
  return { hours, cents, items: [...items], says: `${h} and ${money} this month.${tail}` };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * More than one business
 * ───────────────────────────────────────────────────────────────────────────── */

export interface BusinessCard {
  id: string;
  name: string;
  score: number | null;
  change: number | null;
}

/** One login, a switcher, and the meters side by side. Sorted worst first — that is where you go. */
export function sideBySide(list: readonly BusinessCard[]): BusinessCard[] {
  return [...list].sort((a, b) => {
    if (a.score === null && b.score === null) return a.name.localeCompare(b.name);
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return a.score - b.score;
  });
}

export function groupLine(list: readonly BusinessCard[]): string {
  if (list.length < 2) return '';
  const scored = list.filter(b => b.score !== null);
  if (scored.length === 0) return `${list.length} businesses, none scored yet.`;
  const worst = sideBySide(scored)[0];
  return `${list.length} businesses. ${worst.name} is the one that needs you, at ${worst.score}.`;
}
