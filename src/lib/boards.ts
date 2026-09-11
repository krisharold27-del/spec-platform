/**
 * Conversation boards — pure functions, no I/O.
 *
 * Not the board of directors, and not a dashboard. A conversation board is a visual built to
 * provoke one specific realisation: it holds a mirror up to a blind spot and lets the data do the
 * confronting, so a hard conversation has a neutral third party in it instead of an accusation.
 *
 * Anyone can build a dashboard. The thing that makes a leader change their own behaviour is a
 * different object, and it is built to three rules.
 *
 * **1. The board never labels the person.** It shows what happened and stops. The first board came
 * out of a director recognising himself in his own numbers — and the whole mechanism is that HE
 * reached it. A board that says "you are doing this" is the consultant confronting him again,
 * wearing a chart, and it will be argued with instead of absorbed. It is also the rule book's:
 * state the facts and the decision, and never name somebody's psychology back at them.
 *
 * **2. A board can only be run on yourself.** Not on a person below you, not by the person above.
 * The moment it can be pointed at somebody it stops being a mirror and becomes surveillance, and
 * everybody starts managing the board instead of the business. That is enforced where the data is
 * fetched, not here.
 *
 * **3. Every board carries the change that would move it.** A realisation with no next action is
 * just bad news about yourself.
 *
 * The comparison is always against a described pattern, never against another person or another
 * business. There is no leaderboard in SPEC, and a conversation board is exactly where one would
 * be most tempting and most damaging.
 */

export interface Signal {
  key: string;
  label: string;
  /** 0–1, how concentrated this is. Null when there is not enough to read. */
  value: number | null;
  /** The count behind it, said the way a person would say it: "11 of 12". */
  display: string;
  /** What the other way of working looks like on this signal. A description, never a target. */
  contrast: string;
  /** True when the number points at everything running through one person. */
  concentrated: boolean;
}

export interface Board {
  key: string;
  title: string;
  /** The realisation it exists to provoke, put as a question the reader answers themselves. */
  question: string;
  /** The two ways of working, named as ways of working — never as kinds of person. */
  poles: { concentrated: string; distributed: string };
  signals: Signal[];
  /** Facts, in one line. Never a verdict, and never a diagnosis. */
  reading: string;
  /** The smallest concrete thing that would move it. */
  change: string;
  /** How much of the board could actually be computed from what the business has recorded. */
  coverage: { measured: number; total: number };
  /** True when too little is recorded for the board to be worth reading. */
  tooEarly: boolean;
}

/** Anything at or above this is one person's board rather than a team's. Stated, so it is arguable. */
export const CONCENTRATED_AT = 0.7;

const share = (mine: number, total: number): number | null => (total > 0 ? mine / total : null);

function signal(
  key: string,
  label: string,
  mine: number,
  total: number,
  noun: string,
  contrast: string,
): Signal {
  const value = share(mine, total);
  return {
    key,
    label,
    value,
    // "None recorded yet" rather than "No <noun> recorded yet": the nouns read naturally in a count
    // and awkwardly in a negation, and a line nobody can parse is a line nobody reads.
    display: total === 0 ? 'None recorded yet' : `${mine} of ${total} ${noun}`,
    contrast,
    concentrated: value !== null && value >= CONCENTRATED_AT,
  };
}

export interface WhoDecidesInput {
  /** The person this board is about — always the viewer. */
  me: string;
  /** Decisions recorded on the weekly meeting, and how many carry this person's name. */
  decisions: { total: number; mine: number };
  /** Open actions, and how many this person owns. */
  actions: { total: number; mine: number };
  /** Targets on the roles below, and how many were agreed exactly as first proposed. */
  targets: { total: number; unchanged: number };
  /** Scorecard marks on roles below, and how many were entered by this person rather than the holder. */
  marks: { total: number; mine: number };
  /** Comments on those cards, and how many are this person's. */
  comments: { total: number; mine: number };
}

/**
 * Board one — who decides here.
 *
 * The mirror a director looked into and recognised himself. It reads five things the business
 * records anyway: who writes the decisions down, who ends up owning the work, whether a target ever
 * moved between being proposed and being agreed, who marks other people's cards, and who does the
 * talking on them.
 *
 * The target signal is the sharpest of the five, because SPEC's own claim is that a target is
 * agreed with the person who holds the role and never imposed. If every target was agreed exactly
 * as proposed, no negotiation happened — whatever the screen said at the time.
 */
export function whoDecides(input: WhoDecidesInput): Board {
  const signals: Signal[] = [
    signal('decisions', 'Decisions written down in your name', input.decisions.mine, input.decisions.total,
      'decisions', 'Recorded by whoever actually made them.'),
    signal('actions', 'Open actions you own', input.actions.mine, input.actions.total,
      'actions', 'Owned across the people who do the work.'),
    signal('targets', 'Targets agreed exactly as proposed', input.targets.unchanged, input.targets.total,
      'targets', 'Moved during the conversation, because the person holding the role pushed back.'),
    signal('marks', 'Cards below you that you marked yourself', input.marks.mine, input.marks.total,
      'marks', 'Marked by the person accountable for the number.'),
    signal('comments', 'The talking on those cards', input.comments.mine, input.comments.total,
      'comments', 'A conversation, with the card holder in it.'),
  ];

  const measured = signals.filter(s => s.value !== null).length;
  const loud = signals.filter(s => s.concentrated);
  const tooEarly = measured < 2;

  return {
    key: 'who_decides',
    title: 'Who decides here',
    question: 'If you were away for a month, what would stop?',
    poles: {
      concentrated: 'Everything runs through one person',
      distributed: 'A team that manages itself',
    },
    signals,
    reading: tooEarly
      ? 'Not enough is recorded yet for this to be worth reading. It needs a few weeks of meetings and a closed month behind it.'
      : loud.length === 0
        ? `Nothing here concentrates on you. Across ${measured} ${measured === 1 ? 'measure' : 'measures'}, the work and the decisions sit with the people doing them.`
        : `${loud.length} of ${measured} ${measured === 1 ? 'measure runs' : 'measures run'} through you: ${loud.map(s => s.label.toLowerCase()).join(', ')}.`,
    change: loud.length === 0
      ? 'Nothing to change. Worth running again after the next close.'
      : changeFor(loud[0].key),
    coverage: { measured, total: signals.length },
    tooEarly,
  };
}

/** The smallest real thing that would move the loudest signal. One step, not a programme. */
function changeFor(key: string): string {
  switch (key) {
    case 'decisions':
      return 'At the next meeting, let the person who made a decision write it down. Three of them is enough to see whether the record changes shape.';
    case 'actions':
      return 'Take the next three actions that land on you and ask who else could own them. If the answer is nobody, that is a role that does not exist yet.';
    case 'targets':
      return 'On the next target, open with the number you would accept rather than the number you want. A target nobody argued with was never agreed.';
    case 'marks':
      return 'Let each person mark their own card this month and read it afterwards. You keep the sign-off; you stop being the one who fills it in.';
    case 'comments':
      return 'Ask a question on the next card instead of writing the answer on it.';
    default:
      return 'Pick the loudest line above and change one instance of it.';
  }
}

export interface InTheRoomInput {
  me: string;
  /** The last few weeks, oldest first: how many of the senior group were actually there. */
  weeks: { weekOf: string; present: number; roster: number; logged: boolean }[];
}

/**
 * Board two — who is actually in the room.
 *
 * Provokes a different realisation from the first: not "I decide everything" but "I am briefing
 * people one at a time and calling it a meeting". A senior group that never sits together does not
 * have shared decisions, whatever the minutes say.
 */
export function inTheRoom(input: InTheRoomInput): Board {
  const held = input.weeks.filter(w => w.logged);
  const roster = Math.max(...input.weeks.map(w => w.roster), 0);
  const fullHouse = held.filter(w => w.roster > 0 && w.present >= w.roster).length;
  const missed = input.weeks.length - held.length;

  const signals: Signal[] = [
    signal('held', 'Weeks the meeting was logged', held.length, input.weeks.length,
      'weeks', 'Held and written down every week, without exception.'),
    signal('full', 'Weeks the whole group was there', fullHouse, Math.max(held.length, 0),
      'meetings held', 'Everybody who runs something, in the same room.'),
  ];

  const measured = signals.filter(s => s.value !== null).length;
  const tooEarly = input.weeks.length < 2;
  const attendance = held.length
    ? held.reduce((t, w) => t + (w.roster ? w.present / w.roster : 0), 0) / held.length
    : null;

  return {
    key: 'in_the_room',
    title: 'Who is actually in the room',
    question: 'When was the last time everyone who runs something heard the same thing at the same time?',
    poles: {
      concentrated: 'Briefed one at a time',
      distributed: 'Decided together, once',
    },
    signals,
    reading: tooEarly
      ? 'Not enough weeks recorded yet. This needs a month of them behind it.'
      : missed > 0
        ? `${missed} of the last ${input.weeks.length} weeks were not logged. ${
            attendance !== null ? `Of the ones that were, an average of ${Math.round(attendance * 100)}% of the group was there.` : ''
          }`.trim()
        : `Every week logged. An average of ${Math.round((attendance ?? 0) * 100)}% of the ${roster} people who run something were in the room.`,
    change: missed > 0
      ? 'Log the next one even if it ran for six minutes. A week with no record is a week nobody can refer back to.'
      : fullHouse < held.length
        ? 'Ask the people who were not there what they were doing instead. One of those answers is usually the real agenda.'
        : 'Nothing to change here.',
    coverage: { measured, total: signals.length },
    tooEarly,
  };
}

export interface WhereItWaitsInput {
  me: string;
  /** Open actions carried from earlier weeks, with how many weeks each has waited. */
  carried: { weeks: number; owner: string }[];
  /** Approvals waiting on this person, with how many days each has waited. */
  waitingOnMe: { days: number }[];
  /** Roles reporting in that nobody holds. */
  vacancies: number;
}

/**
 * Board three — where things wait.
 *
 * The realisation is the least comfortable and the easiest to compute: the queue is not evidence of
 * a busy business, it is a map of one bottleneck. It says nothing about why. It does not need to.
 */
export function whereItWaits(input: WhereItWaitsInput): Board {
  const stale = input.carried.filter(c => c.weeks >= 3);
  const mine = input.carried.filter(c => c.owner === input.me);
  const longWaits = input.waitingOnMe.filter(a => a.days >= 14);

  // Built before the board so the reading and the table cannot disagree about what is worth saying.
  const lines = [
    // The loudest line has to appear in the reading. A signal flagged in the table and absent from
    // the sentence underneath it reads as though the board did not notice.
    mine.length && input.carried.length && mine.length / input.carried.length >= CONCENTRATED_AT
      ? `${mine.length} of the ${input.carried.length} carried actions are yours` : null,
    stale.length ? `${stale.length} ${stale.length === 1 ? 'action has' : 'actions have'} been carried three weeks or more` : null,
    longWaits.length ? `${longWaits.length} ${longWaits.length === 1 ? 'approval has' : 'approvals have'} been waiting a fortnight` : null,
    input.vacancies ? `${input.vacancies} ${input.vacancies === 1 ? 'role reports' : 'roles report'} to you with nobody in ${input.vacancies === 1 ? 'it' : 'them'}` : null,
  ].filter((l): l is string => l !== null);

  const signals: Signal[] = [
    signal('carried', 'Carried actions that are yours', mine.length, input.carried.length,
      'carried actions', 'Spread across the people who own the work.'),
    signal('stale', 'Carried three weeks or more', stale.length, input.carried.length,
      'carried actions', 'Closed or dropped inside a fortnight.'),
    signal('approvals', 'Approvals waiting a fortnight or more', longWaits.length, input.waitingOnMe.length,
      'approvals', 'Decided in the week they were asked.'),
  ];

  const measured = signals.filter(s => s.value !== null).length;
  const tooEarly = measured === 0;

  return {
    key: 'where_it_waits',
    title: 'Where things wait',
    question: 'What is the oldest thing on this list, and who is it waiting for?',
    poles: {
      concentrated: 'One queue, one person',
      distributed: 'Decided where the work is',
    },
    signals,
    reading: tooEarly
      ? 'Nothing is waiting, or nothing is recorded yet.'
      : lines.length
        ? `${lines.join('. ')}.`
        : 'Nothing has been sitting.',
    change: stale.length
      ? 'An action carried three weeks is a decision nobody has made. Make it, or take it off the list.'
      : longWaits.length
        ? 'Decide the oldest one today, either way. A decline is a real outcome and it unblocks the same as a yes.'
        : input.vacancies
          ? 'A vacant role is a decision about whether the work matters. Fill it or fold it in.'
          : 'Nothing to change here.',
    coverage: { measured, total: signals.length },
    tooEarly,
  };
}

export const BOARD_KEYS = ['who_decides', 'in_the_room', 'where_it_waits'] as const;
export type BoardKey = (typeof BOARD_KEYS)[number];

/**
 * What the library is for, said once. Shown above the boards so nobody mistakes them for a
 * dashboard and starts trying to make the numbers go up.
 */
export const LIBRARY_NOTE =
  'These are not scores and nothing here counts towards anything. Each one is built to raise a single '
  + 'question about how you work, from what the business already recorded. Nobody else can see yours.';
