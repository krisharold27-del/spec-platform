/**
 * Thirteen weeks of money in and money out, and the week it runs short.
 *
 * ── Why thirteen weeks ───────────────────────────────────────────────────────────────────────────
 *
 * A quarter. Far enough out that something can still be done about it — a claim raised, an invoice
 * chased, a supplier asked for terms — and near enough that the numbers are real work rather than a
 * forecast somebody invented.
 *
 * ── SPEC does not become the accounting system ───────────────────────────────────────────────────
 *
 * The balances and the bills come from the business's accounting system, which stays the financial
 * system; SPEC reads it and puts it next to what it alone knows — the schedule, the claims not yet
 * raised, the supplier bills held. That combination is the whole value: an accountant can tell you
 * what happened, and only the schedule can tell you what is about to.
 *
 * ── The buffer is the business's own number ──────────────────────────────────────────────────────
 *
 * Every business has a level below which it starts making bad decisions — paying late, discounting
 * to get a deposit in. That number is not something SPEC can know, so it is set per business, and
 * the default is a starting point rather than an opinion.
 */

/** The default floor, until a business sets its own. */
export const DEFAULT_BUFFER_CENTS = 8_000_000; // $80,000

export interface Week {
  /** 1–13. */
  n: number;
  /** Monday of that week, YYYY-MM-DD. */
  startsAt: string;
  inCents: number;
  outCents: number;
  /** What is unusual about this week — a BAS, super, an insurance renewal. */
  note?: string;
}

export interface WeekBalance extends Week {
  /** What the account is forecast to hold at the end of this week. */
  balanceCents: number;
  /** True when this week closes under the buffer. */
  short: boolean;
}

/**
 * Run the balance forward, week by week.
 *
 * Deliberately a running total rather than thirteen independent sums: the question is never "how
 * much comes in in week 7", it is "what is left by week 7", and those are different questions with
 * different answers.
 */
export function runForward(
  openingCents: number,
  weeks: readonly Week[],
  bufferCents: number = DEFAULT_BUFFER_CENTS,
): WeekBalance[] {
  let balance = openingCents;
  return weeks.map(w => {
    balance += w.inCents - w.outCents;
    return { ...w, balanceCents: balance, short: balance < bufferCents };
  });
}

/** The week it gets tightest. The one number worth knowing off this screen. */
export function lowest(balances: readonly WeekBalance[]): WeekBalance | null {
  if (!balances.length) return null;
  return balances.reduce((low, w) => (w.balanceCents < low.balanceCents ? w : low));
}

export interface CashStats {
  todayCents: number;
  lowestCents: number;
  lowestWeek: number;
  owedToYouCents: number;
  youOweCents: number;
  /** True when any week in the thirteen closes under the buffer. */
  goesShort: boolean;
}

export function cashStats(
  openingCents: number,
  balances: readonly WeekBalance[],
  owedToYouCents: number,
  youOweCents: number,
): CashStats {
  const low = lowest(balances);
  return {
    todayCents: openingCents,
    lowestCents: low?.balanceCents ?? openingCents,
    lowestWeek: low?.n ?? 0,
    owedToYouCents,
    youOweCents,
    goesShort: balances.some(w => w.short),
  };
}

const k = (cents: number): string => `$${Math.round(cents / 100_000)}k`;

/**
 * What to do about the week that runs short.
 *
 * Named actions with amounts on them, never "improve cash flow". The two levers a trade business
 * actually has in a fortnight are the claim it has earned and not raised, and the invoice somebody
 * is sitting on — so those are what this offers, with what each is worth.
 */
export interface CashFix {
  says: string;
  /** What it is worth, so the two can be compared. */
  worthCents: number;
  where: string;
}

export function cashAdvice(
  s: CashStats,
  fixes: readonly CashFix[],
  bufferCents: number = DEFAULT_BUFFER_CENTS,
): string {
  if (!s.goesShort) {
    return `The lowest week is ${k(s.lowestCents)}, above your ${k(bufferCents)} buffer. Nothing to do.`;
  }
  const worth = fixes.reduce((t, f) => t + f.worthCents, 0);
  if (!fixes.length) {
    return `Week ${s.lowestWeek} drops to ${k(s.lowestCents)}, under your ${k(bufferCents)} buffer. Nothing in SPEC will fix it on its own — this one needs a conversation.`;
  }
  const enough = s.lowestCents + worth >= bufferCents;
  return enough
    ? `Week ${s.lowestWeek} drops to ${k(s.lowestCents)}, under your ${k(bufferCents)} buffer. ${fixes.map(f => f.says).join(' ')} and it stays above.`
    : `Week ${s.lowestWeek} drops to ${k(s.lowestCents)}, under your ${k(bufferCents)} buffer. ${fixes.map(f => f.says).join(' ')} — still ${k(bufferCents - s.lowestCents - worth)} short, so something else has to move.`;
}

/** The headline. Never reads as fine while a week closes under the buffer. */
export function cashLine(s: CashStats, bufferCents: number = DEFAULT_BUFFER_CENTS): string {
  if (s.goesShort) return `Week ${s.lowestWeek} drops to ${k(s.lowestCents)}, under your ${k(bufferCents)} buffer.`;
  if (s.owedToYouCents > 0) return `${k(s.todayCents)} today, ${k(s.owedToYouCents)} owed to you. No week under the buffer.`;
  return `${k(s.todayCents)} today. No week under the buffer.`;
}

export { k as cashLabel };
