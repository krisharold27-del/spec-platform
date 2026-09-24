/**
 * Your job today — the person's role, laid out as the steps it is actually made of.
 *
 * ── Why a list of steps and not a dashboard ──────────────────────────────────────────────────────
 *
 * Every other screen in SPEC answers "how is it going". This one answers "what do I do", which is a
 * different question and the one most people open a system with. A supervisor at 6.45am does not
 * want four pillars; they want to know the toolbox talk comes before anything else.
 *
 * So it is ordered, and the order is the content. Each step opens exactly where it is done — a deep
 * link into a Jobs tab, Safety, Tech Day or the weekly meeting — because a step that tells somebody
 * what to do and makes them find it is a step they do later.
 *
 * ── The principle underneath ─────────────────────────────────────────────────────────────────────
 *
 * The design states it plainly: *"the only system outside SPEC is the financial system (Xero/MYOB),
 * which SPEC keeps up to date."* Every step here lands inside SPEC, and that is the promise being
 * made — if a step sent somebody to a second system, the claim would be false.
 *
 * ── Taken from the design, and meant to be generated ─────────────────────────────────────────────
 *
 * The lists below are the design's own, word for word. The design also says that in the product
 * these are generated from the role's KPIs and what is open for that person — late quotes,
 * timesheets waiting, holdups, callbacks. `countsFor` is where that happens: the step keeps its
 * words and gets the number that makes it worth doing now.
 */

export type RoleKind = 'ops' | 'supervisor' | 'crew' | 'bd';

export interface Step {
  title: string;
  /** Why this one, now. Gets a real number attached where SPEC has one. */
  note: string;
  /** Where it is done. Always inside SPEC. */
  where: string;
}

export const ROLE_STEPS: Record<RoleKind, { title: string; steps: Step[] }> = {
  ops: {
    title: 'Your job today',
    steps: [
      { title: 'Read the business verdict and anything red', note: 'Top of this page. Red always comes first.', where: '/my-page' },
      { title: 'Fill the empty crew days', note: 'Crew days this week that are not on a job yet.', where: '/jobs?tab=schedule' },
      { title: 'Clear the supplier holdups', note: 'Late orders, each with a way around it.', where: '/jobs?tab=stock' },
      { title: 'Approve timesheets', note: 'They feed job costs and payroll.', where: '/jobs?tab=time' },
      { title: 'Close the callbacks', note: 'Each one is tied to its cause.', where: '/jobs?tab=rework' },
      { title: 'Ready for the weekly meeting', note: 'The agenda has built itself from the register.', where: '/meeting' },
    ],
  },
  supervisor: {
    title: 'Your job today',
    steps: [
      { title: 'Toolbox talk and crew sign-on', note: 'Before 7am. Missing names show up on their own.', where: '/safety?tab=site' },
      { title: 'Every person on a job, SWMS signed', note: 'Check the schedule and the SWMS for today’s high-risk work.', where: '/jobs?tab=schedule' },
      { title: 'Jobs on the hours quoted', note: 'Anything running over. Look at it first.', where: '/jobs' },
      { title: 'Price variations on site', note: 'Priced from pre-builds. The client signs on your phone.', where: '/jobs?tab=billing' },
      { title: 'Sign off finished jobs', note: 'The invoice goes out by itself, and the customer can pay on the spot.', where: '/tech-day' },
      { title: 'Approve your crew’s timesheets', note: 'Before you knock off. Billable hours count on your board.', where: '/jobs?tab=time' },
    ],
  },
  crew: {
    title: 'Your day',
    steps: [
      { title: 'Check you’re clear to work', note: 'Your tickets and induction, green before you start.', where: '/tech-day' },
      { title: 'Sign the SWMS and start the job', note: 'Starting the job starts your hours.', where: '/tech-day' },
      { title: 'Photos and materials as you go', note: 'SPEC puts them on the job.', where: '/tech-day' },
      { title: 'Client sign-off and payment', note: 'They sign on your phone and can tap to pay.', where: '/tech-day' },
      { title: 'Knock off', note: 'Nothing to fill in. Tomorrow’s first job and van list are ready.', where: '/tech-day' },
    ],
  },
  bd: {
    title: 'Your job today',
    steps: [
      { title: 'Late quotes first', note: 'Anything past 2 days is on this page in red.', where: '/jobs?tab=leads' },
      { title: 'Answer new enquiries within the hour', note: 'Emails, web forms and missed calls, all in one list.', where: '/jobs?tab=leads' },
      { title: 'Quote from pre-builds', note: 'Hours from How long?, parts at today’s prices.', where: '/jobs?tab=prebuilds' },
      { title: 'Follow up quotes at 3 days', note: 'SPEC drafts the follow-up. You press Approve.', where: '/jobs?tab=customers' },
      { title: 'Send the work SPEC found', note: 'Service due, old switchboards, ageing solar.', where: '/jobs?tab=leads' },
      { title: 'Answer new reviews', note: 'Replies are drafted. Approve and post.', where: '/jobs?tab=reviews' },
    ],
  },
};

/**
 * Which list this person gets, from the role they hold on the chart.
 *
 * By what the role DOES rather than by a level string, so a business that calls its supervisors
 * "leading hands" still gets the supervisor's day. Anybody SPEC cannot place gets the crew list —
 * the shortest one, and the one that is right for most people in a trade business.
 */
export function roleKindOf(role: { title: string; level?: string | null } | null | undefined): RoleKind {
  const t = (role?.title ?? '').toLowerCase();
  const level = (role?.level ?? '').toLowerCase();

  if (/estimat|sales|business development|commercial/.test(t)) return 'bd';
  if (/supervisor|leading hand|foreman|forewoman/.test(t) || level === 'supervisor') return 'supervisor';
  if (/operations|general manager|managing director|manager/.test(t) || ['gm', 'manager'].includes(level)) return 'ops';
  return 'crew';
}

/**
 * The numbers that make a step worth doing today.
 *
 * A step with a real count in front of it — "4 waiting" — is a step somebody does. The same step
 * with nothing is a instruction they have read before. So where SPEC holds the count it goes on the
 * note, and where it does not the step keeps its own words rather than showing a zero.
 */
export interface Counts {
  emptyCrewDays?: number;
  lateOrders?: number;
  timesheetsWaiting?: number;
  openCallbacks?: number;
  lateQuotes?: number;
  newEnquiries?: number;
  reviewsToAnswer?: number;
}

const NUMBERED: Record<string, keyof Counts> = {
  'Fill the empty crew days': 'emptyCrewDays',
  'Clear the supplier holdups': 'lateOrders',
  'Approve timesheets': 'timesheetsWaiting',
  'Approve your crew’s timesheets': 'timesheetsWaiting',
  'Close the callbacks': 'openCallbacks',
  'Late quotes first': 'lateQuotes',
  'Answer new enquiries within the hour': 'newEnquiries',
  'Answer new reviews': 'reviewsToAnswer',
};

export interface LiveStep extends Step {
  /** How many of this thing are waiting, when SPEC knows. Null when it does not. */
  count: number | null;
  /** True once there is nothing left of this to do. */
  done: boolean;
}

/**
 * The steps, with what SPEC actually knows attached.
 *
 * A step is DONE when its count is zero, and only when SPEC holds a count — never by somebody
 * ticking it. A checklist people tick is a checklist that gets ticked on the way past; one that
 * ticks itself when the work is gone is the same list telling the truth.
 */
export function stepsFor(kind: RoleKind, counts: Counts = {}): LiveStep[] {
  return ROLE_STEPS[kind].steps.map(s => {
    const key = NUMBERED[s.title];
    const count = key ? counts[key] ?? null : null;
    return {
      ...s,
      count,
      done: count === 0,
      note: count !== null && count > 0
        ? `${count} waiting. ${s.note}`
        : s.note,
    };
  });
}

/** The next thing, which is the first one not done. Null when the day is clear. */
export const nextStep = (steps: readonly LiveStep[]): LiveStep | null =>
  steps.find(s => !s.done) ?? null;

/**
 * How the day reads at the top.
 *
 * Counts only the steps SPEC can actually see the state of. "3 of 6" where three of those six are
 * unknowable is a progress bar that lies, and a leader who learns it lies stops reading it.
 */
export function progressLine(steps: readonly LiveStep[]): string {
  const known = steps.filter(s => s.count !== null);
  if (!known.length) return `${steps.length} steps, in order`;
  const done = known.filter(s => s.done).length;
  if (done === known.length) return 'Nothing waiting on you right now';
  return `${done} of ${known.length} clear`;
}
