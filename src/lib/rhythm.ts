/**
 * My week — the rhythm, as it applies to one person.
 *
 * Four or five beats that ARE the operating system: the weekly meeting, the month closing, and
 * whatever the person's own level puts on them. Each one says whether it is being held, because
 * that is the only thing SPEC has an opinion about regarding a meeting.
 *
 * **It must never become a calendar.** SPEC does not own anybody's diary and should never try to.
 * A calendar shows everything and therefore says nothing; this shows the handful of beats a
 * business runs on, and whether they happened.
 *
 * Pure, so the rules about who sees which beat are testable without a database or a clock.
 */
import type { Light } from './today';

export interface Beat {
  id: string;
  title: string;
  /** What it is, and what it is for — one sentence, in the person's own terms. */
  detail: string;
  /** Whether it is being held. Green held, amber due, red missed, pending nothing to say yet. */
  state: Light;
  /** The short right-hand label: "Held this week", "In 4 days". */
  standing: string;
  /** Where it is actually done. Never a dead end. */
  href: string;
}

export interface RhythmInputs {
  /** Has this week's senior meeting been logged? */
  meetingLogged: boolean;
  /** Does this person run or attend the weekly meeting — do they have anybody under them? */
  leadsPeople: boolean;
  /** The month being lived, and the one being closed behind it. */
  openPeriod: string | null;
  /** Days until the month being closed has to be locked. Null when nothing is waiting. */
  daysToClose: number | null;
  /** KPIs on this person's own card nobody has marked yet. */
  unmarked: number;
  /** Is this person allowed to mark and lock, or are they read-only? */
  canManage: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The beats, in the order they come round.
 *
 * Deliberately short. Five is the most this should ever be: the moment it becomes a list somebody
 * scrolls, it has stopped being the rhythm and started being a diary.
 */
export function rhythm(input: RhythmInputs): Beat[] {
  const beats: Beat[] = [];

  // The weekly meeting, for anybody who has people. Logging it is what keeps the month scoreable,
  // which is the whole reason it is on this page rather than in a calendar.
  if (input.leadsPeople) {
    beats.push({
      id: 'weekly',
      title: 'The weekly meeting',
      detail: input.meetingLogged
        ? 'Logged for this week. Logging it is what keeps the month scoreable.'
        : 'Not logged yet. The month cannot be scored honestly without it.',
      state: input.meetingLogged ? 'green' : 'amber',
      standing: input.meetingLogged ? 'Held this week' : 'Due this week',
      href: '/meeting',
    });
  }

  // Your own card. Not a meeting, but it is the thing the month waits on, and it belongs to the
  // same rhythm — a person who never marks their own numbers stops the whole roll-up.
  if (input.unmarked > 0 && input.canManage) {
    beats.push({
      id: 'marking',
      title: 'Your own numbers',
      detail: `${plural(input.unmarked, 'number')} on your card nobody has marked. Unmarked never counts against you — it just leaves the month unfinished.`,
      state: 'amber',
      standing: `${input.unmarked} to mark`,
      href: '/me',
    });
  }

  // The month closing. Monthly in arrears: August is marked and locked during September, because
  // that is when the P&L lands and a leader can honestly say what happened.
  if (input.openPeriod) {
    const days = input.daysToClose;
    beats.push({
      id: 'month',
      title: `Closing ${input.openPeriod}`,
      detail:
        'A month is lived, then closed in the month after it — the financial numbers arrive when the '
        + 'P&L does. Lock what you know; anything still waiting arrives later as an amendment.',
      state: days === null ? 'pending' : days <= 3 ? 'amber' : 'green',
      standing: days === null ? 'Nothing waiting' : days <= 0 ? 'Overdue' : `In ${plural(days, 'day')}`,
      href: '/scoring',
    });
  }

  return beats;
}

/**
 * The line under the section.
 *
 * Says what the rhythm is for rather than counting what is in it, because a count is exactly the
 * calendar framing this section exists to avoid.
 */
export function rhythmLine(beats: Beat[]): string {
  if (beats.length === 0) {
    return 'Nothing is due from you this week. The rhythm starts once you have people or a month to close.';
  }
  const behind = beats.filter(b => b.state === 'amber' || b.state === 'red').length;
  return behind === 0
    ? 'Everything that makes the month work is being held.'
    : `${plural(behind, 'thing')} in the rhythm needs you. Everything else is being held.`;
}
