import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';

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
  // 23 September 2026: the bare address became siteVIP, and SPEC's own front door moved to /spec.
  'SPEC Landing': 'SPEC’s own front door, at /spec since the bare address became siteVIP',
  /*
    The Setup that was replaced on 24 September, kept in the bundle so the file-driven rebuild can
    be read against what it replaced. It is reference, not a backlog item — there is no /setup-v1
    and there must never be one, because two setup wizards is how a business ends up half through
    each.
  */
  'SPEC Setup v1': 'the superseded Setup, kept for reference only — never to be built',
  'siteVIP Landing': 'the address itself, / — the trades edition of SPEC',
  /*
    The customer's own page, new in design 17. It is per JOB and reached by a long random token —
    `/customer/[token]` — because a customer will not make an account to find out when the
    electrician is arriving. There is deliberately no `/customer-page`: a bare address would be a
    page with no job behind it, and the token is the only thing standing between one customer and
    another's. See lib/customer-page.
  */
  'SPEC Customer Page': 'per job, at /customer/[token] — the link is the key, so there is no bare address',
  /*
    Design 19, 25 September. Three screens whose design names are descriptions rather than
    addresses — nobody would ever guess /sitevip-angus-shield, and a product that ships addresses
    like that is one naming its pages after its own org chart.

    "Angus Shield" is what the financial system is CALLED; what the owner is looking for is their
    money, and the design's own nine tiles call the tile Money. So the screen is /money, and Angus
    Shield is named on it. The GM home is the Virtual GM screen that already exists — one home
    rather than a second one beside it. The questions page is /questions.
  */
  'siteVIP Angus Shield': 'at /money — what the owner looks for is their money; Angus Shield is what sits underneath it',
  'siteVIP GM': 'the Virtual GM home, at /virtual-gm — one home, not a second beside it',
  'siteVIP Questions': 'at /questions — the design name is a description, and nobody would guess /sitevip-questions',
};

/**
 * Reference pages, read from the one place that records them.
 *
 * A logo study or a palette exploration is design thinking, not a screen anybody signs in to see,
 * and designs/superseded.md already names them with the reasoning — for the coverage check. Reading
 * that same file here rather than keeping a second list is the whole point of this test file: two
 * lists of "screens that are not pages" would be exactly the kind of drift it exists to catch.
 */
const REFERENCE_SCREENS: string[] = (() => {
  try {
    const text = readFileSync('designs/superseded.md', 'utf8');
    return [...text.matchAll(/^### Screen: (.+)$/gm)].map(m => m[1].trim());
  } catch {
    return [];
  }
})();

/**
 * Screens that are real and simply not built yet — read from the one file that already records them.
 *
 * ── Why this list, and not a new exception (26 September) ────────────────────────────────────────
 *
 * Design 20 brought two screens nobody has built. Left alone, this file failed them as NAME DRIFT,
 * which is the wrong accusation: the name matches perfectly, there is just no page behind it yet.
 *
 * The tempting fix is a line in NOT_PAGES above. That would be a lie with a reason attached — it
 * says "this is not a screen", when it is a screen that has not been made. And it is permanent: the
 * day somebody builds it, nothing tells them to take the exception out, so the address goes
 * unchecked forever.
 *
 * `designs/not-built-yet.md` already exists for exactly this, already carries the date each one
 * arrived, and `design-coverage.mjs` already shouts about it on every run. Reading the same file
 * here rather than keeping a second list is the same rule this whole test exists to enforce.
 */
const NOT_BUILT_YET: string[] = (() => {
  try {
    const text = readFileSync('designs/not-built-yet.md', 'utf8');
    return [...text.matchAll(/^### Screen: (.+)$/gm)].map(m => m[1].trim());
  } catch {
    return [];
  }
})();

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
      if (REFERENCE_SCREENS.includes(screen)) continue;
      if (NOT_BUILT_YET.includes(screen)) continue;
      const address = addressFor(screen);
      if (!hasRoute(address)) adrift.push(`"${screen}" implies ${address}, which does not exist`);
    }
    expect(adrift, 'these design names no longer match an address').toEqual([]);
  });

  /*
    ── And the waiver expires by itself ─────────────────────────────────────────────────────────

    The danger in any "not yet" list is that it becomes "not ever": the screen gets built, the
    entry stays, and the address it was excusing goes unchecked from then on — silently, because
    everything is green.

    So a screen on that list whose page EXISTS fails here, by name. Building it is what removes the
    entry, and nobody has to remember.
  */
  it('takes a screen off the not-built-yet list the moment it is built', () => {
    const stale = NOT_BUILT_YET
      .filter(screen => hasRoute(addressFor(screen)))
      .map(screen => `"${screen}" is built at ${addressFor(screen)} — take it out of designs/not-built-yet.md`);
    expect(stale, 'these are no longer unbuilt').toEqual([]);
  });

  /* A name on that list has to be a real screen in the export, not a note somebody left behind. */
  it('does not carry a not-built-yet entry for a screen that is not in the designs', () => {
    const screens = designScreens();
    const ghosts = NOT_BUILT_YET.filter(s => !screens.includes(s));
    expect(ghosts, 'these are on the list and not in designs/').toEqual([]);
  });

  it('turns a design name into an address the way a person would guess', () => {
    expect(addressFor('SPEC My Page')).toBe('/my-page');
    expect(addressFor('SPEC Cockpit')).toBe('/cockpit');
    expect(addressFor('SPEC Connections')).toBe('/connections');
  });

  // The two front doors, each where its exception says it is.
  it('has the siteVIP door at / and the SPEC door at /spec', () => {
    expect(existsSync('src/app/page.tsx')).toBe(true);
    expect(readFileSync('src/app/page.tsx', 'utf8')).toContain('<SiteVipMark');
    expect(readFileSync('src/app/spec/page.tsx', 'utf8')).toContain('<ProblemBox');
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
