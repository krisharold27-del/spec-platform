/**
 * Buying materials, and checking the bill against what was ordered.
 *
 * Kris, 24 September: *"why would you stop at 22 finish them all"*. This is one of the three the
 * Coverage map admitted was not written at all — the Stock & buying tab carried a heading called
 * Purchase orders with no rows behind it and the words "not set up yet".
 *
 * ── The part that is worth building, and the part that is not ────────────────────────────────────
 *
 * A purchase order is a small thing to store and a large thing to get wrong. What a trade business
 * actually loses money on is not raising the order — it is the bill that arrives three weeks later
 * for more than the order said, gets paid because nobody had the order in front of them, and takes
 * the margin off a job that was quoted at the old price.
 *
 * So the substance here is `match`, not the record-keeping. Everything else exists to make that
 * comparison possible.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * Where an order has got to
 * ───────────────────────────────────────────────────────────────────────────── */

export type OrderState = 'draft' | 'sent' | 'received' | 'billed' | 'closed';

export const ORDER_STATES: { key: OrderState; label: string }[] = [
  { key: 'draft', label: 'Not sent yet' },
  { key: 'sent', label: 'With the supplier' },
  { key: 'received', label: 'Materials arrived' },
  { key: 'billed', label: 'Bill received' },
  { key: 'closed', label: 'Matched and closed' },
];

export const isOrderState = (v: string): v is OrderState =>
  ORDER_STATES.some(s => s.key === v);

export const orderStateLabel = (v: string): string =>
  ORDER_STATES.find(s => s.key === v)?.label ?? 'Not sent yet';

/* ─────────────────────────────────────────────────────────────────────────────
 * The bill against the order
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * How much a bill may differ from its order before somebody has to look.
 *
 * Not zero. Freight, a rounded pack size and a part-delivery all move a total by small amounts, and
 * a system that stops on every one of them is a system whose warnings get clicked through. One per
 * cent, or five dollars, whichever is larger — the second half matters because one per cent of a
 * sixty-dollar order is sixty cents, and nobody should be held up over that.
 */
export const TOLERANCE_PCT = 0.01;
export const TOLERANCE_CENTS = 500;

export type MatchState = 'ok' | 'over' | 'under' | 'no_bill';

export interface Match {
  state: MatchState;
  /** Bill minus order, in cents. Negative when the bill came in under. */
  differenceCents: number;
  /** True when somebody has to look before this is paid. */
  holds: boolean;
  /** What to say, in the words a person would use. */
  says: string;
}

const money = (cents: number): string =>
  `$${(Math.abs(cents) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Compare a supplier's bill to the order it answers.
 *
 * ── Over holds; under does not ───────────────────────────────────────────────────────────────────
 *
 * A bill that is HIGHER than the order is the one that costs money, so it holds payment and says by
 * how much. A bill that is LOWER is reported and does not hold anything: it is usually a
 * part-delivery with the rest to follow, and stopping the payment of a smaller bill helps nobody.
 *
 * That asymmetry is deliberate and is the whole reason this returns `holds` rather than a boolean
 * "matched". A check that treats both directions the same either lets overcharges through or stops
 * every part-delivery.
 */
export function match(orderCents: number, billCents: number | null): Match {
  if (billCents === null) {
    return { state: 'no_bill', differenceCents: 0, holds: false, says: 'No bill yet.' };
  }

  const diff = billCents - orderCents;
  const allowed = Math.max(TOLERANCE_CENTS, Math.round(orderCents * TOLERANCE_PCT));

  if (Math.abs(diff) <= allowed) {
    return { state: 'ok', differenceCents: diff, holds: false, says: 'Bill matches the order.' };
  }
  if (diff > 0) {
    return {
      state: 'over',
      differenceCents: diff,
      holds: true,
      says: `Bill is ${money(diff)} more than the order. Held until somebody checks — a price rise on a job quoted at the old price comes straight off the margin.`,
    };
  }
  return {
    state: 'under',
    differenceCents: diff,
    holds: false,
    says: `Bill is ${money(diff)} less than the order. Usually a part-delivery with the rest to follow.`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * What is waiting on somebody
 * ───────────────────────────────────────────────────────────────────────────── */

export interface OrderRow {
  id: string;
  ref: string;
  supplier: string;
  state: string;
  totalCents: number;
  billTotalCents: number | null;
  expectedAt: string | null;
  jobRef?: string | null;
}

/** An order whose materials were due and have not arrived. */
export const isLate = (o: Pick<OrderRow, 'state' | 'expectedAt'>, today: string): boolean =>
  Boolean(o.expectedAt && o.expectedAt < today && (o.state === 'sent' || o.state === 'draft'));

export interface PurchasingStats {
  open: number;
  late: number;
  held: number;
  heldCents: number;
}

export function purchasingStats(orders: readonly OrderRow[], today: string): PurchasingStats {
  const held = orders.map(o => match(o.totalCents, o.billTotalCents)).filter(m => m.holds);
  return {
    open: orders.filter(o => o.state !== 'closed').length,
    late: orders.filter(o => isLate(o, today)).length,
    held: held.length,
    heldCents: held.reduce((t, m) => t + m.differenceCents, 0),
  };
}

/**
 * Worst first: held bills, then late deliveries, then everything else.
 *
 * A held bill is money about to leave wrongly. A late delivery is a crew standing around on
 * Tuesday. Both beat an order that is simply open.
 */
export function byAttention<T extends OrderRow>(orders: readonly T[], today: string): T[] {
  const rank = (o: T) =>
    match(o.totalCents, o.billTotalCents).holds ? 0 : isLate(o, today) ? 1 : 2;
  return [...orders].sort((a, b) => rank(a) - rank(b) || a.ref.localeCompare(b.ref));
}

/**
 * The next order reference. Shares the shape of a job reference so a person reading a pile of
 * paperwork can tell at a glance which is which.
 */
export function nextOrderRef(existing: readonly string[], start = 1): string {
  const used = existing
    .map(r => Number(/^PO-(\d+)$/.exec(r)?.[1]))
    .filter(n => Number.isFinite(n)) as number[];
  const next = used.length ? Math.max(...used) + 1 : start;
  return `PO-${String(next).padStart(4, '0')}`;
}

/** The headline, which never reads as fine when money is being held. */
export function purchasingLine(s: PurchasingStats): string {
  if (s.held > 0) {
    return `${s.held} ${s.held === 1 ? 'bill is' : 'bills are'} held — ${money(s.heldCents)} more than was ordered.`;
  }
  if (s.late > 0) return `${s.late} ${s.late === 1 ? 'delivery is' : 'deliveries are'} late.`;
  if (s.open > 0) return `${s.open} ${s.open === 1 ? 'order is' : 'orders are'} open. Nothing held, nothing late.`;
  return 'No orders open.';
}
