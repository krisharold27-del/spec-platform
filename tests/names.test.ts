import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';

/**
 * One thing, one name — the design, the code and the address all say the same word.
 *
 * "Names must always match design so we never get confused." It sounds like tidiness and it is not:
 * every hour lost this week to a page not being where somebody expected came from a name that
 * drifted. My page lived at /today. The landing page lived at /welcome, so "landing" and "welcome"
 * were the same thing under two names and nobody could say which was real. Both were small, both
 * were confusing, and neither would ever have failed a test — prose and paths do not fail builds.
 *
 * So this one does. A design screen called "SPEC My Page" has to be reachable at /my-page. If a
 * screen is renamed in Claude Design and the route is not, this says so by name.
 *
 * What it deliberately does NOT do is demand a route for every design. Some screens are a system
 * rather than a page — a colour palette, a component sheet — and some are drawn before they are
 * built. Those are listed here, out loud, rather than silently skipped.
 */

/** Design screens that are not pages, and why. Every entry is a decision, not a convenience. */
const NOT_PAGES: Record<string, string> = {
  'SPEC Colour System': 'a palette, not a screen — it lives in tailwind.config and lib/pillars',
  'SPEC Home': 'the signed-in landing, which is My page',
  'SPEC Board Pack': 'reached per period at /board/[periodId], so it has no fixed address',
  'SPEC Monthly Scoring': 'the month, at /scoring',
  'SPEC Weekly Meeting': 'the week, at /meeting',
  'SPEC Sign In': 'at /signin, one word rather than two',
  'SPEC My Scorecard': 'at /me — a person’s own card, reached by role at /scorecard/[roleId]',
  'SPEC Org Chart': 'at /org',
  'SPEC Mobile': 'the same pages, narrow — not a screen of its own',
  'SPEC Admin': 'at /settings, which is what the business calls it',
  'SPEC Setup': 'at /setup',
  'SPEC Inbox': 'at /inbox, where approvals wait',
  'SPEC Landing': 'the address itself, /',
};

/** What a design file's name becomes as an address: "SPEC My Page" -> "/my-page". */
const addressFor = (screen: string): string =>
  `/${screen.replace(/^SPEC /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

const designScreens = (): string[] =>
  existsSync('designs')
    ? readdirSync('designs').filter(f => f.endsWith('.dc.html')).map(f => f.replace('.dc.html', ''))
    : [];

const hasRoute = (address: string): boolean =>
  existsSync(`src/app${address}/page.tsx`) || existsSync(`src/app${address}/route.ts`);

describe('one thing, one name', () => {
  it('there are designs to check against', () => {
    expect(designScreens().length).toBeGreaterThan(10);
  });

  /*
    The check itself. A screen either lives at the address its name implies, or is listed above with
    a reason — there is no third state where a name quietly stops matching and nobody notices.
  */
  it('every design screen is either at the address its name implies, or is named as an exception', () => {
    const adrift: string[] = [];
    for (const screen of designScreens()) {
      if (screen in NOT_PAGES) continue;
      const address = addressFor(screen);
      if (!hasRoute(address)) adrift.push(`"${screen}" implies ${address}, which does not exist`);
    }
    expect(adrift, 'these design names no longer match an address').toEqual([]);
  });

  it('turns a design name into an address the way a person would guess', () => {
    expect(addressFor('SPEC My Page')).toBe('/my-page');
    expect(addressFor('SPEC Cockpit')).toBe('/cockpit');
    expect(addressFor('SPEC Connections')).toBe('/connections');
  });

  /*
    The two renames this rule was written after. Both old addresses still answer, because links
    outlive the reasons for them — but the NEW one is the real page, and a redirect is all the old
    one may ever be again.
  */
  it('keeps the old addresses working without letting them become the page again', () => {
    for (const [old, now] of [['today', '/my-page'], ['welcome', '/']]) {
      const src = readdirSync(`src/app/${old}`).includes('page.tsx')
        ? require('node:fs').readFileSync(`src/app/${old}/page.tsx`, 'utf8')
        : '';
      expect(src, `/${old} should still answer`).toContain('redirect');
      expect(src, `/${old} should send people to ${now}`).toContain(`'${now}'`);
      // A redirect and nothing else. Anything longer means the page grew back.
      expect(src.split('\n').length, `/${old} is no longer just a redirect`).toBeLessThan(25);
    }
  });
});
