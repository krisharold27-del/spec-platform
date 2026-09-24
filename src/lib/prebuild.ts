/**
 * Supplier price files, and the pre-build job pack.
 *
 * Two of the last three capabilities, and the same principle under both: SPEC does the part that is
 * arithmetic and leaves the part that is judgement to the person.
 */

/* ─────────────────────────────────────────────────────────────────────────────
 * A supplier price file
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * A line from a supplier's price file.
 *
 * The PARSING lives in lib/jobs — `parsePriceFile` there already reads comma and tab separated
 * files, skips the header by itself and counts what it could not read. This file does the part
 * that was missing: working out what the new prices MEAN against the ones already held.
 */
export interface PriceLine { name: string; costCents: number }

export type PriceChange = 'rose' | 'fell' | 'same' | 'new';

export interface Repriced {
  name: string;
  itemId: string | null;
  wasCents: number | null;
  nowCents: number;
  change: PriceChange;
  /** How much it moved, as a fraction of what it was. Null for something SPEC has never seen. */
  by: number | null;
}

/** A rise worth stopping on. Below this it is noise; above it, every open quote is now wrong. */
export const RISE_WORTH_SAYING = 0.05;

/**
 * Match a price file against the catalogue.
 *
 * Matched on name, case-insensitively and ignoring extra spaces — supplier files are not tidy. An
 * item SPEC has never seen is reported as new rather than silently added: a price file is a
 * supplier's whole range, and importing all of it would bury the twelve items a business uses.
 */
export function reprice(
  file: readonly PriceLine[],
  items: readonly { id: string; name: string; costCents: number }[],
): Repriced[] {
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const byName = new Map(items.map(i => [key(i.name), i]));

  return file.map(line => {
    const item = byName.get(key(line.name));
    if (!item) {
      return { name: line.name, itemId: null, wasCents: null, nowCents: line.costCents, change: 'new' as const, by: null };
    }
    const was = item.costCents;
    const by = was > 0 ? (line.costCents - was) / was : null;
    const change: PriceChange = line.costCents === was ? 'same' : line.costCents > was ? 'rose' : 'fell';
    return { name: item.name, itemId: item.id, wasCents: was, nowCents: line.costCents, change, by };
  });
}

/** The rises big enough that somebody has to look at the quotes already out. */
export const bigRises = (rows: readonly Repriced[]): Repriced[] =>
  rows.filter(r => r.change === 'rose' && (r.by ?? 0) >= RISE_WORTH_SAYING)
    .sort((a, b) => (b.by ?? 0) - (a.by ?? 0));

export function repriceLine(rows: readonly Repriced[]): string {
  const matched = rows.filter(r => r.itemId);
  const rises = bigRises(rows);
  if (rows.length === 0) return 'Nothing readable in that. Two columns: the item, then its price.';
  if (rises.length > 0) {
    return `${matched.length} matched. ${rises.length} went up by more than ${Math.round(RISE_WORTH_SAYING * 100)}% — every quote already out with those on it is now wrong.`;
  }
  return `${matched.length} of ${rows.length} matched the catalogue. No big rises.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The pre-build job pack
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * What turns a kit into a pre-build.
 *
 * A kit prices the work. A pre-build also tells the crew how to do it — which SWMS applies, what to
 * check before leaving, and what to load on the van. The van list is not stored: it IS the kit's
 * components, and storing it separately would mean two lists that disagree the first time somebody
 * edits the kit.
 */
export function parseChecklist(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  } catch { return []; }
}

/** One line per check, however it was typed — newlines, or a numbered list. */
export const splitChecklist = (text: string): string[] =>
  text.split(/\r?\n/).map(l => l.replace(/^\s*[-*\d.)]+\s*/, '').trim()).filter(Boolean).slice(0, 20);

export interface VanLine { name: string; qty: number }

/** What to load, straight from the kit's own components. One list, never two. */
export function vanList(
  components: readonly { itemId: string; qty: number }[],
  items: readonly { id: string; name: string }[],
): VanLine[] {
  return components
    .map(c => ({ name: items.find(i => i.id === c.itemId)?.name ?? 'An item', qty: c.qty }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PackState { ready: boolean; missing: string[] }

/**
 * Is this a pre-build, or still just a kit?
 *
 * Said rather than assumed, because a "pre-build" with no SWMS and no checklist is a kit somebody
 * renamed, and the crew finds out on site.
 */
export function packState(kit: { swms: string | null; checklist: string | null; components: unknown[] }): PackState {
  const missing: string[] = [];
  if (!kit.swms?.trim()) missing.push('which SWMS applies');
  if (parseChecklist(kit.checklist as string).length === 0) missing.push('what to check before leaving');
  if (kit.components.length === 0) missing.push('what to load on the van');
  return { ready: missing.length === 0, missing };
}
