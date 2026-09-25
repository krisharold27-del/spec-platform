/**
 * A builder's agreed rates, held against the customer they belong to.
 *
 * ── Where the margin goes ────────────────────────────────────────────────────────────────────────
 *
 * From the workflow map: a builder gives you an agreed schedule of rates and then sends work
 * against it for two years. Today those rates live in a spreadsheet, and every job under the
 * agreement gets them typed in again — which is exactly where a business loses margin without
 * noticing, because a rate typed from memory is a rate that drifts, and it only ever drifts one way.
 *
 * Worse, nobody finds out. A quote priced off the wrong rate is not rejected by the builder; it is
 * accepted, and the difference comes out of the job.
 *
 * ── What SPEC does and does not decide ───────────────────────────────────────────────────────────
 *
 * It holds what was agreed, applies it, and says where a price came from. It does not negotiate,
 * does not suggest a rate, and never quietly substitutes one — a line priced off a rate card says
 * so, because a price somebody cannot trace is a price somebody will retype.
 */

export interface RateLine {
  id: string;
  /** The builder's own wording, because that is what the schedule says and what gets argued over. */
  what: string;
  unit: string;
  cents: number;
}

export interface RateCard {
  id: string;
  /** Which customer this belongs to. A card with no customer is a spreadsheet again. */
  customerKey: string;
  customerName: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  lines: RateLine[];
}

/** Is this card the one in force on a given day? */
export function inForce(card: RateCard, on: string): boolean {
  if (card.startsAt && on < card.startsAt) return false;
  if (card.endsAt && on > card.endsAt) return false;
  return true;
}

/**
 * The card that applies to this customer today.
 *
 * Only ever one. Two cards in force for one customer is an argument waiting to happen, so the most
 * recently started wins and `overlapping` names the pair so somebody can end one.
 */
export function cardFor(
  cards: readonly RateCard[],
  customerKey: string,
  on: string,
): RateCard | null {
  const live = cards
    .filter(c => c.customerKey === customerKey && inForce(c, on))
    .sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));
  return live[0] ?? null;
}

/** Cards that are both in force for the same customer. A fault to fix, not a preference. */
export function overlapping(cards: readonly RateCard[], on: string): RateCard[][] {
  const by = new Map<string, RateCard[]>();
  for (const c of cards) {
    if (!inForce(c, on)) continue;
    by.set(c.customerKey, [...(by.get(c.customerKey) ?? []), c]);
  }
  return [...by.values()].filter(cs => cs.length > 1);
}

export interface Priced {
  line: RateLine;
  cents: number;
  /** Where this price came from, always. A price nobody can trace is a price somebody retypes. */
  from: string;
}

/**
 * Price a quantity off the card, saying where the rate came from.
 *
 * Returns null rather than guessing when the card has nothing matching. A near-enough match is how
 * a business bills a builder for something the schedule does not cover and loses the argument.
 */
export function priceFrom(card: RateCard, what: string, quantity: number): Priced | null {
  const want = what.trim().toLowerCase();
  const line = card.lines.find(l => l.what.trim().toLowerCase() === want);
  if (!line) return null;
  return {
    line,
    cents: Math.round(line.cents * quantity),
    from: `${card.name} — ${card.customerName}`,
  };
}

/** What a card is worth knowing at a glance: how many rates, and whether it is running out. */
export function cardLine(card: RateCard, on: string): string {
  const count = `${card.lines.length} ${card.lines.length === 1 ? 'rate' : 'rates'}`;
  if (!card.endsAt) return `${count}, no end date.`;
  const daysLeft = Math.ceil((Date.parse(card.endsAt) - Date.parse(on)) / 86_400_000);
  if (daysLeft < 0) return `${count}. Ended ${card.endsAt} — work under it is being priced off nothing.`;
  if (daysLeft <= 60) return `${count}. Ends ${card.endsAt}, in ${daysLeft} days — worth agreeing the next one before it lapses.`;
  return `${count}, to ${card.endsAt}.`;
}
