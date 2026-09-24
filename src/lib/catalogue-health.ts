/**
 * Keeping the parts list short enough to be usable.
 *
 * ── The problem nobody names ─────────────────────────────────────────────────────────────────────
 *
 * Kris: *"the catalogue for parts and materials must always be streamlined and the system must
 * alert the business if speeds slow due to excess items"*.
 *
 * A catalogue starts as the sixty things a business actually fits. Then somebody imports a
 * supplier's whole file and it is nine thousand, and every quote and every materials entry becomes
 * a search through nine thousand things to find the one of sixty. Nobody decides to do this and
 * nobody notices it has happened — the list just gets slower to use, quoting takes longer, and the
 * tech on site stops recording materials because finding them is a nuisance.
 *
 * So SPEC watches the shape of the list rather than its size alone. The number that matters is not
 * "how many items" — it is **how many are never used**.
 */

export interface Item {
  id: string;
  name: string;
  /** Last time this item went on a quote or a job. Null means never. */
  lastUsedAt: string | null;
  createdAt: string;
}

/** Long enough that a seasonal item is not called dead. Two quarters of not being touched. */
export const UNUSED_DAYS = 180;

/**
 * Below this, size is nobody's problem. A small business with everything it fits in one list is
 * working exactly as intended, and telling it to tidy up would be noise.
 */
export const WATCH_FROM = 300;

/** Past this share of the list going unused, finding anything is genuinely slower. */
export const BLOATED_AT = 0.6;

const daysBetween = (from: string, to: string) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(from.slice(0, 10) + 'T00:00:00Z')) / 86_400_000);

/**
 * An item nobody has used.
 *
 * Measured from when it was ADDED when it has never been used at all, so a file imported this
 * morning is not called dead the same day — a business needs time to actually use what it loaded.
 */
export function unused(i: Item, today: string): boolean {
  const since = i.lastUsedAt ?? i.createdAt;
  return daysBetween(since, today) > UNUSED_DAYS;
}

export interface CatalogueHealth {
  items: number;
  unused: number;
  /** The share of the list that is dead weight, 0–1. */
  deadShare: number;
  /** True when the list is big enough AND dead enough to be slowing people down. */
  slowing: boolean;
}

export function catalogueHealth(items: readonly Item[], today: string): CatalogueHealth {
  const dead = items.filter(i => unused(i, today)).length;
  const deadShare = items.length ? dead / items.length : 0;
  return {
    items: items.length,
    unused: dead,
    deadShare,
    /*
      BOTH conditions, deliberately. A big list that is all in use is a busy business, not a
      problem. A small list that is mostly unused is a business that has not started yet. It is the
      combination — large and mostly dead — that makes every search slower for everybody.
    */
    slowing: items.length >= WATCH_FROM && deadShare >= BLOATED_AT,
  };
}

/**
 * What to say, and only when it is worth saying.
 *
 * Returns null when there is nothing to report — so the screen shows nothing rather than a
 * permanent reassurance nobody reads. An alert that is always on the page is furniture.
 */
export function catalogueAlert(h: CatalogueHealth): string | null {
  if (!h.slowing) return null;
  const pct = Math.round(h.deadShare * 100);
  return `${h.items.toLocaleString('en-AU')} items, and ${pct}% have not been used in ${Math.round(UNUSED_DAYS / 30)} months. Every quote and every materials entry is a search through all of them. Retiring the unused ones does not delete anything — they come back the moment one is used again.`;
}

/**
 * What to retire, worst first.
 *
 * Never automatic. A business's catalogue is its own, and a system that quietly deleted parts would
 * be found out the first time somebody went looking for the one they fit twice a year. SPEC offers
 * the list; a person presses the button.
 */
export function toRetire(items: readonly Item[], today: string): Item[] {
  return items
    .filter(i => unused(i, today))
    .sort((a, b) => (a.lastUsedAt ?? a.createdAt).localeCompare(b.lastUsedAt ?? b.createdAt));
}

/**
 * Where a business's parts should come from instead of a nine-thousand-line import.
 *
 * The two that keep a list short are the two that reflect real work: what is on the ute, and what
 * the business actually buys from its own suppliers. Named as categories, never as vendors — a
 * business types its own supplier's name and SPEC names none.
 */
export const KEEP_IT_SHORT = [
  'What is on the ute — the van list is the fifty things that go out every day.',
  'What you actually buy — a supplier price file updates the prices of items you already use, rather than adding everything they sell.',
] as const;
