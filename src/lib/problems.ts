/**
 * The problems SPEC exists to solve, and what it does about each one.
 *
 * ── Why this is a file rather than words on eight screens ────────────────────────────────────────
 *
 * SPEC is not a dashboard. The business was built on one idea: **find the problems a business keeps
 * having, then solve them — always starting with the people.** Every one of the twenty-four below
 * is a people problem, including the ones that arrive dressed as a numbers problem, and that is the
 * whole argument.
 *
 * The designs carry them as Before and After pairs on the screen where each one gets fixed, and the
 * product carried none of them. So a customer saw the software and never saw the thinking — which
 * is the half that cannot be copied.
 *
 * They live here, once, because the same problem is named on the marketing site, on the screen that
 * fixes it, and in a sales conversation. Three copies of a sentence is three chances for them to
 * stop agreeing, and a differentiator that says two different things is not one.
 *
 * The wording is the designs' own, checked by tests/problems.test.ts against the design files, so
 * a change there has to reach here.
 */

export interface Problem {
  /** The problem, as an owner would say it out loud. */
  problem: string;
  /** What it looks like in a business without SPEC. Never softened — it has to be recognisable. */
  before: string;
  /** What SPEC actually does about it. A mechanism, never a promise. */
  after: string;
}

export interface ProblemSet {
  /** The screen these belong to, matching the design name. */
  screen: string;
  /** Where the product serves it. */
  route: string;
  problems: Problem[];
}

export const PROBLEMS = {
  inbox: {
    screen: 'Inbox',
    route: '/inbox',
    problems: [
      {
        problem: 'Decisions sit for weeks',
        before: 'an approval lives in someone\'s email under forty other things, and the person waiting has no idea where it is.',
        after: 'one queue with an age on every item and a line saying what it is blocking, so the cost of waiting is visible to the person holding it up.',
      },
      {
        problem: 'Leaders drown in noise',
        before: 'every system notifies everybody, so nobody reads any of it.',
        after: 'Claude clears the routine, the queue holds only what needs a person, and hard gates are the only thing that always interrupts.',
      },
      {
        problem: 'Nobody can see who is holding it up',
        before: 'the delay is discussed at the board meeting and blamed on the process.',
        after: 'waiting on someone else is its own list, with a name and an age, and anything over two weeks reaches the board pack.',
      },
    ],
  },
  scoring: {
    screen: 'Monthly Scoring',
    route: '/scoring',
    problems: [
      {
        problem: 'Burnout and psychosocial risk unseen',
        before: 'noticed after an incident, a stress claim or a resignation, and treated as a one-off.',
        after: 'psychosocial sits inside the Zero Harm gate. Pass or fail, reported on its own line, never averaged away by a good month elsewhere.',
      },
      {
        problem: 'Numbers nobody trusts',
        before: 'a figure appears in a board pack and the meeting is spent arguing about where it came from.',
        after: 'fed numbers carry their system, manual ones carry a name, and anything with neither is flagged rather than scored.',
      },
      {
        problem: 'History gets rewritten',
        before: 'last quarter\'s numbers quietly improve once someone has had a look at them.',
        after: 'the Director signs, the period locks, and a correction is a noted adjustment in the next month rather than an edit to the last one.',
      },
    ],
  },
  myPage: {
    screen: 'My Page',
    route: '/my-page',
    problems: [
      {
        problem: 'Nobody knows what is expected of them',
        before: 'expectations live in a manager\'s head and surface once a year, usually when something has already gone wrong.',
        after: 'eight numbers for the role, on the page every person opens at the start of the day, with today\'s list saying which one each task moves.',
      },
      {
        problem: 'Performance conversations get avoided',
        before: 'the hard conversation is the one nobody schedules, so it happens late and personally.',
        after: 'the weekly meeting arrives with three items the data picked, and logging it is what keeps the month scoreable. The conversation is about a number, not a person.',
      },
      {
        problem: 'People never get to 100%',
        before: 'effort goes into whatever shouted loudest that morning.',
        after: 'four lights, and the one action that turns the amber one green is at the top of the list before anything else is opened.',
      },
    ],
  },
  scorecard: {
    screen: 'My Scorecard',
    route: '/scorecard',
    problems: [
      {
        problem: 'Underperformance drags on for months',
        before: 'noticed in month six, argued about on feel, and by then it is a dismissal conversation.',
        after: 'amber the month it happens, on a named KPI, with the source and a written comment against it. Month two is support, not surprise.',
      },
      {
        problem: 'Pay and reward feel arbitrary',
        before: 'a raise decided in a corridor, and everyone else guessing what earned it.',
        after: 'Sales Ace and Ops Ace. Trained on the job, signed off, 90% or better on the KPI board three consecutive closed months doubles the incentive automatically — then the three-month challenge starts again.',
      },
      {
        problem: 'Grievances handled with no record',
        before: 'a conversation nobody wrote down, remembered differently by both sides a year later.',
        after: 'comments sit against the role and the period, visible to the person, their manager and the pack, and the period locks so nothing is rewritten afterwards.',
      },
    ],
  },
  org: {
    screen: 'Org Chart',
    route: '/org',
    problems: [
      {
        problem: 'Key-person risk',
        before: 'the business runs on what one or two people carry in their heads, and nobody finds out how much until they leave.',
        after: 'the role is defined and measured separately from the person. Drag the name onto another card and the scorecard stays where it is.',
      },
      {
        problem: 'Nobody ready to step up',
        before: 'succession is a conversation held after a resignation letter.',
        after: 'a role\'s training path and Ace run say who is already holding the numbers one level down, and a vacant role sits on the chart as a visible cost until it is filled.',
      },
      {
        problem: 'Structure nobody agrees on',
        before: 'three versions of the org chart, all out of date, none of them matching how the work actually flows.',
        after: 'one chart everyone sees, changed by dragging, with the four lights on every card so the structure and the performance are the same picture.',
      },
    ],
  },
  people: {
    screen: 'People',
    route: '/people',
    problems: [
      {
        problem: 'Cannot attract great people',
        before: 'a generic ad, a stack of CVs, and a gut call on the day.',
        after: 'the ad is written from the eight numbers the role is measured on, the region sets the licence and the pay band, and candidates are rated on the same four pillars they will be scored on in month one.',
      },
      {
        problem: 'Good people leave inside 90 days',
        before: 'the exit interview explains it, and the same thing happens to the next person in that crew.',
        after: 'onboarding is tracked, the scorecard is agreed in week one, and an unfilled manager role shows as a cost on the roll-up before the second person goes.',
      },
      {
        problem: 'Culture is invisible until someone quits',
        before: 'everyone says the culture is good until the third resignation in a quarter.',
        after: 'People is a scored pillar every month, with one-to-ones held and retention behind it, so a drift shows up as amber long before it shows up as a resignation.',
      },
    ],
  },
  training: {
    screen: 'Training',
    route: '/training',
    problems: [
      {
        problem: 'Training done once and forgotten',
        before: 'an induction in year one, a certificate in a drawer, and no way to tell whether it changed anything.',
        after: 'every module is tied to a KPI on the scorecard, so the result shows up as a number moving the month after, and expiry reaches the board pack on its own.',
      },
      {
        problem: 'Managers were never taught to manage',
        before: 'promoted for being the best on the tools, then left to work out the people part alone.',
        after: 'the role\'s path includes running the weekly meeting and scoring a person fairly, done on the job, signed off before the role can reach Ace.',
      },
      {
        problem: 'Nobody performs at 100%',
        before: 'training is a cost centre, booked because it was due.',
        after: 'training is assigned against the weakest pillar on the role, so the business can see which module moved which number.',
      },
    ],
  },
  meeting: {
    screen: 'Weekly Meeting',
    route: '/meeting',
    problems: [
      {
        problem: 'Meetings that go nowhere',
        before: 'an hour of updates, no agenda, and last week\'s actions quietly forgotten.',
        after: 'three items the data picked, carried actions at the top, and twenty minutes because there is nothing else to cover.',
      },
      {
        problem: 'Decisions nobody remembers',
        before: 'the same argument three months running because nothing was written down.',
        after: 'decisions are logged with a name and travel to the board pack with the month they were made in.',
      },
      {
        problem: 'Nothing links talk to the numbers',
        before: 'the meeting happens, the scorecard happens, and the two never meet.',
        after: 'every agenda item names its pillar, and logging the meeting is itself a People KPI.',
      },
    ],
  },
} as const satisfies Record<string, ProblemSet>;

export type ProblemKey = keyof typeof PROBLEMS;

/** Every problem SPEC claims to solve, flattened — for the places that show the whole argument. */
export const ALL_PROBLEMS: Problem[] = Object.values(PROBLEMS).flatMap(s => [...s.problems]);
