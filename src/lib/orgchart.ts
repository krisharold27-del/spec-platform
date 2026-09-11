/**
 * The interactive org chart — pure functions, no I/O and no DOM.
 *
 * **Layout is computed, not nested markup.** One recursive walk assigns every role a centre x and a
 * depth row; cards are then absolutely positioned on a canvas sized to the tree, and the connectors
 * are three kinds of rectangle: a stub under a parent, a rail spanning its children, and a riser
 * down to each child. Nested flex columns were tried and produced unconnected lines and a recursion
 * bug — do not go back to them.
 *
 * **Detached branches are never silently dropped.** A role whose link is broken keeps everybody
 * under it; the whole branch leaves the chart together, is counted, and can be dragged back. It is
 * excluded from the roll-up while it is off, and the page says how many roles that is.
 */

export interface ChartRole {
  id: string;
  title: string;
  person: string | null;
  /** True when somebody is pencilled in but not invited — a name, not an account. */
  pencilled: boolean;
  parentId: string | null;
  level: string;
  stream: string;
  /** Null for a checklist role or one with nothing marked: no dots, no score. */
  pillars: { safety: number | null; people: number | null; earnings: number | null; compliance: number | null } | null;
  /** Whether this role carries an individual KPI scorecard at all. */
  scored: boolean;
  /** Whether it has its KPIs set — what the Flow stage counts. */
  hasKpis: boolean;
}

export const SLOT = 200;
export const ROW = 168;
const STUB = 28;

export const cardWidth = (depth: number) => (depth === 0 ? 226 : depth === 1 ? 186 : 158);
export const cardHeight = (depth: number) => (depth === 0 ? 108 : 100);

export interface PlacedCard {
  role: ChartRole;
  depth: number;
  /** Centre x of the card, in canvas pixels. */
  centre: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Connector {
  kind: 'stub' | 'rail' | 'riser';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  cards: PlacedCard[];
  lines: Connector[];
  width: number;
  height: number;
}

/**
 * Place the tree.
 *
 * A leaf takes the next free slot; a parent centres itself over its first and last child. The
 * `seen` set is load-bearing: a chart that has been dragged into a cycle would otherwise recurse
 * until the stack gives out, and a bad reporting line must never be able to take the page down.
 */
export function layout(roots: ChartRole[], all: ChartRole[]): Layout {
  const kidsOf = (id: string) => all.filter(r => r.parentId === id);
  const cards: PlacedCard[] = [];
  const lines: Connector[] = [];
  const seen = new Set<string>();
  let slot = 0;

  const walk = (node: ChartRole, depth: number): number => {
    if (seen.has(node.id)) return slot * SLOT + SLOT / 2;
    seen.add(node.id);

    const kids = kidsOf(node.id).filter(k => !seen.has(k.id));
    let centre: number;
    let childCentres: number[] = [];
    if (!kids.length) {
      centre = slot * SLOT + SLOT / 2;
      slot += 1;
    } else {
      childCentres = kids.map(k => walk(k, depth + 1));
      centre = (childCentres[0] + childCentres[childCentres.length - 1]) / 2;
    }

    const y = depth * ROW;
    const w = cardWidth(depth);
    const h = cardHeight(depth);
    cards.push({ role: node, depth, centre, x: centre - w / 2, y, w, h });

    if (childCentres.length) {
      const bottom = y + h;
      const railY = bottom + STUB;
      const left = Math.min(...childCentres);
      const right = Math.max(...childCentres);
      lines.push({ kind: 'stub', x: centre - 1, y: bottom, w: 2, h: STUB });
      if (childCentres.length > 1) {
        lines.push({ kind: 'rail', x: left, y: railY, w: right - left, h: 2 });
      }
      for (const cx of childCentres) {
        lines.push({ kind: 'riser', x: cx - 1, y: railY, w: 2, h: y + ROW - railY });
      }
    }
    return centre;
  };

  for (const root of roots) walk(root, 0);

  // Anything the walk never reached — a cycle, or a branch hanging off a role that is itself
  // detached — is placed as a root of its own. A chart must never render blank because one
  // reporting line is wrong: a business opening this page has to see its own roles, whatever the
  // data says about how they connect.
  for (const stray of all) if (!seen.has(stray.id)) walk(stray, 0);

  const maxDepth = cards.reduce((m, c) => Math.max(m, c.depth), 0);
  return {
    cards,
    lines,
    width: Math.max(slot * SLOT, 680),
    height: maxDepth * ROW + 130,
  };
}

/** The roles at the top: no parent, or a parent that is not in the set. */
export function rootsOf(all: ChartRole[]): ChartRole[] {
  const ids = new Set(all.map(r => r.id));
  return all.filter(r => !r.parentId || !ids.has(r.parentId));
}

/** Everything under a role, itself included. Cycle-safe, for the same reason `layout` is. */
export function branch(rootId: string, all: ChartRole[]): ChartRole[] {
  const out: ChartRole[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const role = all.find(r => r.id === id);
    if (role) out.push(role);
    for (const r of all) if (r.parentId === id) queue.push(r.id);
  }
  return out;
}

export const isDescendant = (candidateId: string, ofId: string, all: ChartRole[]): boolean =>
  candidateId !== ofId && branch(ofId, all).some(r => r.id === candidateId);

export interface MoveCheck {
  ok: boolean;
  reason: string | null;
}

/**
 * May this role be dragged onto that one?
 *
 * Three refusals, each for a different reason. Onto itself is meaningless. Onto its own descendant
 * would detach the chart from its root and orphan everything in between. And the top of the chart
 * has nowhere above it to go — a business reports to its board, not to one of its own managers.
 */
export function canMove(roleId: string, ontoId: string, all: ChartRole[]): MoveCheck {
  if (roleId === ontoId) return { ok: false, reason: 'A role cannot report to itself.' };
  const role = all.find(r => r.id === roleId);
  const onto = all.find(r => r.id === ontoId);
  if (!role || !onto) return { ok: false, reason: 'That role is not on this chart.' };
  if (isDescendant(ontoId, roleId, all)) {
    return { ok: false, reason: `${onto.title} already reports up through ${role.title}. Moving it there would cut the chart in two.` };
  }
  if (role.parentId === ontoId) return { ok: false, reason: `${role.title} already reports to ${onto.title}.` };
  return { ok: true, reason: null };
}

export interface Detached {
  /** The top of the detached branch — the chip shown in the tray. */
  role: ChartRole;
  /** How many roles come with it. */
  below: number;
  label: string;
}

/**
 * Branches that are off the chart.
 *
 * `chartRootId` is the role the business actually hangs from. Anything not reachable from it is
 * detached — and it takes everybody underneath with it, which is the honest thing to show: breaking
 * one link can remove a third of the business from the roll-up.
 */
export function detachedBranches(all: ChartRole[], chartRootId: string | null): Detached[] {
  if (!chartRootId) return [];
  const attached = new Set(branch(chartRootId, all).map(r => r.id));
  const off = all.filter(r => !attached.has(r.id));
  const offIds = new Set(off.map(r => r.id));
  // Only the top of each detached branch gets a chip; the rest travel with it.
  return off
    .filter(r => !r.parentId || !offIds.has(r.parentId))
    .map(role => {
      const below = branch(role.id, all).length - 1;
      return {
        role,
        below,
        label: below > 0 ? `${role.title}  +${below} below` : role.title,
      };
    });
}

export type StageKey = 'link' | 'flow' | 'grow';

export interface Stage {
  key: StageKey;
  title: string;
  met: boolean;
  detail: string;
}

/**
 * Link → Flow → Grow.
 *
 * Link is structural: everybody on the chart. Flow is measurement: every scored role with its KPIs
 * set. Grow is performance: all four pillar averages at the standard. They are strictly in order —
 * there is no point chasing a score for a business that has not finished drawing itself.
 */
export function stages(all: ChartRole[], detached: Detached[], pillarAverages: Record<string, number | null>, threshold = 0.9): Stage[] {
  const offCount = detached.reduce((s, d) => s + d.below + 1, 0);
  const scored = all.filter(r => r.scored);
  const withoutKpis = scored.filter(r => !r.hasKpis);
  const averages = Object.values(pillarAverages);
  const allScored = averages.length > 0 && averages.every(v => v !== null);
  const allAtStandard = allScored && averages.every(v => (v as number) >= threshold);

  return [
    {
      key: 'link',
      title: 'Link',
      met: offCount === 0 && all.length > 0,
      detail: offCount
        ? `${offCount} ${offCount === 1 ? 'role is' : 'roles are'} off the chart and out of every average.`
        : all.length
          ? 'Every role is linked.'
          : 'Nothing drawn yet.',
    },
    {
      key: 'flow',
      title: 'Flow',
      met: offCount === 0 && scored.length > 0 && withoutKpis.length === 0,
      // The reason has to match the verdict. Flow cannot be met while part of the business is off
      // the chart, and saying "every scored role has its numbers" there would be true and useless.
      detail: withoutKpis.length
        ? `${withoutKpis.length} scored ${withoutKpis.length === 1 ? 'role has' : 'roles have'} no KPIs set.`
        : !scored.length
          ? 'No scored role yet.'
          : offCount
            ? 'Every role on the chart has its numbers, but Flow waits on Link.'
            : 'Every scored role has its numbers.',
    },
    {
      key: 'grow',
      title: 'Grow',
      met: allAtStandard,
      detail: !allScored
        ? 'Not every pillar has a score yet.'
        : allAtStandard
          ? `All four pillars at ${Math.round(threshold * 100)}% or better.`
          : 'Not every pillar is at the standard.',
    },
  ];
}

export interface ParsedRow {
  title: string;
  person: string | null;
  reportsTo: string | null;
}

/**
 * "role, person, reports to" — one per line.
 *
 * Split on comma, semicolon, pipe or tab, because people paste out of whatever they have. A line
 * with only a title is a vacant role, which is a perfectly good thing to draw.
 */
export function parseRoles(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const [title, person, reportsTo] = line.split(/[,;|\t]/).map(p => p.trim());
      return {
        title,
        person: person || null,
        reportsTo: reportsTo || null,
      };
    })
    .filter(r => r.title.length > 0);
}

export interface ResolvedImport {
  rows: (ParsedRow & { parentTitle: string | null })[];
  /** Rows naming a manager that is not in the list — they land in the tray to be dragged in. */
  unmatched: string[];
}

/**
 * Match every row's manager against the titles in the same paste.
 *
 * A manager nobody can find is not an error worth refusing the import over — the role is created
 * and lands in the tray, which is exactly where a human can see the problem and fix it by dragging.
 */
export function resolveImport(rows: ParsedRow[]): ResolvedImport {
  const titles = new Set(rows.map(r => r.title.toLowerCase()));
  const unmatched: string[] = [];
  const resolved = rows.map(r => {
    if (!r.reportsTo) return { ...r, parentTitle: null };
    const found = titles.has(r.reportsTo.toLowerCase());
    if (!found) unmatched.push(r.title);
    return { ...r, parentTitle: found ? r.reportsTo : null };
  });
  return { rows: resolved, unmatched };
}

/** A CSV with a header row, mapped onto the same three fields. */
export function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const looksLikeHeader = /role|title|position/.test(header) && /report|manager/.test(header);
  return parseRoles((looksLikeHeader ? lines.slice(1) : lines).join('\n'));
}
