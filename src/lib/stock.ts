/**
 * What is on the vans and in the yard, and what to buy.
 *
 * ── Outsimple them: two numbers, everything else derived ─────────────────────────────────────────
 *
 * A stock system nobody counts is wrong within a fortnight, and a wrong one is worse than none
 * because people trust it. So SPEC asks for the only two numbers a reorder list needs — how many
 * are here, and how few is too few — and works out the rest.
 *
 * `countedAt` is when somebody physically looked. It is what makes the number worth anything, and
 * it is the thing every stock system hides.
 */

/** A count older than this has stopped being evidence. A month of a working van empties it. */
export const STALE_COUNT_DAYS = 30;

export interface Level {
  id: string;
  itemId: string;
  place: string;
  qty: number;
  minQty: number;
  countedAt: string | null;
}

export type StockState = 'ok' | 'low' | 'out' | 'never_counted' | 'stale';

export const STOCK_LABEL: Record<StockState, string> = {
  ok: 'In stock',
  low: 'Running low',
  out: 'Out',
  never_counted: 'Never counted',
  stale: 'Count is old',
};

/**
 * Where a line stands.
 *
 * Being OUT beats every other state, including a stale count — a van with none of something is a
 * van that cannot do the job today, whenever it was last counted.
 */
export function stockStateOf(l: Level, today: string): StockState {
  if (l.qty <= 0) return 'out';
  if (!l.countedAt) return 'never_counted';
  const age = Math.floor((Date.parse(today) - Date.parse(l.countedAt.slice(0, 10))) / 86_400_000);
  if (age > STALE_COUNT_DAYS) return 'stale';
  if (l.minQty > 0 && l.qty < l.minQty) return 'low';
  return 'ok';
}

/** How many to buy to get back to the minimum. Never negative, never zero when it is out. */
export const shortBy = (l: Level): number => Math.max(0, l.minQty - l.qty);

export interface ReorderLine { itemId: string; place: string; qty: number; minQty: number; buy: number }

/**
 * The reorder list: everything under its minimum, most short first.
 *
 * Only lines with a minimum set. A minimum of zero means the business has said it does not want
 * this one reordered automatically, and inventing one for them would fill the list with things
 * nobody asked for — which is how a reorder list gets ignored.
 */
export function reorderList(levels: readonly Level[]): ReorderLine[] {
  return levels
    .filter(l => l.minQty > 0 && l.qty < l.minQty)
    .map(l => ({ itemId: l.itemId, place: l.place, qty: l.qty, minQty: l.minQty, buy: shortBy(l) }))
    .sort((a, b) => b.buy - a.buy);
}

export interface StockStats { lines: number; out: number; low: number; uncounted: number; toBuy: number }

export function stockStats(levels: readonly Level[], today: string): StockStats {
  const states = levels.map(l => stockStateOf(l, today));
  return {
    lines: levels.length,
    out: states.filter(s => s === 'out').length,
    low: states.filter(s => s === 'low').length,
    uncounted: states.filter(s => s === 'never_counted' || s === 'stale').length,
    toBuy: reorderList(levels).length,
  };
}

/** Worst first: out, then low, then whatever nobody has counted. */
const RANK: Record<StockState, number> = { out: 0, low: 1, never_counted: 2, stale: 3, ok: 4 };

export function byShortage<T extends Level>(levels: readonly T[], today: string): T[] {
  return [...levels].sort((a, b) =>
    RANK[stockStateOf(a, today)] - RANK[stockStateOf(b, today)] || shortBy(b) - shortBy(a));
}

/** The places a business keeps stock. The yard, plus whatever it has named. */
export const placesIn = (levels: readonly Level[]): string[] =>
  [...new Set(levels.map(l => l.place))].sort();

export function stockLine(s: StockStats): string {
  if (s.out > 0) return `${s.out} ${s.out === 1 ? 'line is' : 'lines are'} out — that is a job that cannot be done today.`;
  if (s.toBuy > 0) return `${s.toBuy} ${s.toBuy === 1 ? 'line' : 'lines'} to reorder.`;
  if (s.uncounted > 0) return `${s.uncounted} ${s.uncounted === 1 ? 'line has' : 'lines have'} not been counted recently. A count nobody has done is not stock.`;
  if (s.lines === 0) return 'No stock recorded. Add what the vans carry and the reorder list builds itself.';
  return 'Everything on hand.';
}
