/**
 * What each seat can SEE — which is a different question from what it can change.
 *
 * ── The hole this closes ─────────────────────────────────────────────────────────────────────────
 *
 * Until now `/jobs` was gated on one thing: are you signed in to this business. `canManage` decided
 * whether the buttons appeared, and every tab rendered for everybody. So anybody with a login could
 * open Work in progress and read every job's margin, Cash flow and see the whole position, and
 * Customers and take the client list.
 *
 * Nobody decided that. It is what happens when permission is built as "may I press this" and sight
 * is left to whatever the page happens to render — the buttons get guarded because they are visible
 * in the code, and the numbers underneath them do not, because nothing draws attention to them.
 *
 * Two answers from Kris, 25 September, settle it:
 *
 *   A subcontractor sees **their own work only**. He had just said *"they can use the app the same
 *   as an employee - everything is simple and direct through the app for subbies"* — which is about
 *   HOW the work is done, not what comes with it. A subbie is not disloyal; a subbie is somebody
 *   who very often also works for a competitor next week, and handing them a margin sheet is a
 *   thing a business would never do on purpose and can very easily do by accident.
 *
 *   For employees: **money is leadership**. Margins, cash flow, what is owed and the customer list
 *   belong to the seats accountable for them. A team member sees their work, their day and their
 *   own scorecard.
 *
 * ── Sight is not the same as trust ───────────────────────────────────────────────────────────────
 *
 * Worth saying because the opposite reading is available and it is wrong. This is not a judgement
 * about anybody. It is that a number has an owner, and the person who has to act on the cash
 * position is the person who should be carrying it — showing it to twelve people who cannot act on
 * it does not make it twelve times more likely to be fixed, it makes it furniture.
 */
import type { SeatKind } from './chart-seats';

/** The three, in the order of how much of the business they carry. */
export type Seat = 'leadership' | 'team' | 'subcontractor';

/**
 * Which seat somebody is in.
 *
 * The subcontractor tick beats everything, including a leadership chart seat. A subbie put in
 * charge of a crew is still a subbie — the tick is about who they are to the business, and the
 * chart is about what they are doing this month.
 */
export function seatOf(
  person: { isSubcontractor: boolean; seatKind: SeatKind },
): Seat {
  if (person.isSubcontractor) return 'subcontractor';
  return person.seatKind === 'leadership' ? 'leadership' : 'team';
}

/**
 * Who a thing is for.
 *
 * `work` is what is on, who is doing it and when. `money` is what it is worth, what it cost, what
 * is owed and who the customers are — everything somebody could take to a competitor or be
 * distressed by without being able to act on it.
 */
export type Sight = 'work' | 'money';

/**
 * Every Jobs tab, and which kind it is. Filed by what is ON the tab, not by its title.
 *
 * `quotes`, `tenders` and `takeoff` are money because a price list is the most portable thing a
 * business owns. `customers` is money because the client list is the asset that actually walks.
 * `rework` is money because it is a cost sheet — the rate would be fine, the figures are not.
 * `catalogue` and `stock` are money because they carry supplier cost, which is the number a
 * competitor most wants and a customer must never see.
 *
 * `pipeline`, `schedule`, `time`, `tools`, `service` and `prebuilds` are the work itself: what is
 * on, who is on it, when, and what to take. A business that hides those from the people doing them
 * is not protecting anything, it is just making the day harder.
 */
export const TAB_SIGHT: Record<string, Sight> = {
  pipeline: 'work',
  schedule: 'work',
  time: 'work',
  tools: 'work',
  service: 'work',
  prebuilds: 'work',

  leads: 'money',
  quotes: 'money',
  tenders: 'money',
  takeoff: 'money',
  customers: 'money',
  ace: 'money',
  jobace: 'money',
  howlong: 'money',
  growth: 'money',
  catalogue: 'money',
  stock: 'money',
  billing: 'money',
  wip: 'money',
  cash: 'money',
  rework: 'money',
  /* A compliance register, not a price list — but it names every job, so it stays leadership. */
  certificates: 'money',
  /* Agreed rates ARE a price list, and hire costs money. Leadership. */
  rates: 'money',
  reviews: 'money',
};

/**
 * May this seat open this tab?
 *
 * A subcontractor opens none of them. Their work reaches them through their own day on the phone,
 * which is where it should reach anybody actually doing the work — the Jobs screen is the office's
 * view of the business, and a subbie is not in the office.
 */
export function maySeeTab(seat: Seat, tab: string): boolean {
  if (seat === 'subcontractor') return false;
  if (seat === 'leadership') return true;
  return TAB_SIGHT[tab] === 'work';
}

export const tabsFor = <T extends { key: string }>(seat: Seat, tabs: readonly T[]): T[] =>
  tabs.filter(t => maySeeTab(seat, t.key));

/** Whether this seat sees what work is worth, anywhere. The one switch the job rows are stripped by. */
export const maySeeMoney = (seat: Seat): boolean => seat === 'leadership';

/**
 * Take the money out of a job row.
 *
 * Because filtering the TABS is not enough on its own: the board itself carries a value on every
 * card, so a team member reading the pipeline would still be reading the order book. Stripped at
 * the source rather than hidden in the markup — a number that reaches the page and is styled away
 * is a number that is still in the page.
 */
export function stripMoney<T extends { valueCents?: number | null; materialsCents?: number | null }>(
  rows: readonly T[],
  seat: Seat,
): T[] {
  if (maySeeMoney(seat)) return [...rows];
  return rows.map(r => ({ ...r, valueCents: 0, materialsCents: 0 }));
}

/** Said to somebody who has arrived at a door that is not theirs. Never "access denied". */
export function whyNot(seat: Seat): string {
  if (seat === 'subcontractor') {
    return 'Your work comes to you on your own page — jobs, your hours, and what you need before you start. The Jobs screen is the office’s view of the business.';
  }
  return 'What jobs are worth, what they cost and who the customers are sit with the leadership seats that carry them. Your own work, your day and your scorecard are on your page.';
}

/** Where to send them instead — their own work, not a dead end. */
export const insteadGoTo = (seat: Seat): string =>
  seat === 'subcontractor' ? '/tech-day' : '/my-page';
