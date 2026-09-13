/**
 * The labour calculator — pure functions, no I/O.
 *
 * The claim is deliberately narrow: **10 to 30% more out of the labour component**, not out of
 * revenue. Labour is the part a business actually controls month to month, and a claim about
 * revenue would be a claim about the market. Every figure below is computed from the reader's own
 * four numbers, so nothing here is a case study about somebody else.
 *
 * Each leak has a share of the labour bill and a first-year recovery rate. The shares are scaled by
 * `improvement / 30`, so the whole model moves with how much the reader thinks is actually there —
 * a reader who says 10% gets a third of the shares, not a third of the conclusion bolted on at the
 * end. Every line can be switched off, and switching one off removes it from the headline and from
 * every dollar figure rather than greying it out.
 */

export interface Leak {
  id: string;
  name: string;
  /** Percentage of the labour bill, at the 30% improvement anchor. */
  share: number;
  /** How much of it is realistically recoverable in the first twelve months. */
  recover: number;
  pillar: 'Safety' | 'People' | 'Earnings' | 'Compliance';
  where: string;
  /** What SPEC actually does about it — no line without one. */
  how: string;
}

export const LEAKS: Leak[] = [
  {
    id: 'unproductive',
    name: 'Hours paid but not productive',
    share: 8.0, recover: 0.4, pillar: 'Earnings',
    where: 'Paid time lost to travel, waiting on materials, and a schedule that moved without telling anyone.',
    how: 'Utilisation is scored against a target the person agreed, fed by the roster rather than typed in.',
  },
  {
    id: 'rework',
    name: 'Labour spent doing work twice',
    share: 6.0, recover: 0.55, pillar: 'Earnings',
    where: 'Crews back on site because the scope, the take-off or the brief was wrong the first time.',
    how: 'Margin against quote is scored monthly per role, so a rework pattern shows in month one instead of at year end.',
  },
  {
    id: 'undefined_roles',
    name: 'Work falling between undefined roles',
    share: 5.0, recover: 0.5, pillar: 'People',
    where: 'Hours absorbed covering a seat nobody owns, or a role that was never defined.',
    how: 'Roles are defined before people, and a vacant role shows on the roll-up every month it stays open.',
  },
  {
    id: 'double_entry',
    name: 'Admin and double entry',
    share: 4.0, recover: 0.7, pillar: 'Earnings',
    where: 'Supervisors and office staff typing the same job into four systems.',
    how: 'Connected systems feed the KPIs directly, so nobody retypes a number that already exists.',
  },
  {
    id: 'estimating',
    name: 'Estimating and follow-up time wasted',
    share: 3.5, recover: 0.45, pillar: 'Earnings',
    where: 'Hours spent pricing work that then goes quiet because nobody owned the follow-up.',
    how: 'Win rate is a scored KPI on the role that owns it, so a stalled quote is visible rather than forgotten.',
  },
  {
    id: 'incidents',
    name: 'Incidents, stand-downs and compliance rework',
    share: 3.5, recover: 0.6, pillar: 'Safety',
    where: 'Crews standing down, re-inspections, claims, and the admin that follows an incident.',
    how: 'Zero Harm and Clear to Work are hard gates reported separately, so nothing is averaged away until it becomes a claim.',
  },
];

/** The anchor the shares are quoted at. A reader who says 10% gets a third of the shares. */
export const IMPROVEMENT_ANCHOR = 30;

/**
 * The result this method has actually produced, and the evidence behind it.
 *
 * Fifteen years, more than thirty businesses, average twenty per cent. A measured outcome rather
 * than a model — and the strongest thing SPEC can say, provided it is said WITH its evidence. A
 * bare "20% average improvement" is the figure every software company prints and nobody believes;
 * "20% across thirty businesses over fifteen years" is a claim a sceptical owner can go and
 * interrogate, which is the only kind that persuades one.
 *
 * ── The distinction that makes it both honest and better ─────────────────────────────────────────
 *
 * Those thirty businesses were run on a SPREADSHEET. The method is fifteen years old and proven;
 * the software is new and has one customer. That is not a weakness to work around — it is the
 * clearest thing about the product, and it answers the question every buyer of new software
 * actually has: has this ever worked before?
 *
 * So the claim is always attributed to the METHOD, never implied to be a measurement of the
 * platform's own user base. The number is true and the sentence around it has to be true as well.
 */
export const TRACK_RECORD = {
  /**
   * Eighteen, not twenty.
   *
   * Worth stating precisely because the precision is the point: a round twenty is what a marketing
   * department writes, and an eighteen is what a measurement returns. Anybody who has ever been
   * sold anything knows the difference, and rounding it up would cost more credibility than the two
   * points could ever buy.
   */
  improvement: 18,
  /** Measured over the first twelve months, which is the window the figure belongs to. */
  months: 12,
  businesses: 30,
  years: 15,
} as const;

export interface CalculatorInput {
  /** Annual revenue, in the business's own currency. */
  revenue: number;
  headcount: number;
  /** Labour as a share of revenue, as a percentage. */
  labourShare: number;
  /** How much more the reader thinks is in the labour bill, as a percentage. */
  improvement: number;
  /** Leak ids the reader has switched off. */
  off?: string[];
  /** Annual cost of one seat, for the comparison at the bottom. */
  seatCostAnnual: number;
}

export interface LeakLine extends Leak {
  on: boolean;
  /** Dollars a year, at this reader's numbers. */
  amount: number;
  recoverable: number;
}

export interface CalculatorResult {
  labourCost: number;
  lines: LeakLine[];
  /** The total leaking, across the lines still switched on. */
  gap: number;
  recoverable: number;
  /** The headline: the gap as a percentage of the labour bill. */
  gapPctOfLabour: number;
  /** The same gap against total revenue — always the smaller, more honest-sounding number. */
  gapPctOfRevenue: number;
  perPerson: number;
  seatCost: number;
  /** How many times the seat cost the recoverable figure is, or null when nothing is recoverable. */
  multiple: number | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function calculate(input: CalculatorInput): CalculatorResult {
  const revenue = Math.max(0, input.revenue);
  const headcount = Math.max(1, Math.round(input.headcount));
  const labourCost = revenue * (clamp(input.labourShare, 0, 100) / 100);
  const scale = clamp(input.improvement, 0, 100) / IMPROVEMENT_ANCHOR;
  const off = new Set(input.off ?? []);

  const lines: LeakLine[] = LEAKS.map(l => {
    const on = !off.has(l.id);
    const amount = on ? labourCost * ((l.share * scale) / 100) : 0;
    return { ...l, on, amount, recoverable: amount * l.recover };
  });

  const gap = lines.reduce((t, l) => t + l.amount, 0);
  const recoverable = lines.reduce((t, l) => t + l.recoverable, 0);
  const seatCost = headcount * Math.max(0, input.seatCostAnnual);

  return {
    labourCost,
    lines,
    gap,
    recoverable,
    gapPctOfLabour: labourCost > 0 ? (gap / labourCost) * 100 : 0,
    gapPctOfRevenue: revenue > 0 ? (gap / revenue) * 100 : 0,
    perPerson: gap / headcount,
    seatCost,
    // A multiple only means anything when there is something on both sides of it.
    multiple: seatCost > 0 && recoverable > 0 ? recoverable / seatCost : null,
  };
}

/** Whole dollars, grouped. Cents on a figure this size would be false precision. */
export function money(amount: number, currencySymbol = '$'): string {
  return `${currencySymbol}${Math.round(amount).toLocaleString('en-AU')}`;
}

export const DEFAULTS: Omit<CalculatorInput, 'seatCostAnnual'> = {
  revenue: 12_000_000,
  headcount: 40,
  labourShare: 30,
  improvement: 20,
  off: [],
};
