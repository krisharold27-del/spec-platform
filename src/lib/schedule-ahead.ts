/**
 * Filling the schedule — today, and as far ahead as the facts will carry.
 *
 * ── Kris, 26 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"an ai scheduling function to support business in getting schedules done now and as far into the
 * future as possible - ideally 1 month in advance"*.
 *
 * ── What is actually hard about this, and it is not the arithmetic ───────────────────────────────
 *
 * Fitting jobs to people is a well-understood problem. What kills a scheduler in a real business is
 * none of that:
 *
 *   It books somebody who cannot lawfully do the work, because it treated a person as a body.
 *   It quietly drops what it could not fit, so the business believes the month is covered.
 *   It presents week four with the same confidence as tomorrow, so nobody believes week one either.
 *   It books, rather than proposes — and a booking is a promise to a customer that somebody made
 *   without being asked.
 *
 * Each of those is a decision this file makes in the opposite direction, and each is more important
 * than the packing.
 *
 * ── It proposes. It never books ──────────────────────────────────────────────────────────────────
 *
 * The same rule Kris already set for work orders: *"never booked automatically — an automatic
 * booking is a commitment the business never made."* A proposed day is a suggestion a scheduler
 * accepts in one tap. A booked day is a customer expecting somebody, and the only thing standing
 * between those two is a person deciding.
 *
 * ── The hole is the most valuable thing here ─────────────────────────────────────────────────────
 *
 * A full week one is nice. "Nobody is on anything in week three" is the output worth having, because
 * it arrives while there is still time to sell something — and it is invisible in every business
 * that schedules a week at a time. So `unfilled` and `quiet` are not error states; they are the
 * point.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * How far, and how much to believe it
 * ───────────────────────────────────────────────────────────────────────────── */

/** A month, which is Kris's number and also `BOOK_AHEAD_DAYS` in lib/recurring. */
export const PLAN_DAYS = 30;

/**
 * How far out a proposal is still a plan rather than a shape.
 *
 * Beyond this the arrangement of people is guesswork — somebody will be sick, a job will run over,
 * a better job will come in. Saying so is what keeps the near days believable: a schedule that
 * presents day 28 as confidently as tomorrow teaches everybody to trust none of it.
 */
export const FIRM_DAYS = 7;
export const LIKELY_DAYS = 14;

export type Firmness = 'firm' | 'likely' | 'shape';

export function firmnessAt(daysOut: number): Firmness {
  if (daysOut <= FIRM_DAYS) return 'firm';
  if (daysOut <= LIKELY_DAYS) return 'likely';
  return 'shape';
}

export const FIRMNESS_SAYS: Record<Firmness, string> = {
  firm: 'Close enough to hold. Tell the customer this one.',
  likely: 'Likely. Worth telling a customer "about then", not a date.',
  shape: 'A shape, not a plan — it says the work fits, not that it happens on that day.',
};

/* ─────────────────────────────────────────────────────────────────────────────
 * What needs doing
 * ───────────────────────────────────────────────────────────────────────────── */

export type NeedKind = 'job' | 'service' | 'callback';

export interface Need {
  id: string;
  kind: NeedKind;
  ref: string;
  what: string;
  client: string;
  /** Whole days of work. Rounded up: half a day still occupies a person. */
  days: number;
  /**
   * The day it cannot start before, and the day it must not finish after. Either may be null.
   *
   * `by` is what makes this a scheduling problem rather than a list. A service due in three weeks
   * and a callback owed this Friday compete for the same Thursday, and only the deadline says which
   * one wins.
   */
  notBefore: string | null;
  by: string | null;
  /** How many people it takes at once. Two on a switchboard is two, not one for twice as long. */
  crew: number;
  /**
   * Tickets, inductions or site access this work requires. Matched against what a person holds.
   *
   * The whole reason a scheduler cannot treat people as interchangeable bodies: a mine site needs
   * an induction, and somebody without one is not "available at a stretch", they are not allowed on.
   */
  needs: readonly string[];
}

/** Sooner deadline first; then the longer job, because long jobs have fewer places to go. */
export function inOrder(needs: readonly Need[]): Need[] {
  return [...needs].sort((a, b) => {
    if (a.by && b.by && a.by !== b.by) return a.by < b.by ? -1 : 1;
    if (a.by && !b.by) return -1;
    if (!a.by && b.by) return 1;
    return b.days - a.days;
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Who can actually do it
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Hand {
  key: string;
  name: string;
  /** What they hold — tickets, inductions, site access. Matched against a need's requirements. */
  holds: readonly string[];
  /**
   * Whether they may be sent to work at all, from Compliance.
   *
   * Not a preference and not a soft score. Somebody not clear to work is not available on any day
   * at any price, and a scheduler that treats this as a tiebreaker will eventually book them.
   */
  clear: boolean;
  /** Days they are already spoken for: booked, on leave, on a course. Whatever the reason. */
  busy: readonly string[];
}

export const holdsWhatIsNeeded = (hand: Hand, need: Need): boolean =>
  need.needs.every(n => hand.holds.includes(n));

export const freeOn = (hand: Hand, day: string): boolean =>
  hand.clear && !hand.busy.includes(day);

/* ─────────────────────────────────────────────────────────────────────────────
 * The plan
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Proposal {
  need: Need;
  /** The consecutive working days it would take. */
  days: string[];
  hands: { key: string; name: string }[];
  firmness: Firmness;
  says: string;
}

export type WhyNot =
  | 'nobody_holds_it'    // nobody has the ticket or the induction
  | 'nobody_free'        // everybody who could is already spoken for
  | 'past_its_date'      // it cannot be finished by when it is needed
  | 'beyond_the_month';  // it fits, but not inside the window

export interface Unfilled {
  need: Need;
  why: WhyNot;
  says: string;
}

export interface Plan {
  from: string;
  days: string[];
  proposals: Proposal[];
  /** What could NOT be placed. Never silently dropped — see the note at the top. */
  unfilled: Unfilled[];
  /** Days with nobody on anything. The output worth having. */
  quiet: string[];
  says: string;
}

const WHY_SAYS: Record<WhyNot, (n: Need) => string> = {
  nobody_holds_it: n =>
    `Nobody has what ${n.ref} needs: ${n.needs.join(', ')}. That is not a scheduling problem — it is a ticket or an induction somebody has to get.`,
  nobody_free: n =>
    `${n.ref} needs ${n.crew === 1 ? 'somebody' : `${n.crew} people`} for ${n.days} ${n.days === 1 ? 'day' : 'days'} and there is no run of days where that many are free. Something has to move, or somebody has to be subbied in.`,
  past_its_date: n =>
    `${n.ref} is wanted by ${n.by} and there is no way to fit it before then. Better to tell them now than on the day.`,
  beyond_the_month: n =>
    `${n.ref} fits, but not inside the next month. It is on the list and it is not forgotten.`,
};

/**
 * Work out a month.
 *
 * Deliberately a plain, readable pass rather than anything clever. Two reasons, and the second is
 * the one that matters:
 *
 *   A business has to be able to argue with the result. "Why is Hemi on Northside on Tuesday" has to
 *   have an answer a person can follow, and nobody argues with a solver they cannot see inside.
 *
 *   Every proposal here is a suggestion somebody accepts or rejects. The gain from an optimal
 *   packing over a sensible one is small; the loss from a packing nobody trusts is the whole
 *   feature.
 */
export function plan(input: {
  from: string;
  workingDays: readonly string[];
  needs: readonly Need[];
  hands: readonly Hand[];
}): Plan {
  const days = input.workingDays.slice(0, PLAN_DAYS);
  const taken = new Map<string, Set<string>>();
  for (const d of days) taken.set(d, new Set<string>());

  const proposals: Proposal[] = [];
  const unfilled: Unfilled[] = [];

  const isFree = (hand: Hand, day: string) =>
    freeOn(hand, day) && !taken.get(day)?.has(hand.key);

  for (const need of inOrder(input.needs)) {
    const able = input.hands.filter(h => h.clear && holdsWhatIsNeeded(h, need));

    if (able.length < need.crew) {
      /*
        Told apart from "nobody free" on purpose. One is a scheduling problem the business can solve
        by moving something; the other is a ticket somebody has to go and get, and a scheduler that
        blurs them sends a manager looking for a spare Thursday that would not have helped.
      */
      unfilled.push({ need, why: 'nobody_holds_it', says: WHY_SAYS.nobody_holds_it(need) });
      continue;
    }

    const placed = findRun(need, days, able, isFree);

    if (!placed) {
      const why: WhyNot = need.by && need.by < (days.at(-1) ?? need.by) ? 'past_its_date' : 'nobody_free';
      unfilled.push({ need, why, says: WHY_SAYS[why](need) });
      continue;
    }

    for (const day of placed.days) {
      for (const h of placed.hands) taken.get(day)?.add(h.key);
    }

    const out = days.indexOf(placed.days[0]);
    const firmness = firmnessAt(out + 1);
    proposals.push({
      need,
      days: placed.days,
      hands: placed.hands.map(h => ({ key: h.key, name: h.name })),
      firmness,
      says: `${need.ref} · ${placed.hands.map(h => h.name).join(' and ')} · ${placed.days[0]}${placed.days.length > 1 ? ` to ${placed.days.at(-1)}` : ''}`,
    });
  }

  const busyDays = new Set(proposals.flatMap(p => p.days));
  const quiet = days.filter(d => !busyDays.has(d) && (taken.get(d)?.size ?? 0) === 0);

  return {
    from: input.from,
    days,
    proposals,
    unfilled,
    quiet,
    says: planLine(proposals, unfilled, quiet, days.length),
  };
}

/**
 * The first run of consecutive working days where enough of the right people are free.
 *
 * Earliest-fit rather than best-fit, and that is a real choice: doing work sooner means invoicing
 * sooner, and a business's cash position cares far more about that than about a tidy calendar.
 */
function findRun(
  need: Need,
  days: readonly string[],
  able: readonly Hand[],
  isFree: (hand: Hand, day: string) => boolean,
): { days: string[]; hands: Hand[] } | null {
  for (let i = 0; i + need.days <= days.length; i += 1) {
    const window = days.slice(i, i + need.days);
    if (need.notBefore && window[0] < need.notBefore) continue;
    if (need.by && window[window.length - 1] > need.by) return null;

    /* The same people across the whole run — swapping crews mid-job is how work gets done twice. */
    const free = able.filter(h => window.every(d => isFree(h, d)));
    if (free.length >= need.crew) {
      return { days: [...window], hands: free.slice(0, need.crew) };
    }
  }
  return null;
}

function planLine(
  proposals: readonly Proposal[],
  unfilled: readonly Unfilled[],
  quiet: readonly string[],
  days: number,
): string {
  if (proposals.length === 0 && unfilled.length === 0) {
    return 'Nothing waiting to be scheduled.';
  }
  const bits: string[] = [];
  if (proposals.length > 0) {
    const firm = proposals.filter(p => p.firmness === 'firm').length;
    bits.push(`${proposals.length} ${proposals.length === 1 ? 'job' : 'jobs'} placed across ${days} days, ${firm} of them inside the week you can promise`);
  }
  if (unfilled.length > 0) {
    bits.push(`${unfilled.length} ${unfilled.length === 1 ? 'could not be placed' : 'could not be placed'}`);
  }
  if (quiet.length > 0) {
    bits.push(`${quiet.length} ${quiet.length === 1 ? 'day has' : 'days have'} nobody on anything`);
  }
  return `${bits.join(' · ')}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The quiet stretch
 * ───────────────────────────────────────────────────────────────────────────── */

/** Enough empty days in a row to be a hole rather than a Tuesday. */
export const A_HOLE_IS = 3;

export interface Hole {
  from: string;
  to: string;
  days: number;
  says: string;
}

/**
 * Runs of days with nothing on them.
 *
 * The single most useful thing a month-ahead schedule produces, and the thing no business sees
 * while it schedules a week at a time: a hole in week three, found in week one, is still a
 * fortnight in which something can be sold. Found in week three it is a fortnight of wages.
 */
export function holes(quiet: readonly string[], allDays: readonly string[]): Hole[] {
  const found: Hole[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length >= A_HOLE_IS) {
      found.push({
        from: run[0],
        to: run[run.length - 1],
        days: run.length,
        says: `${run.length} days with nobody on anything, ${run[0]} to ${run[run.length - 1]}. Found now, that is time to sell something into.`,
      });
    }
    run = [];
  };

  for (const day of allDays) {
    if (quiet.includes(day)) run.push(day);
    else flush();
  }
  flush();
  return found;
}

export function holesLine(found: readonly Hole[]): string {
  if (found.length === 0) return 'No quiet stretches in the next month.';
  const worst = [...found].sort((a, b) => b.days - a.days)[0];
  return found.length === 1
    ? worst.says
    : `${found.length} quiet stretches, the longest ${worst.days} days from ${worst.from}.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What this is, said plainly
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * What is actually doing the work here.
 *
 * Worth being straight about, because "AI scheduling" invites a picture of a model deciding who
 * goes where — and a model that invents a booking is a customer told the wrong day by a business
 * that cannot explain why.
 *
 * The scheduling is arithmetic over the business's own facts: who holds what, who is free, what is
 * owed by when. It is deterministic, it is the same answer twice, and every placement can be
 * explained in a sentence. That is not a lesser thing than a model — for this problem it is the
 * only version anybody can argue with, and a schedule nobody can argue with is a schedule nobody
 * follows.
 */
export const HOW_IT_DECIDES =
  'This is worked out from your own facts — who holds which tickets, who is free, what is owed by when — not guessed. Every day it proposes can be explained in a sentence, and it will give you the same answer twice.';

export const IT_PROPOSES =
  'Nothing here is booked. These are proposals, and a scheduler accepts them one tap at a time — because a booking is a promise to a customer, and SPEC does not make those on your behalf.';

export const WHY_A_MONTH =
  'A week-at-a-time schedule cannot show you the week with nothing in it until it is next week. A month shows you the hole while there is still time to fill it.';
