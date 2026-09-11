import { describe, it, expect } from 'vitest';
import {
  layout, rootsOf, branch, isDescendant, canMove, detachedBranches, stages,
  parseRoles, resolveImport, parseCsv, SLOT, ROW, cardWidth,
  type ChartRole,
} from '../src/lib/orgchart';

const role = (id: string, parentId: string | null = null, over: Partial<ChartRole> = {}): ChartRole => ({
  id, title: id, person: null, pencilled: false, parentId,
  level: 'manager', stream: 'operations', pillars: null, scored: true, hasKpis: true, ...over,
});

/** gm → (a → (a1, a2)), b */
const tree = () => [
  role('gm', null, { level: 'gm' }),
  role('a', 'gm'),
  role('b', 'gm'),
  role('a1', 'a'),
  role('a2', 'a'),
];

describe('layout', () => {
  it('puts each depth on its own row', () => {
    const all = tree();
    const { cards } = layout(rootsOf(all), all);
    const at = (id: string) => cards.find(c => c.role.id === id)!;
    expect(at('gm').y).toBe(0);
    expect(at('a').y).toBe(ROW);
    expect(at('a1').y).toBe(ROW * 2);
  });

  it('gives every leaf its own slot and centres a parent over its children', () => {
    const all = tree();
    const { cards } = layout(rootsOf(all), all);
    const at = (id: string) => cards.find(c => c.role.id === id)!;
    // Leaves come out in walk order: a1, a2, then b.
    expect(at('a1').centre).toBe(SLOT / 2);
    expect(at('a2').centre).toBe(SLOT + SLOT / 2);
    expect(at('a').centre).toBe((at('a1').centre + at('a2').centre) / 2);
    expect(at('gm').centre).toBe((at('a').centre + at('b').centre) / 2);
  });

  it('narrows the card with depth, and hangs it on its own centre', () => {
    const all = tree();
    const { cards } = layout(rootsOf(all), all);
    const at = (id: string) => cards.find(c => c.role.id === id)!;
    expect([at('gm').w, at('a').w, at('a1').w]).toEqual([cardWidth(0), cardWidth(1), cardWidth(2)]);
    expect(at('gm').x).toBe(at('gm').centre - at('gm').w / 2);
  });

  // Three rectangles, never nested markup: a stub, a rail, and a riser to each child.
  it('draws a stub, a rail and one riser per child', () => {
    const all = tree();
    const { lines } = layout(rootsOf(all), all);
    const kinds = lines.map(l => l.kind);
    // gm has two children, a has two children: two stubs, two rails, four risers.
    expect(kinds.filter(k => k === 'stub')).toHaveLength(2);
    expect(kinds.filter(k => k === 'rail')).toHaveLength(2);
    expect(kinds.filter(k => k === 'riser')).toHaveLength(4);
  });

  it('draws no rail for a single child — there is nothing to span', () => {
    const all = [role('gm'), role('only', 'gm')];
    const { lines } = layout(rootsOf(all), all);
    expect(lines.filter(l => l.kind === 'rail')).toHaveLength(0);
    expect(lines.filter(l => l.kind === 'stub')).toHaveLength(1);
    expect(lines.filter(l => l.kind === 'riser')).toHaveLength(1);
  });

  it('sizes the canvas to the tree, with a floor for a small one', () => {
    const one = layout(rootsOf([role('gm')]), [role('gm')]);
    expect(one.width).toBe(680);
    const all = tree();
    expect(layout(rootsOf(all), all).height).toBe(2 * ROW + 130);
  });

  // A chart dragged into a cycle must never recurse for ever, and must never render blank either:
  // a business opening this page has to see its own roles whatever the reporting lines say.
  it('survives a reporting cycle and still draws every role', () => {
    const all = [role('x', 'y'), role('y', 'x')];
    expect(() => layout(rootsOf(all), all)).not.toThrow();
    const { cards } = layout(rootsOf(all), all);
    expect(cards.map(c => c.role.id).sort()).toEqual(['x', 'y']);
  });

  it('draws a branch hanging off a detached role rather than dropping it', () => {
    const all = [role('gm'), role('off', 'gone'), role('under', 'off')];
    const { cards } = layout(rootsOf(all), all);
    expect(cards.map(c => c.role.id).sort()).toEqual(['gm', 'off', 'under']);
  });

  it('places every role exactly once', () => {
    const all = tree();
    const ids = layout(rootsOf(all), all).cards.map(c => c.role.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(all.length);
  });

  it('draws nothing for an empty chart', () => {
    expect(layout([], []).cards).toEqual([]);
  });
});

describe('rootsOf', () => {
  it('finds the role with no parent', () => {
    expect(rootsOf(tree()).map(r => r.id)).toEqual(['gm']);
  });

  it('treats a role whose parent is missing as a root of its own', () => {
    const all = [role('orphan', 'gone'), role('gm')];
    expect(rootsOf(all).map(r => r.id).sort()).toEqual(['gm', 'orphan']);
  });
});

describe('branch and isDescendant', () => {
  it('collects a role and everything under it', () => {
    expect(branch('a', tree()).map(r => r.id).sort()).toEqual(['a', 'a1', 'a2']);
  });

  it('knows what sits underneath what', () => {
    const all = tree();
    expect(isDescendant('a1', 'gm', all)).toBe(true);
    expect(isDescendant('gm', 'a1', all)).toBe(false);
    expect(isDescendant('a', 'a', all)).toBe(false);
  });
});

describe('canMove', () => {
  it('refuses a role onto itself', () => {
    expect(canMove('a', 'a', tree()).ok).toBe(false);
  });

  // Dropping a parent onto its own child would cut the chart off from its root.
  it('refuses a move onto its own descendant, and says why', () => {
    const c = canMove('a', 'a1', tree());
    expect(c.ok).toBe(false);
    expect(c.reason).toContain('cut the chart in two');
  });

  it('refuses a move that changes nothing', () => {
    expect(canMove('a', 'gm', tree()).reason).toBe('a already reports to gm.');
  });

  it('allows a sideways move', () => {
    expect(canMove('a1', 'b', tree())).toEqual({ ok: true, reason: null });
  });

  it('refuses a role that is not on the chart', () => {
    expect(canMove('ghost', 'gm', tree()).ok).toBe(false);
  });
});

describe('detachedBranches', () => {
  it('is empty when everything hangs off the root', () => {
    expect(detachedBranches(tree(), 'gm')).toEqual([]);
  });

  // Breaking one link can take a third of the business out of the roll-up. Say how many.
  it('chips the top of a detached branch and counts everybody travelling with it', () => {
    const all = tree().map(r => (r.id === 'a' ? { ...r, parentId: null } : r));
    const off = detachedBranches(all, 'gm');
    expect(off).toHaveLength(1);
    expect(off[0].role.id).toBe('a');
    expect(off[0].below).toBe(2);
    expect(off[0].label).toBe('a  +2 below');
  });

  it('labels a lone detached role without a count', () => {
    const all = [...tree(), role('lonely', null)];
    const off = detachedBranches(all, 'gm');
    expect(off.map(o => o.label)).toEqual(['lonely']);
  });

  it('says nothing when there is no root to measure against', () => {
    expect(detachedBranches(tree(), null)).toEqual([]);
  });
});

describe('stages', () => {
  const green = { safety: 1, people: 0.95, earnings: 0.9, compliance: 1 };

  it('meets all three when the chart is whole, measured and at the standard', () => {
    const s = stages(tree(), [], green);
    expect(s.map(x => x.met)).toEqual([true, true, true]);
    expect(s[2].detail).toContain('90%');
  });

  // The reason has to match the verdict: "every scored role has its numbers" beside a failed Flow
  // is true and useless.
  it('fails Link and Flow together when a branch is off the chart, and says why', () => {
    const all = tree().map(r => (r.id === 'a' ? { ...r, parentId: null } : r));
    const off = detachedBranches(all, 'gm');
    const s = stages(all, off, green);
    expect(s[0].met).toBe(false);
    expect(s[0].detail).toBe('3 roles are off the chart and out of every average.');
    expect(s[1].met).toBe(false);
    expect(s[1].detail).toBe('Every role on the chart has its numbers, but Flow waits on Link.');
  });

  it('fails Flow while a scored role has no KPIs', () => {
    const all = tree().map(r => (r.id === 'b' ? { ...r, hasKpis: false } : r));
    const s = stages(all, [], green);
    expect(s[1].met).toBe(false);
    expect(s[1].detail).toBe('1 scored role has no KPIs set.');
  });

  it('ignores checklist roles when counting KPIs', () => {
    const all = tree().map(r => (r.id === 'b' ? { ...r, hasKpis: false, scored: false } : r));
    expect(stages(all, [], green)[1].met).toBe(true);
  });

  // Not every pillar scored is a different thing from not every pillar at the standard.
  it('separates an unscored pillar from one that is behind', () => {
    expect(stages(tree(), [], { ...green, earnings: null })[2].detail).toBe('Not every pillar has a score yet.');
    expect(stages(tree(), [], { ...green, earnings: 0.5 })[2].detail).toBe('Not every pillar is at the standard.');
  });

  it('meets nothing for an empty chart', () => {
    expect(stages([], [], {}).map(s => s.met)).toEqual([false, false, false]);
  });
});

describe('parseRoles', () => {
  it('reads role, person and manager off one line', () => {
    expect(parseRoles('Site Supervisor, T. Alderson, Operations Manager')).toEqual([
      { title: 'Site Supervisor', person: 'T. Alderson', reportsTo: 'Operations Manager' },
    ]);
  });

  it('accepts whatever separator people pasted', () => {
    const rows = parseRoles('A|B|C\nD;E;F\nG\tH\tI');
    expect(rows.map(r => r.person)).toEqual(['B', 'E', 'H']);
  });

  it('treats a title on its own as a vacant role', () => {
    expect(parseRoles('Yard Lead')).toEqual([{ title: 'Yard Lead', person: null, reportsTo: null }]);
  });

  it('skips blank lines and rows with no title', () => {
    expect(parseRoles('\n\n  \n, somebody, somewhere\nReal Role')).toEqual([
      { title: 'Real Role', person: null, reportsTo: null },
    ]);
  });
});

describe('resolveImport', () => {
  // A manager nobody can find is not worth refusing the whole import over.
  it('links what it can and names what it could not', () => {
    const { rows, unmatched } = resolveImport(parseRoles(
      'General Manager\nOperations Manager, J. Barnes, General Manager\nYard Lead, , Somebody Else',
    ));
    expect(rows[1].parentTitle).toBe('General Manager');
    expect(rows[2].parentTitle).toBeNull();
    expect(unmatched).toEqual(['Yard Lead']);
  });

  it('matches a manager regardless of case', () => {
    const { unmatched } = resolveImport(parseRoles('General Manager\nOps, X, general manager'));
    expect(unmatched).toEqual([]);
  });
});

describe('parseCsv', () => {
  it('drops a header row when it looks like one', () => {
    const rows = parseCsv('Role,Person,Reports to\nGM,A. Morgan,\nOps,J. Barnes,GM');
    expect(rows.map(r => r.title)).toEqual(['GM', 'Ops']);
  });

  it('keeps the first line when it is data rather than a header', () => {
    const rows = parseCsv('GM,A. Morgan,\nOps,J. Barnes,GM');
    expect(rows).toHaveLength(2);
  });

  it('reads an empty file as nothing', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
