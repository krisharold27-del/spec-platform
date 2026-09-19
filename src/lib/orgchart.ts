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
import type { AceWatchRow } from './ace-watch';

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
  /**
   * This role's Ace run, or null when it has no scorecard to run one on.
   *
   * On the chart because the chart is where Kris works. Every role has an Ace — three closed months
   * at 90% combined and the next month doubles — and until now the only way to find out where
   * somebody was in their three was to open their scorecard one at a time. A run is a thing a
   * leader should be able to see across the whole business at a glance, which is what this diagram
   * is for.
   */
  ace?: AceWatchRow | null;
  /**
   * What this role is measured on, by pillar — the criterion names, in order.
   *
   * The design's Role scorecard names the measures under every pillar heading, and that is the part
   * which turns a percentage into something anybody can act on: 89% says nothing, "Margin against
   * quote · Labour utilisation" says where to look. Read once for the whole chart on a page that
   * already loads the criteria, so putting it on the panel costs no extra query.
   */
  kpis?: { safety: string[]; people: string[]; earnings: string[]; compliance: string[] };
}

/** The four pillars, in the order they are read on a card: S P E C. */
export const PILLAR_KEYS = ['safety', 'people', 'earnings', 'compliance'] as const;

/** The four averages the board reads. Null means nothing has been scored against that pillar. */
export type Rollup = Record<(typeof PILLAR_KEYS)[number], number | null>;

/**
 * What the board is being told, in one line.
 *
 * The design has three cases — all green, amber, red. There is a fourth that only a real business
 * has: **nothing marked yet**, on the first morning, before a month has ever been closed. The
 * prototype cannot reach it because it ships with numbers in it, and a screen that answered "Red on
 * the board" to a company that has not started would be both wrong and discouraging on the one day
 * that matters most.
 */
export function boardVerdict(averages: Rollup): { title: string; body: string; wash: string } {
  const values = PILLAR_KEYS.map(p => averages[p]).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return {
      title: 'Nothing marked yet',
      body: 'Set a role’s KPIs and close a month, and the four pillars fill in here — this is the same figure the board pack carries.',
      wash: 'rgba(140,134,129,0.12)',
    };
  }
  const worst = Math.min(...values);
  if (worst >= 0.8) {
    return {
      title: 'All four green',
      body: 'Two months at this and the business is SPEC — 90% on every pillar, every month.',
      wash: 'rgba(79,122,63,0.12)',
    };
  }
  return {
    title: worst > 0.5 ? 'Amber on the board' : 'Red on the board',
    body: 'The board sees the pillar below target and the role it comes from. Nothing needs explaining.',
    wash: worst > 0.5 ? 'rgba(198,113,57,0.12)' : 'rgba(166,59,38,0.10)',
  };
}

export const SLOT = 216;
export const ROW = 196;
const STUB = 28;

/**
 * ── The card's dimensions, taken from the design file rather than guessed ────────────────────────
 *
 * `SPEC Org Chart.dc.html` sizes a card by its DEPTH, in a table the prototype calls `sizes`:
 *
 *     level 0   min-width 210   padding 18px 24px   radius 28   tile 26px
 *     level 1   min-width 176   padding 16px 20px   radius 26   tile 25px
 *     level 2+  min-width 148   padding 13px 17px   radius 24   tile 23px
 *
 * The radius grows with seniority, so the hierarchy is legible from the shape before a word is read.
 *
 * ── The title is 16px BODY type at every depth, which is not what the file's code says ───────────
 *
 * The prototype computes a `titleStyle` — Caprasimo, 19/16/14px by depth — and never applies it to
 * the element, so its own preview draws every title in 16px Figtree. The product followed the code;
 * Kris looked at both and chose the preview: *"match the design preview - make titles the body
 * font"*. His call, and a defensible one — the display face at 14px inside a small card is a lot of
 * texture for a diagram somebody scans forty of. So the title size is here as a constant rather
 * than a per-depth value, and the card height still derives from it.
 *
 * Height is DERIVED from those numbers rather than typed in, so the two cannot drift: padding, two
 * lines of title at 1.25, the person pill, and the row of tiles.
 */
export const CARD = [
  { w: 210, pad: 18, radius: 28, title: 16, tile: 26 },
  { w: 176, pad: 16, radius: 26, title: 16, tile: 25 },
  { w: 148, pad: 13, radius: 24, title: 16, tile: 23 },
] as const;

export const cardStyle = (depth: number) => CARD[Math.min(depth, CARD.length - 1)];

export const cardWidth = (depth: number) => cardStyle(depth).w;

/**
 * ONE height per depth, whatever the role count or the title length.
 *
 * Export 5 made this explicit: "one fixed height for every card at every depth — the title is
 * clamped to 2 lines so content can never grow past this, making the row-to-row gap a true
 * structural constant."
 *
 * Worked out from the parts rather than declared: the padding top and bottom, two lines of title at
 * 1.4 — which is where the descenders' room lives, since a clamp box will not draw padding — the
 * person pill at 18px with its 5px margin,
 * and the tiles with the 10px above them. Kris photographed names cut in half on 18 September
 * because this was a number somebody had typed; now it cannot be too small without the card spec
 * itself being wrong.
 */
export const cardHeight = (depth: number) => {
  const z = cardStyle(depth);
  return z.pad * 2 + Math.ceil(z.title * 1.4 * 2) + 23 + z.tile + 10;
};

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
  /**
   * What this line is REPORTING, 0–1, or null where nothing is scored yet.
   *
   * The lines were one flat colour, which made them plumbing. In the design they carry the reading:
   * *"the four lights on every card so the structure and the performance are the same picture"*.
   * A branch that is in trouble should be visible from the shape of the chart rather than by
   * reading eight cards.
   *
   * Which score, by kind, and each is a different question:
   *   stub  — the PARENT's own average. The line leaving a role is how that role is doing.
   *   rail  — the WORST of the children it spans. A rail is a claim about a whole team, and a team
   *           is not doing well because three of its four are; the one in trouble is the news.
   *   riser — that CHILD's average. The line arriving at a role is how that role is doing.
   */
  score: number | null;
}

export interface Layout {
  cards: PlacedCard[];
  lines: Connector[];
  width: number;
  height: number;
}

/**
 * A role's four pillars as one number, or null when nothing is marked.
 *
 * Averaged over the pillars that HAVE a score rather than over four, so a role part-way through its
 * first month reads as what it has rather than being dragged towards zero by pillars nobody has got
 * to yet. Null when there is nothing at all — which is an absence, not a red.
 */
export function roleAverage(role: ChartRole): number | null {
  const marked = role.pillars
    ? [role.pillars.safety, role.pillars.people, role.pillars.earnings, role.pillars.compliance]
        .filter((v): v is number => v !== null)
    : [];
  if (!marked.length) return null;
  return marked.reduce((a, b) => a + b, 0) / marked.length;
}

/** The worst of several, ignoring the ones with nothing to say. Null only when none of them score. */
export function worstOf(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? Math.min(...real) : null;
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
      /*
        Five pixels, not two, and carrying a reading. Two flat pixels is plumbing; the design draws
        these as rails you can see the state of the business in from across the room.
      */
      // `kids` is the one filtered by `seen` above. Re-deriving it here would pair a riser's colour
      // with the wrong child on a chart that has been dragged into a cycle.
      lines.push({ kind: 'stub', x: centre - 2.5, y: bottom, w: 5, h: STUB, score: roleAverage(node) });
      if (childCentres.length > 1) {
        lines.push({
          kind: 'rail', x: left, y: railY - 2.5, w: right - left, h: 5,
          score: worstOf(kids.map(roleAverage)),
        });
      }
      childCentres.forEach((cx, i) => {
        lines.push({
          kind: 'riser', x: cx - 2.5, y: railY, w: 5, h: y + ROW - railY,
          score: kids[i] ? roleAverage(kids[i]) : null,
        });
      });
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

/**
 * May this role be taken off the chart for good?
 *
 * The server refuses all three of these already — but it refuses by throwing, which on a server
 * action means the error page. Somebody who right-clicks "Remove role" on a role with two people
 * under it should get a sentence explaining why, on the chart they are looking at, not a fault
 * screen. So the same three rules are stated here, where the chart can say them.
 *
 * This is deliberately a second copy rather than the only one. The check that protects the data is
 * the one on the server, and it stays there: a rule enforced only in the browser is a rule one
 * devtools line away from gone. This copy exists to be polite, not to be trusted.
 */
export function canRemove(roleId: string, all: ChartRole[], chartRootId: string | null): MoveCheck {
  const role = all.find(r => r.id === roleId);
  if (!role) return { ok: false, reason: 'That role is not on this chart.' };
  if (role.id === chartRootId) {
    return { ok: false, reason: 'The top of the chart cannot be removed — everything else hangs off it.' };
  }
  if (role.person) {
    return { ok: false, reason: `${role.person} is in that role. Move them out first, or make the role vacant — removing it would lose their placement.` };
  }
  const under = all.filter(r => r.parentId === roleId);
  if (under.length) {
    return {
      ok: false,
      reason: `${under.length} role${under.length === 1 ? '' : 's'} report${under.length === 1 ? 's' : ''} to ${role.title}. Move ${under.length === 1 ? 'it' : 'them'} first.`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * Roles hidden because a leader above them is collapsed.
 *
 * Collapsing is a reading aid and nothing else: the roles are still on the chart, still in every
 * average, still counted. Only the drawing changes. That is why this returns a set to hide rather
 * than filtering the roles — the counts on the page are taken from the full list, and a reading aid
 * that quietly changed a number would be a bug disguised as a feature.
 *
 * A collapsed role hides everything BENEATH it, never itself.
 */
export function collapsedAway(collapsed: Iterable<string>, all: ChartRole[]): Set<string> {
  const hidden = new Set<string>();
  for (const id of collapsed) {
    // `branch` includes the role itself; the collapsed card stays visible, carrying the count.
    for (const r of branch(id, all)) if (r.id !== id) hidden.add(r.id);
  }
  return hidden;
}

/** How many roles sit under this one, at any depth. What the "Team of 4" badge counts. */
export const teamSize = (roleId: string, all: ChartRole[]): number => branch(roleId, all).length - 1;

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
 * How two role titles are compared, everywhere.
 *
 * One function, exported, because the import matches titles in three places — finding a manager,
 * deciding whether a role already exists, and looking the parent's id up again afterwards — and
 * three slightly different ideas of "the same title" is how a role gets created twice or hung off
 * nothing. Case, surrounding space, doubled spaces and a trailing comma or full stop are all noise
 * in a pasted spreadsheet; none of them means a different role.
 */
export const titleKey = (title: string) =>
  title.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');

/**
 * Match every row's manager — against the paste AND against the chart the business already has.
 *
 * ── The fault this exists to end ─────────────────────────────────────────────────────────────────
 *
 * It used to look only at the titles in the same paste. So the single most ordinary way to use this
 * screen — you already have a chart, and you paste in the eleven people under your Operations
 * Manager — put every one of those eleven in "off the chart". Their manager was sitting right there
 * on the chart and the importer could not see them, because it was only ever shown the paste.
 *
 * The person then has eleven cards to drag in by hand, which is the work they came here to avoid.
 *
 * `onChart` is the titles already in the business. A manager still not found anywhere is not an
 * error worth refusing the whole import over — that role is created and lands in the tray, which is
 * where a human can see the problem and fix it with one drag.
 */
export function resolveImport(rows: ParsedRow[], onChart: string[] = []): ResolvedImport {
  /*
    Keyed by the comparison form, valued by the real title, so `parentTitle` comes back spelled the
    way the chart spells it rather than the way the paste did — the caller looks the parent up by
    that name.
  */
  const titles = new Map<string, string>();
  for (const title of onChart) titles.set(titleKey(title), title);
  for (const r of rows) titles.set(titleKey(r.title), r.title);

  const unmatched: string[] = [];
  const resolved = rows.map(r => {
    if (!r.reportsTo) return { ...r, parentTitle: null };
    const found = titles.get(titleKey(r.reportsTo));
    if (!found) unmatched.push(r.title);
    return { ...r, parentTitle: found ?? null };
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
