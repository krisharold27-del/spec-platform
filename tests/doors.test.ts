import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { doors, allDoors, navDoors } from '../src/lib/doors';

const SOLO = { businesses: 1, runsSpec: false };
const GROUP = { businesses: 3, runsSpec: false };
const FOUNDER = { businesses: 1, runsSpec: true };

/** Every route the app actually has, read off the filesystem rather than from a list I maintain. */
function realRoutes(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (!statSync(path).isDirectory()) continue;
      if (entry.startsWith('_') || entry === 'api') continue;
      const route = `${prefix}/${entry}`;
      if (existsSync(join(path, 'page.tsx'))) found.add(route);
      walk(path, route);
    }
  };
  walk('src/app', '');
  return found;
}

describe('everywhere else in SPEC', () => {
  /*
    THE CHECK THAT MATTERS.

    The navigation bar was deleted — the shape of the product is a landing page, then My Page, and
    everything branching from there. Deleting a menu is exactly how a screen becomes unreachable
    while every test still passes, because nothing else in the codebase links to it.
  */
  it('every door leads somewhere that exists', () => {
    const routes = realRoutes();
    const broken = allDoors(FOUNDER).concat(allDoors(GROUP))
      .map(d => d.href)
      .filter(href => !routes.has(href));
    expect([...new Set(broken)], 'these doors point at screens that are not there').toEqual([]);
  });

  it('offers the same door only once', () => {
    const hrefs = allDoors(GROUP).map(d => d.href);
    expect(hrefs).toHaveLength(new Set(hrefs).size);
  });

  it('every door says what it is for, in plain words', () => {
    for (const d of allDoors(FOUNDER)) {
      expect(d.label.length, d.href).toBeGreaterThan(2);
      expect(d.note.length, d.href).toBeGreaterThan(15);
      expect(d.note.endsWith('.'), d.href).toBe(true);
    }
  });

  /*
    A group view for somebody with one business is a menu item that explains nothing and leads to a
    page telling them it does not apply — the kind of clutter that makes a product feel heavy.
  */
  it('hides the group doors from somebody with one business', () => {
    const hrefs = allDoors(SOLO).map(d => d.href);
    expect(hrefs).not.toContain('/group');
    expect(hrefs).not.toContain('/businesses');
    expect(allDoors(GROUP).map(d => d.href)).toContain('/group');
  });

  /*
    The cockpit carries commercial targets. Its ABSENCE is the answer for everybody else — better
    than a door that refuses, which would tell them the page exists.
  */
  it('shows the cockpit only to whoever runs SPEC', () => {
    expect(allDoors(SOLO).map(d => d.href)).not.toContain('/cockpit');
    expect(allDoors(FOUNDER).map(d => d.href)).toContain('/cockpit');
  });

  it('leads with the rhythm, because that is what most days are made of', () => {
    expect(doors(SOLO)[0].title).toBe('The rhythm');
    expect(doors(SOLO)[0].doors.map(d => d.href)).toEqual(['/meeting', '/scoring', '/inbox']);
  });

  /*
    Nothing should have been lost when the menu was deleted. These are the screens the old
    navigation bar carried, named explicitly so a future tidy-up cannot quietly drop one.
  */
  it('still reaches everything the old menu did', () => {
    const hrefs = new Set(allDoors(FOUNDER).concat(allDoors(GROUP)).map(d => d.href));
    for (const was of [
      '/meeting', '/scoring', '/inbox', '/org', '/summary', '/charter', '/me', '/team',
      '/people', '/mirrors', '/curve', '/training', '/connections', '/setup', '/settings',
      '/group', '/businesses',
    ]) {
      expect(hrefs.has(was), `${was} was in the old menu and is now unreachable`).toBe(true);
    }
  });
});

describe('the navigation bar', () => {
  /*
    SPEC had no navigation until 18 September, and the reasoning against it was good — a toolbar of
    five links plus a dropdown of fourteen had made the product two things, a page you work on and a
    menu you hunt in. Every design screen has carried a bar throughout, and Kris settled it looking
    at the two side by side: "keep the nav bar".

    So the bar is held to the thing that made the old one bad: its LENGTH, and whether every item
    goes somewhere real.
  */
  const f = { businesses: 1, runsSpec: false };

  it('IS TEN ITEMS — seven key areas, and three for setting it up', () => {
    /*
      The argument was never that navigation is wrong. It was that nineteen of them is — and by 24
      September the bar had grown back to FOURTEEN, one reasonable addition at a time. Kris, looking
      at it: *"why is this like this - we already talked about these are to be combined."*

      The design says the shape: **My page · Jobs · CRM · People · Safety · Compliance · Board**,
      with Setup, Connections and All pages on the right. Org chart and Training under People;
      Scoring and Mirrors under Board; Clients under CRM; Pricing under Setup.

      Ten is the ceiling this test defends. The next thing that wants a tab should take somebody
      else's rather than making it eleven — that is exactly how it got to fourteen.
    */
    // Eleven since 25 September: Financials, which Kris asked for by name after People.
    // Fourteen later the same day: he could not find the org chart, and every core component in
    // docs/CORE-COMPONENTS.md now has its own item — findability beats a short bar. The ceiling is
    // held at fourteen; the next addition must be a core component Kris names, or go under one.
    expect(navDoors(f)).toHaveLength(14);
    expect(navDoors(f).length).toBeLessThan(allDoors(f).length);
  });

  /*
    ── The rule that makes shortening the bar safe ─────────────────────────────────────────────

    Taking something off the bar must never make it hard to find. Every page that was on the bar on
    23 September and is not on it now has to still be in the full directory, which is one click away
    behind All pages — otherwise "combining" is just hiding.
  */
  it('KEEPS EVERY PAGE IT TOOK OFF THE BAR REACHABLE IN THE DIRECTORY', () => {
    const directory = new Set(allDoors(f).map(d => d.href));
    for (const gone of ['/org', '/clients', '/billing', '/scoring', '/mirrors', '/training']) {
      expect(directory.has(gone), `${gone} came off the bar and is now unreachable`).toBe(true);
    }
  });

  it('EVERY ITEM IS A REAL ROUTE', () => {
    /*
      Checked against the app directory rather than against the door list, because the door list is
      the other thing that could be wrong. A bar pointing at a page that does not exist is the
      failure that made the old dropdown worth deleting.
    */
    for (const d of navDoors(f)) {
      // An anchor is a place ON a page, so the page is what has to exist.
      const path = d.href.replace(/^\//, '').replace(/#.*$/, '');
      const dir = join(process.cwd(), 'src/app', path);
      expect(existsSync(join(dir, 'page.tsx')), `${d.href} has no page`).toBe(true);
    }
  });

  it('starts at My page, and Setup has moved to the right', () => {
    /*
      Kris asked for Setup as tab one on 22 September, and it was tab one for two days. The 24
      September design supersedes that: the bar is the KEY AREAS — the things somebody works in
      every day — and Setup, Connections and All pages sit to the right of them because setting the
      business up is not one of them. My Page goes back to first, which is where every day starts.
    */
    expect(navDoors(f)[0].href).toBe('/my-page');
    const labels = navDoors(f).map(d => d.label);
    expect(labels.indexOf('Setup')).toBeGreaterThan(labels.indexOf('Board'));
  });

  it('and every item carries the words the design uses', () => {
    const labels = navDoors(f).map(d => d.label);
    /*
      Mirrors, not Boards — Design 11's rename, and the bar is where it was missed.

      The rename moved the ADDRESS and left the WORD, so the navigation said Boards on a page whose
      own heading said Mirrors. Kris, looking at the live site: *"should say mirrors at the top"*.
      This test exists to hold the bar to the design's words and did not catch it, because it was
      written before the rename and nobody updated it — so it was asserting the old name as though
      it were the design's.
    */
    expect(labels).toEqual([
      'My page', 'Org chart', 'Virtual GM', 'Jobs', 'CRM', 'People', 'Financials', 'Safety', 'Compliance', 'Board',
      'COGS meeting', 'Setup', 'Connections', 'All pages',
    ]);
  });

  it('THE BAR AND THE DIRECTORY CANNOT DISAGREE', () => {
    /*
      Every bar item except My page and Board pack is taken from `doors()` (Setup is written out too,
      but its href still names a real door in the directory, so it is checked the same as the rest).
      My page and Board pack are the true exceptions, named here rather than left to be noticed: My
      page is the shell itself, and /board is a door onto /board/[periodId], which has no fixed
      address to put in a list.
      */
    const directory = new Set(allDoors(f).map(d => d.href));
    for (const d of navDoors(f)) {
      // All pages points AT the directory, so it cannot be in it.
      if (d.href === '/my-page' || d.href === '/board' || d.href === '/pages') continue;
      expect(directory.has(d.href), `${d.href} is in the bar but not the directory`).toBe(true);
    }
  });
});
