import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { navDoors, allDoors } from '../src/lib/doors';

/**
 * Kris's must-be-findable components (docs/CORE-COMPONENTS.md) are in the main menu, and open.
 *
 * 25 September: he could not find the org chart — it worked at /org and nothing led to it. This
 * reads the table in the doc, so the doc and the menu are one list: a component cannot leave the
 * menu without this failing, and cannot leave the doc without the count below failing.
 */
const doc = readFileSync('docs/CORE-COMPONENTS.md', 'utf8');
const rows = [...doc.matchAll(/^\| ([^|]+?) \| ([^|]+?) \| (\/[^|\s]*) \|$/gm)]
  .map(m => ({ component: m[1].trim(), label: m[2].trim(), route: m[3].trim() }));

/*
  ── LINK, FLOW, GROW ─────────────────────────────────────────────────────────────────────────────

  Kris, 26 September: *"there are three absolutely critical aspects to this system - links (org
  chart) - kpi boards (flow) and mirrors to support (growth) - where the fuck are they - im
  furious."*

  Only LINK was on this list. Scoring and Mirrors had been moved "under Board" on 24 September and
  were never written down here, so this check — the one written two days later, on the day he could
  not find the org chart, for exactly this failure — went green every run while two thirds of the
  product's foundations sat in a drawer.

  That is the lesson worth keeping: the check was never broken, it was aimed at an incomplete list.
  A guarantee is only as wide as the list behind it, and nothing about a passing test says which.
*/
const REQUIRED = [
  'My Page', 'Org chart', 'Scoring — the KPI boards', 'Mirrors',
  'Virtual GM + Virtual Admin', 'Financials', 'Jobs', 'CRM', 'People', 'Safety',
  'Compliance', 'Board', 'COGS meeting', 'Make it simple report', 'Setup', 'Connections',
];

const pageFor = (route: string) => join('src/app', ...route.split('/').filter(Boolean), 'page.tsx');

describe('the core components', () => {
  it('are all listed in docs/CORE-COMPONENTS.md', () => {
    expect(rows.map(r => r.component).sort()).toEqual([...REQUIRED].sort());
  });

  for (const shape of [{ businesses: 1, runsSpec: false }, { businesses: 3, runsSpec: true }]) {
    it(`are every one in the main menu, under its own label (${shape.businesses} business${shape.businesses > 1 ? 'es' : ''})`, () => {
      const bar = navDoors(shape);
      const missing = rows.filter(r => !bar.some(d => d.href === r.route && d.label === r.label));
      expect(missing.map(r => `${r.component} (${r.label} → ${r.route})`)).toEqual([]);
    });
  }

  it('each open a page that exists', () => {
    expect(rows.filter(r => !existsSync(pageFor(r.route))).map(r => r.route)).toEqual([]);
  });

  it('with the org chart second, right after My page', () => {
    const bar = navDoors({ businesses: 1, runsSpec: false });
    expect(bar[0].href).toBe('/my-page');
    expect(bar[1]).toMatchObject({ href: '/org', label: 'Org chart' });
  });

  it('and the org chart is also a door on My Page, People, Virtual GM and Setup', () => {
    for (const page of ['my-page', 'people', 'virtual-gm', 'setup']) {
      expect(readFileSync(`src/app/${page}/page.tsx`, 'utf8'), page).toContain('<OrgChartDoor');
    }
    expect(readFileSync('src/components/org-chart-door.tsx', 'utf8')).toContain('href="/org"');
  });

  it('the COGS meeting still opens with the Make it simple report', () => {
    expect(readFileSync('src/app/meeting/page.tsx', 'utf8')).toContain('<MakeItSimple');
  });
});

describe('All pages', () => {
  it('opens a real page listing every page, not My Page', () => {
    const bar = navDoors({ businesses: 1, runsSpec: false });
    const all = bar[bar.length - 1];
    expect(all).toMatchObject({ label: 'All pages', href: '/pages' });
    const src = readFileSync('src/app/pages/page.tsx', 'utf8');
    expect(src).toContain("from '@/lib/doors'");
    expect(src).toContain('doors(');
  });

  it('and every core component is in that list too', () => {
    const directory = new Set(allDoors({ businesses: 1, runsSpec: false }).map(d => d.href));
    const missing = rows.filter(r => r.route !== '/my-page' && r.route !== '/board' && !directory.has(r.route));
    expect(missing.map(r => r.route)).toEqual([]);
  });
});

describe('the rule is written where every session reads it', () => {
  it('at the top of CLAUDE.md', () => {
    const claude = readFileSync('CLAUDE.md', 'utf8');
    const at = claude.indexOf('docs/CORE-COMPONENTS.md');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(claude.indexOf('## The mantra'));
    expect(claude).toContain('Never remove or hide a core component');
  });
});

/**
 * Going UP the chart, not only down.
 *
 * Kris, 26 September: *"where do i add the directors - need to see Justin above me in jbi
 * electrical"*, and then *"add 'Add a role above this one' to the right-click menu"*.
 *
 * It was already possible — add a role at "Top of the chart", then drag your own card under it —
 * and it lived in a collapsed panel headed "Start from what you already have" whose only link read
 * "Import your structure". A route that exists and cannot be found is not a route; that is the same
 * finding failure as the org chart itself, and the KPI screen before it.
 */
describe('you can put somebody above you', () => {
  it('the card menu offers it, next to its opposite', () => {
    const canvas = readFileSync('src/components/org-canvas.tsx', 'utf8');
    expect(canvas).toContain('Add a role above this one');
    /* Beside "Add a direct report", so the pair reads as one idea rather than two features. */
    const below = canvas.indexOf("label: 'Add a direct report'");
    const above = canvas.indexOf("label: 'Add a role above this one'");
    expect(below).toBeGreaterThan(-1);
    expect(above).toBeGreaterThan(below);
    expect(above - below).toBeLessThan(1400);
  });

  it('and there is a server action behind it, not just a label', () => {
    const actions = readFileSync('src/app/org/actions.ts', 'utf8');
    expect(actions).toContain('export async function addRoleAbove');
    /* It INSERTS: the new role takes this one's parent, and this one reports to the new role. */
    expect(actions).toMatch(/reportsToRoleId: role\.reportsToRoleId/);
    /* Permission is asked about the role being moved — the same question moveRole asks. */
    expect(actions).toMatch(/canShapeChart\(roleId\)/);
  });

  /*
    Board members are a different thing and must not be confused with this. A director on the BOARD
    is governance — they approve the pack, they are not in the operating chart — and they live in
    `directors`, added at /setup/board. Somebody above you on the chart is a reporting line.
  */
  it('keeps board members as their own thing, with a door that does not close behind you', () => {
    const settings = readFileSync('src/app/settings/page.tsx', 'utf8');
    expect(settings).toContain('/setup/board');
    /* The link is there whether or not the board is empty — see the note beside it. */
    expect(settings).toMatch(/Add a director, or stand one down/);
  });
});
