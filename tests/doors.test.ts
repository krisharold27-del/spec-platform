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
      '/people', '/boards', '/curve', '/training', '/connections', '/setup', '/settings',
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

  it('IS SEVEN ITEMS, not nineteen', () => {
    /*
      The argument was never that navigation is wrong. It was that nineteen of them is.

      Seven since 18 September, when Kris sent the header he wants: the six screens plus **All
      pages**, which is the door to the full grouped directory at the foot of My Page. That last
      item is what lets the bar stay this short — SPEC has far more than seven screens and always
      will, and nothing may be reachable only by knowing it is there.
    */
    expect(navDoors(f)).toHaveLength(7);
    expect(navDoors(f).length).toBeLessThan(allDoors(f).length);
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

  it('starts at My page, because that is where every day starts', () => {
    expect(navDoors(f)[0].href).toBe('/my-page');
  });

  it('and every item carries the words the design uses', () => {
    const labels = navDoors(f).map(d => d.label);
    expect(labels).toEqual(['My page', 'Org chart', 'Scoring', 'Board pack', 'Boards', 'Connections', 'All pages']);
  });

  it('THE BAR AND THE DIRECTORY CANNOT DISAGREE', () => {
    /*
      Every bar item except My page and Board pack is taken from `doors()`, so a renamed route moves
      both at once. Those two are the exceptions and are named here rather than left to be noticed:
      My page is the shell itself, and /board is a door onto /board/[periodId], which has no fixed
      address to put in a list.
      */
    const directory = new Set(allDoors(f).map(d => d.href));
    for (const d of navDoors(f)) {
      // All pages points AT the directory, so it cannot be in it.
      if (d.href === '/my-page' || d.href === '/board' || d.href === '/my-page#everywhere') continue;
      expect(directory.has(d.href), `${d.href} is in the bar but not the directory`).toBe(true);
    }
  });
});
