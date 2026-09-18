import { describe, it, expect } from 'vitest';
import {
  layout, rootsOf, branch, isDescendant, canMove, canRemove, collapsedAway, teamSize,
  detachedBranches, stages, boardVerdict,
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

describe('canRemove', () => {
  /*
    The server refuses all of these by throwing, which on a server action means the error page. These
    are the same three rules said on the chart, so a leader gets a sentence instead of a fault — and
    a test each, because a polite refusal that silently stops refusing is how the error page comes
    back without anybody noticing.
  */
  it('REFUSES THE TOP OF THE CHART — everything else hangs off it', () => {
    const all = tree();
    const check = canRemove('gm', all, 'gm');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/top of the chart/i);
  });

  it('REFUSES A ROLE SOMEBODY IS IN, and says who', () => {
    const all = [role('gm', null, { level: 'gm' }), role('a', 'gm', { person: 'J. Barnes' })];
    const check = canRemove('a', all, 'gm');
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('J. Barnes');
  });

  it('REFUSES A ROLE WITH ANYBODY UNDER IT, and counts them', () => {
    const check = canRemove('a', tree(), 'gm');
    expect(check.ok).toBe(false);
    // Two directs, and the sentence has to agree with itself.
    expect(check.reason).toContain('2 roles report');
  });

  it('says it in the singular for one', () => {
    const all = [role('gm', null, { level: 'gm' }), role('a', 'gm'), role('a1', 'a')];
    expect(canRemove('a', all, 'gm').reason).toContain('1 role reports');
  });

  it('allows an empty leaf', () => {
    expect(canRemove('b', tree(), 'gm')).toEqual({ ok: true, reason: null });
  });

  it('and refuses a role that is not on this chart at all', () => {
    expect(canRemove('nowhere', tree(), 'gm').ok).toBe(false);
  });
});

describe('collapsedAway', () => {
  it('HIDES EVERYTHING BENEATH A FOLDED ROLE, never the role itself', () => {
    const hidden = collapsedAway(['a'], tree());
    expect([...hidden].sort()).toEqual(['a1', 'a2']);
    expect(hidden.has('a')).toBe(false);
  });

  it('hides a whole branch, not just the first layer', () => {
    const all = [...tree(), role('a1x', 'a1')];
    expect(collapsedAway(['a'], all).has('a1x')).toBe(true);
  });

  it('nothing folded hides nothing', () => {
    expect(collapsedAway([], tree()).size).toBe(0);
  });

  it('IS A READING AID ONLY — the roles are untouched', () => {
    /*
      The whole risk of collapsing is that it quietly changes a number. The page takes its counts
      from the full list and hands `layout` a filtered one, so this returns a set to hide rather
      than a new chart — and the chart it was given comes back unchanged.
    */
    const all = tree();
    const before = all.map(r => r.id);
    collapsedAway(['a', 'gm'], all);
    expect(all.map(r => r.id)).toEqual(before);
  });

  it('folding the root leaves the root drawn and everything else away', () => {
    const hidden = collapsedAway(['gm'], tree());
    expect(hidden.has('gm')).toBe(false);
    expect(hidden.size).toBe(4);
  });
});

describe('teamSize', () => {
  it('counts everybody underneath, at any depth', () => {
    expect(teamSize('gm', tree())).toBe(4);
    expect(teamSize('a', tree())).toBe(2);
  });

  it('is zero for a leaf', () => {
    expect(teamSize('b', tree())).toBe(0);
  });
});

describe('boardVerdict — what the chart tells the board', () => {
  const at = (safety: number | null, people: number | null, earnings: number | null, compliance: number | null) =>
    ({ safety, people, earnings, compliance });

  /*
    The case the prototype cannot reach, and the only case a brand-new customer ever sees.

    A design file always ships with numbers in it, so its verdict has three branches. A business on
    its first morning has four nulls, and the worst of nothing is not zero — answering "Red on the
    board" to a company that has not started would be both wrong and the most discouraging thing
    SPEC could say on day one.
  */
  it('SAYS NOTHING IS MARKED rather than calling an unstarted business red', () => {
    const v = boardVerdict(at(null, null, null, null));
    expect(v.title).toBe('Nothing marked yet');
    expect(v.title).not.toMatch(/red/i);
  });

  it('is green only when the WORST pillar is green', () => {
    expect(boardVerdict(at(0.95, 0.9, 0.85, 0.82)).title).toBe('All four green');
    // One pillar behind is the news, however good the other three are.
    expect(boardVerdict(at(1, 1, 1, 0.79)).title).toBe('Amber on the board');
  });

  it('is red at or under half, on the same line every other light in SPEC uses', () => {
    expect(boardVerdict(at(0.9, 0.9, 0.51, 0.9)).title).toBe('Amber on the board');
    expect(boardVerdict(at(0.9, 0.9, 0.5, 0.9)).title).toBe('Red on the board');
  });

  it('judges on the pillars that HAVE a score, not on the missing ones', () => {
    // Three green and one not yet marked is not a business in trouble.
    expect(boardVerdict(at(0.92, 0.9, null, 0.88)).title).toBe('All four green');
  });
});
