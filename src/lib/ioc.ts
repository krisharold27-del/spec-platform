/**
 * The Intelligent Org Chart — LINK, and the three questions it has to answer.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"you must understand the IOC - intelligent org chart - is the foundation for the system being
 * great - the first stage of the plan is LINK - we need the org chart to do this - who does what
 * and are they capable and is the business achieving success"*, then: *"LINK - FLOW - GROW is the
 * spec way"*.
 *
 * ── Why this is not another feature ──────────────────────────────────────────────────────────────
 *
 * Everything else SPEC does is Flow or Grow. The workflows, the streams, the Power Meter, the
 * automation review — none of them mean anything until the business is LINKED, and the chart is the
 * only thing that does the linking. A business that has not answered these three has no foundation
 * for the rest to stand on, which is why the chart is the first stage rather than the first screen.
 *
 * ── The three, and why they are three ────────────────────────────────────────────────────────────
 *
 *   **Who does what.** Every seat drawn, every seat held, everything the business does sitting
 *   under somebody. A gap here is work nobody owns, and work nobody owns is work that gets done by
 *   whoever is least busy — which is never the person who should be doing it.
 *
 *   **Are they capable.** The seat exists and somebody holds it; can they actually do it? Licence
 *   current, inducted, trained for the role they are in. This was the question SPEC already had the
 *   answer to and had never put on the chart: it lived on Training, on Compliance and on Clear to
 *   Work, so a leader looking at their business had to visit three screens to learn whether the
 *   person in a seat could hold it.
 *
 *   **Is the business achieving success.** The seat is held by somebody capable — is it WORKING?
 *   That is what the KPIs on the seat say, and it is the one of the three that cannot be faked by
 *   tidying the chart.
 *
 * They are in that order because each one is meaningless without the one before it. A capable
 * person in a seat nobody defined is luck. A seat scoring well that nobody holds is a number about
 * the past.
 *
 * ── Linked is not the same as green ──────────────────────────────────────────────────────────────
 *
 * A business can be fully LINKED and scoring badly — that is the point of it. Linked means the
 * business can SEE itself: every seat owned, every holder assessed, every seat measured. What the
 * numbers then say is Flow's problem.
 *
 * So nothing here grades a business on its performance. It reports whether the three questions have
 * answers, and says which seats are missing one.
 */
import type { ClearState } from './people';

/** The three stages, in the order they are done. The SPEC way, named once. */
export const STAGES = [
  {
    key: 'link',
    label: 'Link',
    is: 'Every seat drawn, held by somebody capable, and measured. The foundation — nothing else stands without it.',
  },
  {
    key: 'flow',
    label: 'Flow',
    is: 'The work moving through those seats without anybody chasing it.',
  },
  {
    key: 'grow',
    label: 'Grow',
    is: 'The business getting bigger at the thing it is already good at.',
  },
] as const;

export type Stage = (typeof STAGES)[number]['key'];

/** The three questions LINK answers, in the order each depends on the one before. */
export const LINK_ASKS = [
  {
    key: 'who',
    question: 'Who does what?',
    good: 'Every seat on the chart has somebody in it.',
    bad: 'Work nobody owns gets done by whoever is least busy, which is never the right person.',
  },
  {
    key: 'capable',
    question: 'Are they capable?',
    good: 'Everybody holding a seat is licensed, inducted and trained for it.',
    bad: 'A seat held by somebody who cannot lawfully do it is a seat that is not really held.',
  },
  {
    key: 'working',
    question: 'Is the business achieving success?',
    good: 'Every seat that should be measured is measured.',
    bad: 'A business that cannot say whether a seat is working cannot tell effort from results.',
  },
] as const;

export type Ask = (typeof LINK_ASKS)[number]['key'];

/* ─────────────────────────────────────────────────────────────────────────────
 * One seat, against the three
 * ───────────────────────────────────────────────────────────────────────────── */

export interface Seat {
  id: string;
  title: string;
  person: string | null;
  /** Pencilled in: a name on the chart with no account. Held enough to answer "who", not "capable". */
  pencilled: boolean;
  /** Whether this seat carries a scorecard at all. A checklist role is not measured and never should be. */
  scored: boolean;
  hasKpis: boolean;
  /** Can the person in it actually do it — from licences, induction and training. */
  clear: ClearState;
  /** Training modules for this role that are overdue. */
  overdue: readonly string[];
  /** Compliance measures on this role currently missed. */
  blocking: readonly string[];
}

export interface SeatLink {
  seat: Seat;
  /** Which of the three this seat answers. */
  answers: Record<Ask, boolean>;
  /** The first unanswered question, which is the only one worth acting on. */
  next: Ask | null;
  says: string;
}

/**
 * What one seat says about the three.
 *
 * `next` is the FIRST gap, not all of them, because they are dependent: telling somebody their
 * vacant seat is also unmeasured is telling them to do two things when the second cannot be done
 * until the first is. A leader with forty seats needs one next step per seat, not three.
 */
export function seatLink(seat: Seat): SeatLink {
  const who = Boolean(seat.person?.trim());
  /*
    A pencilled name answers "who" and cannot answer "capable": nobody has been assessed, because
    there is no account, no licence on file and no training record. Saying otherwise would let a
    business read a chart of pencilled names as a linked business.
  */
  const capable = who && !seat.pencilled
    && seat.clear === 'clear' && seat.overdue.length === 0 && seat.blocking.length === 0;
  /* An unscored role is not a gap — a checklist role has no percentage and never should. */
  const working = !seat.scored || seat.hasKpis;

  const answers = { who, capable, working };
  const next: Ask | null = !who ? 'who' : !capable ? 'capable' : !working ? 'working' : null;

  return { seat, answers, next, says: sayFor(seat, next) };
}

function sayFor(seat: Seat, next: Ask | null): string {
  if (next === null) return 'Linked.';
  if (next === 'who') return `Nobody in it. ${seat.title} is work the business does and nobody owns.`;
  if (next === 'capable') {
    if (seat.pencilled) return `${seat.person} is pencilled in — a name, not somebody assessed. Invite them and the chart can tell you whether they can hold it.`;
    if (seat.blocking.length > 0) return `${seat.person} cannot be sent to work: ${seat.blocking.join(', ')}.`;
    if (seat.overdue.length > 0) return `${seat.person} is overdue on ${seat.overdue.join(', ')} for this role.`;
    return `Nothing on file says whether ${seat.person} can hold this seat.`;
  }
  return `${seat.title} is scored and has no KPIs, so nothing says whether it is working.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The business, against the three
 * ───────────────────────────────────────────────────────────────────────────── */

export interface LinkReading {
  seats: number;
  /** How many seats answer each question. */
  answered: Record<Ask, number>;
  /** Seats that answer all three. */
  linked: number;
  /** The first question the business as a whole has not finished. */
  next: Ask | null;
  /** The seats that are the reason, worst question first. Capped, because a wall of rows is not a list. */
  worst: SeatLink[];
}

/** How many seats to name. Enough to start on this morning, and not a page anybody scrolls past. */
export const NAME_AT_MOST = 8;

export function readLink(seats: readonly Seat[]): LinkReading {
  const links = seats.map(seatLink);
  const answered: Record<Ask, number> = {
    who: links.filter(l => l.answers.who).length,
    capable: links.filter(l => l.answers.capable).length,
    working: links.filter(l => l.answers.working).length,
  };
  /*
    The business's next question is the first one not every seat answers. In order, because the
    three depend on each other: chasing capability across a chart with empty seats is work that has
    to be redone the moment those seats are filled.
  */
  const order: Ask[] = ['who', 'capable', 'working'];
  const next = order.find(k => answered[k] < seats.length) ?? null;

  return {
    seats: seats.length,
    answered,
    linked: links.filter(l => l.next === null).length,
    next,
    worst: links
      .filter(l => l.next !== null)
      .sort((a, b) => order.indexOf(a.next!) - order.indexOf(b.next!))
      .slice(0, NAME_AT_MOST),
  };
}

/**
 * Whether the business is linked — the gate the rest of the SPEC way stands on.
 *
 * Deliberately all-or-nothing rather than a percentage. "83% linked" is a number a business can be
 * comfortable with for two years; "six seats are not linked" is six things somebody can do.
 */
export const isLinked = (r: LinkReading): boolean => r.seats > 0 && r.linked === r.seats;

export function linkLine(r: LinkReading): string {
  if (r.seats === 0) return 'No chart yet. Draw the seats and the rest of SPEC has something to stand on.';
  if (isLinked(r)) {
    return `Linked. All ${r.seats} seats are held, by people who can hold them, and every one that should be measured is.`;
  }
  const short = r.seats - r.linked;
  const ask = LINK_ASKS.find(a => a.key === r.next)!;
  return `${r.linked} of ${r.seats} seats linked. ${short} to go, and the next question is "${ask.question}" — ${ask.bad}`;
}

/**
 * What the business should do next, said as one thing.
 *
 * One, not a list. A leader looking at a chart of forty seats does not need forty instructions; they
 * need the next move, and the chart will have a different one for them tomorrow.
 */
export function nextMove(r: LinkReading): string | null {
  if (r.next === null) return null;
  const worst = r.worst.filter(w => w.next === r.next);
  if (worst.length === 0) return null;
  const first = worst[0];
  if (worst.length === 1) return first.says;
  return `${first.says} ${worst.length - 1} more like it.`;
}
