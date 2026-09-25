/**
 * Somebody leaves, and everything that has to stop stopping.
 *
 * ── Why this is a list rather than a form ────────────────────────────────────────────────────────
 *
 * From the workflow map: every piece of offboarding already exists somewhere in SPEC — tools are on
 * the tools register, the seat is on billing, access is on the chart — and nothing joins them. So
 * each one is done by whoever remembers, which on a last day is nobody, because a last day is a
 * cake and a handover and somebody's replacement starting on Monday.
 *
 * ── The two that actually bite ───────────────────────────────────────────────────────────────────
 *
 * **A login that still works months later.** Not because anybody is malicious — because nothing
 * ever told the business it was still open. Somebody who left in March can read the board in
 * August, and the only way anyone finds out is by accident.
 *
 * **A seat still being paid for.** Quiet, monthly, and invisible: the invoice does not itemise
 * regret. A business of forty discovers it two years later while doing something else.
 *
 * Those two are marked `bites` and are what `stillOpen` reports on, because a list where every item
 * is equally urgent is a list where the urgent ones are hidden among the polite ones.
 *
 * ── What it deliberately does not do ─────────────────────────────────────────────────────────────
 *
 * It does not close anything by itself. Final pay, tools and access are decisions with consequences
 * — somebody on gardening leave still has a login on purpose, and a tool written off is a
 * conversation, not a tick. SPEC's job is to make sure nobody has to REMEMBER, not to decide.
 */

export interface LastDayItem {
  key: string;
  what: string;
  /** Why it matters, in the words somebody would use to explain it to the person leaving. */
  why: string;
  /** The two that cost money or create risk when they are missed. */
  bites: boolean;
  /** Where it is actually done. Never a form of its own — the register that already holds it. */
  where: string;
}

export const LAST_DAY: LastDayItem[] = [
  {
    key: 'access', what: 'Close their login', bites: true,
    why: 'Nothing else in SPEC ever tells you this is still open. Somebody who left in March can read the board in August, and the only way anybody finds out is by accident.',
    where: '/people',
  },
  {
    key: 'seat', what: 'Stop paying for their seat', bites: true,
    why: 'Quiet, monthly, and invisible — the invoice does not itemise regret. A business finds this two years later while doing something else.',
    where: '/billing',
  },
  {
    key: 'tools', what: 'Get the tools and keys back', bites: false,
    why: 'What they hold is already on the tools register. The list is only useful on the day it can still be asked for.',
    where: '/jobs?tab=tools',
  },
  {
    key: 'pay', what: 'Final pay, leave and entitlements', bites: false,
    why: 'Checked against the award the same way every other run is — before it goes, not after.',
    where: '/people?mode=pay',
  },
  {
    key: 'chart', what: 'Take them off the chart, or mark the seat vacant', bites: false,
    why: 'A seat with a name in it that nobody is in is a vacancy nobody is filling. Empty is a fact; stale is a lie.',
    where: '/org',
  },
  {
    key: 'handover', what: 'What only they knew', bites: false,
    why: 'The customers they had a relationship with, the site with the awkward switchboard, the thing that is written down nowhere. This is the one that is lost for good if the day passes.',
    where: '/people?mode=conduct',
  },
];

export const BITES = LAST_DAY.filter(i => i.bites).map(i => i.key);

export interface Leaver {
  staffId: string;
  name: string;
  lastDay: string;
  /** Which of the list has been done. Keys from LAST_DAY. */
  done: readonly string[];
}

export interface LeaverWatch {
  leaver: Leaver;
  left: LastDayItem[];
  /** Of what is left, the ones that cost money or create risk. */
  biting: LastDayItem[];
  daysSince: number;
  says: string;
}

export function leaverWatch(leaver: Leaver, at: Date = new Date()): LeaverWatch {
  const done = new Set(leaver.done);
  const left = LAST_DAY.filter(i => !done.has(i.key));
  const biting = left.filter(i => i.bites);
  const daysSince = Math.floor((at.getTime() - Date.parse(leaver.lastDay)) / 86_400_000);

  if (left.length === 0) {
    return { leaver, left, biting, daysSince, says: 'All done.' };
  }
  if (biting.length > 0 && daysSince > 0) {
    return {
      leaver, left, biting, daysSince,
      says: `${daysSince} ${daysSince === 1 ? 'day' : 'days'} since ${leaver.name} left and ${biting.map(i => i.what.toLowerCase()).join(' and ')} — ${biting.length === 1 ? 'that one costs' : 'those cost'} money or create risk every day ${biting.length === 1 ? 'it' : 'they'} stay${biting.length === 1 ? 's' : ''} open.`,
    };
  }
  return {
    leaver, left, biting, daysSince,
    says: `${left.length} of ${LAST_DAY.length} still to do for ${leaver.name}.`,
  };
}

/** Everybody who has left with something still open, worst first. */
export function stillOpen(leavers: readonly Leaver[], at: Date = new Date()): LeaverWatch[] {
  return leavers
    .map(l => leaverWatch(l, at))
    .filter(w => w.left.length > 0)
    /* Ranked by what is biting, then by how long — an old tidy exit outranks nothing. */
    .sort((a, b) => (b.biting.length - a.biting.length) || (b.daysSince - a.daysSince));
}

export function lastDayLine(watches: readonly LeaverWatch[]): string {
  if (watches.length === 0) return 'Nobody has left with anything still open.';
  const biting = watches.filter(w => w.biting.length > 0);
  if (biting.length === 0) {
    return `${watches.length} ${watches.length === 1 ? 'person has' : 'people have'} left with something still to tidy up.`;
  }
  return `${biting.length} ${biting.length === 1 ? 'person who has' : 'people who have'} left still ${biting.length === 1 ? 'has' : 'have'} a login open or a seat being paid for.`;
}
