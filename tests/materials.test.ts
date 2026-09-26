import { describe, it, expect } from 'vitest';
import { materialsFor, ordersFrom } from '../src/lib/materials';

const items = [
  { id: 'a1', name: 'Twin & earth 2.5mm', supplier: 'Alpha', unit: 'm', costCents: 150 },
  { id: 'b1', name: 'twin & earth 2.5mm', supplier: 'Bravo', unit: 'm', costCents: 120 },
  { id: 'a2', name: 'RCBO 20A', supplier: 'Alpha', unit: 'each', costCents: 4000 },
];
const kits = [{ id: 'k1', components: [{ itemId: 'a1', qty: 20 }, { itemId: 'a2', qty: 1 }] }];

describe('materials for a job', () => {
  it('brings a kit\'s parts times its quantity, and each at the cheapest supplier the business has', () => {
    const m = materialsFor([{ kind: 'kit', refId: 'k1', qty: 2 }, { kind: 'labour', refId: 'x', qty: 3 }], kits, items);
    const cable = m.find(x => /twin/i.test(x.name))!;
    expect(cable).toMatchObject({ qty: 40, supplier: 'Bravo', unitCents: 120, totalCents: 4800, savedCents: 1200 });
    expect(m.find(x => x.name === 'RCBO 20A')).toMatchObject({ qty: 2, supplier: 'Alpha', savedCents: 0 });
  });

  it('adds an item line to the same item from a kit rather than listing it twice', () => {
    const m = materialsFor([{ kind: 'kit', refId: 'k1', qty: 1 }, { kind: 'item', refId: 'a1', qty: 5 }], kits, items);
    expect(m.filter(x => /twin/i.test(x.name))).toHaveLength(1);
    expect(m.find(x => /twin/i.test(x.name))!.qty).toBe(25);
  });

  it('makes one order per supplier', () => {
    const o = ordersFrom(materialsFor([{ kind: 'kit', refId: 'k1', qty: 1 }], kits, items));
    expect(o.map(x => x.supplier).sort()).toEqual(['Alpha', 'Bravo']);
    expect(o.find(x => x.supplier === 'Bravo')!.totalCents).toBe(2400);
  });
});
