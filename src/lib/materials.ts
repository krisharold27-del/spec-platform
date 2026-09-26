/**
 * Materials for a job — built from what was quoted, each line at the best price the business has.
 *
 * Design 20 (`SPEC Jobs.dc.html`, Catalogue): the list a job needs, put together from its
 * pre-builds, each line from whichever supplier has it cheapest, and one press to order it all. The
 * design also has live supplier stock "near the site"; SPEC has no supplier feed, so this uses the
 * prices the business's own catalogue holds and says so rather than claiming a warehouse it cannot see.
 *
 * Pure. Quantities come from the quote lines: a kit line brings its components times its quantity,
 * an item line brings itself. The same item bought from two suppliers is two catalogue rows with
 * the same name, which is how a business actually keeps them.
 */

export interface MatItem { id: string; name: string; supplier: string; unit: string; costCents: number }
export interface MatKit { id: string; components: { itemId: string; qty: number }[] }
export interface MatLine { kind: string; refId: string; qty: number }

export interface Material {
  name: string;
  unit: string;
  qty: number;
  /** The cheapest supplier the catalogue has for it. */
  supplier: string;
  itemId: string;
  unitCents: number;
  totalCents: number;
  /** How much more the dearest supplier would have cost, when there is more than one. */
  savedCents: number;
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function materialsFor(lines: readonly MatLine[], kits: readonly MatKit[], items: readonly MatItem[]): Material[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const need = new Map<string, number>();
  const add = (itemId: string, qty: number) => {
    const it = byId.get(itemId);
    if (!it || !(qty > 0)) return;
    need.set(key(it.name), (need.get(key(it.name)) ?? 0) + qty);
  };
  for (const l of lines) {
    if (l.kind === 'item') add(l.refId, l.qty);
    if (l.kind === 'kit') {
      const kit = kits.find(k => k.id === l.refId);
      for (const c of kit?.components ?? []) add(c.itemId, c.qty * l.qty);
    }
  }
  const out: Material[] = [];
  for (const [k, qty] of need) {
    const offers = items.filter(i => key(i.name) === k && i.costCents > 0).sort((a, b) => a.costCents - b.costCents);
    const best = offers[0];
    if (!best) continue;
    const q = Math.round(qty * 100) / 100;
    const dearest = offers[offers.length - 1];
    out.push({
      name: best.name, unit: best.unit, qty: q, supplier: best.supplier || 'Supplier not named',
      itemId: best.id, unitCents: best.costCents, totalCents: Math.round(best.costCents * q),
      savedCents: offers.length > 1 ? Math.round((dearest.costCents - best.costCents) * q) : 0,
    });
  }
  return out.sort((a, b) => a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name));
}

/** One order per supplier: what goes on it and what it comes to. */
export function ordersFrom(materials: readonly Material[]): { supplier: string; what: string; totalCents: number }[] {
  const by = new Map<string, Material[]>();
  for (const m of materials) by.set(m.supplier, [...(by.get(m.supplier) ?? []), m]);
  return [...by].map(([supplier, ms]) => ({
    supplier,
    what: ms.map(m => `${m.qty} × ${m.name}`).join(', ').slice(0, 300),
    totalCents: ms.reduce((a, m) => a + m.totalCents, 0),
  }));
}
