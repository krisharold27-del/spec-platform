/**
 * Render every design beside the page that is supposed to be it.
 *
 * Kris, 18 September: *"why are you not following design properly?"*. The answer was that design
 * fidelity was being checked with a TEXT SEARCH — `design-coverage.mjs` greps the source for phrases
 * pulled out of the prototypes. That can say whether the words appear. It cannot see a card shape, a
 * colour, a line weight, a layout or a column, so four grey dots where the design draws four
 * coloured letters was invisible to it and it reported 100%, complete, for weeks.
 *
 * This produces the pairs. The comparison itself is a person looking at two pictures, which is the
 * only thing that works — the output of this script is not a verdict, it is the evidence somebody
 * else forms one from. `docs/DESIGN-GAP.md` is the list that came out of it.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   (cd designs && python3 -m http.server 3200) &
 *   node scripts/sweep-designs.mjs
 *
 * The prototypes load React from unpkg. Where the network denies that — this environment's proxy
 * does — the two UMD builds are served from disk instead; without them every design renders blank,
 * which is silent and looks exactly like a page with nothing on it.
 */
import { readdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { realFonts } from './design-fonts.mjs';

/** The folder the designs really live in, so the list below can be checked against it. */
const DESIGNS = new URL('../designs/', import.meta.url).pathname;
const OUT='/tmp/claude-0/-home-claude-repo/7fcbd828-c8f9-54e2-b54f-78d2e286654f/scratchpad/sweep';
const UMD='/tmp/claude-0/-home-claude-repo/7fcbd828-c8f9-54e2-b54f-78d2e286654f/scratchpad/umd/package/umd';
const APP='http://localhost:3100', DES='http://localhost:3200';

/**
 * Design file -> the route that is supposed to be it.
 *
 * ── Why this list is checked against the folder ─────────────────────────────────────────────────
 *
 * Kris, 19 September: *"now go through every screen and check it matches the design"*.
 *
 * It could not, and had not been. This list named `SPEC Boards.dc.html`, which was renamed to
 * `SPEC Mirrors.dc.html` at some point — so the sweep fetched a 404 from the design server,
 * screenshotted the error page, and filed it as "the design" for that screen. And it covered
 * sixteen of the twenty-four files in `designs/`, silently: eight screens including the ORG CHART,
 * the one screen this product has been corrected on most, were never in the comparison at all.
 *
 * Both faults are the same fault — a list of what to check, kept by hand, next to a folder that
 * moves. So the folder is now the authority: anything in it must either be paired with a route or
 * be named in NOT_A_SCREEN with a reason, and the sweep refuses to run otherwise.
 */
const PAIRS = [
  ['SPEC My Page.dc.html', '/my-page', 'my-page'],
  ['SPEC Monthly Scoring.dc.html', '/scoring', 'scoring'],
  ['SPEC My Scorecard.dc.html', '/me', 'my-scorecard'],
  ['SPEC People.dc.html', '/people', 'people'],
  ['SPEC Training.dc.html', '/training', 'training'],
  ['SPEC Weekly Meeting.dc.html', '/meeting', 'meeting'],
  ['SPEC Inbox.dc.html', '/inbox', 'inbox'],
  ['SPEC Connections.dc.html', '/connections', 'connections'],
  ['SPEC Mirrors.dc.html', '/mirrors', 'mirrors'],
  ['SPEC Setup.dc.html', '/setup', 'setup'],
  ['SPEC Board Pack.dc.html', '/board', 'board-pack'],
  ['SPEC Landing.dc.html', '/spec', 'landing'],
  ['siteVIP Landing.dc.html', '/', 'sitevip-landing'],
  ['SPEC Pricing.dc.html', '/pricing', 'pricing'],
  ['SPEC Admin.dc.html', '/settings', 'admin'],
  ['SPEC Group.dc.html', '/group', 'group'],
  ['SPEC Sectors.dc.html', '/sectors', 'sectors'],
  ['SPEC Org Chart.dc.html', '/org', 'org-chart'],
  ['SPEC Mobile.dc.html', '/site', 'mobile'],
  ['SPEC Tech Day.dc.html', '/tech-day', 'tech-day'],
];

/**
 * Files in `designs/` that are references rather than screens, and why.
 *
 * Written down rather than left out, so that a NEW design landing in the folder cannot be quietly
 * ignored the way eight of them were: it has to be paired or explained.
 */
const NOT_A_SCREEN = {
  'SPEC Colour System.dc.html': 'the palette itself — checked by the token tests, not by a page',
  'SPEC Logo Concepts.dc.html': 'logo exploration, not a screen in the product',
  'SPEC Mascot.dc.html': 'the mascot sheet, not a screen in the product',
  /*
    The handoff's own contents page — "the whole system, in the order it is used", "Before they
    buy", "Still to design". It is a map OF the designs, not one of them, and pairing it with /how
    produced nine "missing" headings that were never meant to be anywhere in the product.
  */
  'SPEC Home.dc.html': 'the handoff index — a map of the designs, not a screen',
};

/**
 * Screens that need a session this sweep does not have, and what that session is.
 *
 * Kept here rather than dropped from the list, because a screen quietly absent from a comparison is
 * the fault this file just spent a rewrite on. `/signin` redirects away the moment somebody is
 * signed in, and `/cockpit` is only ever shown to whoever runs SPEC itself — so both were being
 * shot as whatever the redirect landed on, and every heading in their designs read as missing.
 */
const NEEDS_ANOTHER_SESSION = {
  'SPEC Sign In.dc.html': 'signed out — shot from a second browser context with no cookies',
  'SPEC Cockpit.dc.html': 'an ADMIN_EMAILS address; everybody else is sent to /my-page',
};

/*
  The folder is the authority, not this file.

  A design that is neither paired nor explained stops the sweep, because the alternative is what
  already happened: eight screens missing from a comparison that reported itself complete.
*/
const onDisk = readdirSync(DESIGNS).filter(f => f.endsWith('.dc.html')).sort();
const paired = new Set(PAIRS.map(([file]) => file));
const unaccounted = onDisk.filter(f => !paired.has(f) && !NOT_A_SCREEN[f] && !NEEDS_ANOTHER_SESSION[f]);
const missing = PAIRS.map(([file]) => file).filter(f => !onDisk.includes(f));

if (unaccounted.length || missing.length) {
  for (const f of unaccounted) console.log(`FAIL  ${f} is in designs/ and is neither paired with a route nor listed as not-a-screen`);
  for (const f of missing) console.log(`FAIL  ${f} is paired with a route but is not in designs/ — renamed, or deleted`);
  console.log('\nNothing was shot. Fix the list above; a sweep that skips screens is worse than no sweep.');
  process.exit(1);
}
console.log(`  --   ${PAIRS.length} screens to shoot, ${Object.keys(NOT_A_SCREEN).length} files that are not screens.`);
for (const [file, why] of Object.entries(NEEDS_ANOTHER_SESSION)) {
  console.log(` skip  ${file} — needs ${why}`);
}

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
// The prototypes pull React from unpkg, which this environment's proxy denies. Served locally.
await ctx.route('**unpkg.com/react@**', r => r.fulfill({ path: `${UMD}/react.production.min.js`, contentType: 'application/javascript' }));
await ctx.route('**unpkg.com/react-dom@**', r => r.fulfill({ path: `${UMD}/react-dom.production.min.js`, contentType: 'application/javascript' }));
/*
  The prototypes get their REAL typeface before a single shot is taken.

  Without this they render in Arial — their Google Fonts import is refused by this environment's
  proxy — and every pair produced here compares the product against a design in the wrong font.
  See scripts/design-fonts.mjs; it throws rather than falling back, because a silent fallback is
  what made weeks of these screenshots quietly misleading.
*/
await realFonts(ctx, APP);

const p = await ctx.newPage();

/*
  ── Why this claims the business rather than looking around it ──────────────────────────────────

  Kris, 19 September: *"now go through every screen and check it matches the design"*.

  It used to stop at `/look`, which gives a business with real numbers in it and is **read-only by
  design**. So every control the designs draw for somebody who can change something — Approve and
  Deny on the predicted roles, "Import your structure", "Add a direct report", every form on every
  screen — was absent from the built side of every pair, and would have been written up as a gap.

  The first three things this sweep appeared to find on the org chart were all present in the code
  and all invisible for that one reason. A comparison that manufactures its own findings is worse
  than no comparison, because somebody acts on it.

  "Make it mine" is the product's own path from looking to owning, and it keeps the numbers. So the
  sweep walks it: what is shot afterwards is a business with real history that can also be changed,
  which is the only state both halves of a design are visible in.
*/
/*
  ── Getting into a business that has numbers AND can be changed ─────────────────────────────────

  Two ways in, because the front one is rate limited.

  Normally: walk the product's own path from looking to owning. "Make it mine" leads to a decide
  page, and the sign-up form is behind the yes — three steps, not one. The first version clicked
  once, then filled a form that was not there with a `.catch` on every fill, swallowed five
  failures in a row and carried on as the read-only visitor. Twenty-one pairs were shot of a
  product nobody can change, and nothing on them said so.

  When SPEC's look-around throttle is holding — which it should, and does after a few runs —
  SWEEP_EMAIL signs in as a business an earlier run already claimed. Same numbers, same rights.
*/
const stamp = Date.now();
if (process.env.SWEEP_EMAIL) {
  await p.goto(`${APP}/signin`, { waitUntil: 'networkidle' });
  await p.fill('input[name="email"]', process.env.SWEEP_EMAIL);
  await p.fill('input[name="password"]', 'a-good-password-123');
  await p.click('button[type="submit"]');
  await p.waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 20000 }).catch(() => {});
} else {
  await p.goto(`${APP}/look`, { waitUntil: 'networkidle' });
  await p.click('text=Make it mine');
  await p.waitForLoadState('networkidle');
  await p.click('text=let\u2019s take this further');
  await p.waitForLoadState('networkidle');
  await p.fill('input[name="name"]', 'Dane Whitmore');
  await p.fill('input[name="business"]', `Sweep ${stamp}`);
  await p.fill('input[name="email"]', `sweep-${stamp}@design.test`);
  await p.fill('input[name="password"]', 'a-good-password-123');
  await p.check('input[name="consent"]').catch(() => { /* not on every build of the form */ });
  await p.click('button[type="submit"]');
  await p.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
}

/*
  And prove it worked ON A PAGE THAT WOULD SHOW OTHERWISE.

  The first check asked whatever page it happened to land on, which does not carry the look-around
  bar — so it passed while the session was still a visitor. The bar appears on the ORG CHART, so
  that is where this asks.
*/
await p.goto(`${APP}/org`, { waitUntil: 'networkidle' });
const stillLooking = await p.locator('text=Make it mine').count();
if (stillLooking) {
  console.log('FAIL  the business was not claimed — every edit control will be missing from the built side.');
  console.log('      Nothing shot. These pairs would be evidence of the read-only state, not of the product.');
  await b.close();
  process.exit(1);
}
console.log(`  --   ${process.env.SWEEP_EMAIL ? `signed in as ${process.env.SWEEP_EMAIL}` : `claimed the look-around as "Sweep ${stamp}"`} — real numbers, and able to change them.`);

let blank = 0;
for (const [file, route, name] of PAIRS) {
  const res = await p.goto(`${DES}/${encodeURIComponent(file)}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  /*
    A design that did not render is the failure this whole sweep exists to avoid.

    The prototypes need React, which this environment's proxy denies and which is served from disk
    above; when that breaks they render as an empty body, and an empty picture beside a full one
    reads as "the product has too much on it". Every one of them is checked for having drawn
    something before its picture is kept.
  */
  const drew = await p.evaluate(() => document.body.innerText.trim().length);
  /*
    Sixty characters, not two hundred.

    Two hundred was the first guess and it failed the SIGN IN design, which had rendered perfectly —
    it is simply a sparse page: a heading, two fields and a button. A threshold that calls a correct
    page broken is how somebody learns to ignore this line, which is worse than not having it. A
    prototype whose React did not load draws almost nothing at all, so sixty still catches it.
  */
  if (!res?.ok() || drew < 60) {
    console.log(`FAIL  ${file} did not render (HTTP ${res?.status() ?? '?'}, ${drew} characters drawn)`);
    blank++;
  }
  await p.screenshot({ path: `${OUT}/${name}--design.png`, fullPage: true });

  await p.goto(`${APP}${route}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${OUT}/${name}--built.png`, fullPage: true });
  console.log('shot', name);
}
/*
  Sign In, from a browser that has never signed in.

  It is the one screen a signed-in session cannot photograph: visiting it redirects. A second
  context with no cookies is the honest way to see what a customer sees.
*/
{
  const clean = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await realFonts(clean, APP);
  const q = await clean.newPage();
  await q.goto(`${DES}/${encodeURIComponent('SPEC Sign In.dc.html')}`, { waitUntil: 'networkidle' });
  await q.waitForTimeout(2200);
  await q.screenshot({ path: `${OUT}/signin--design.png`, fullPage: true });
  await q.goto(`${APP}/signin`, { waitUntil: 'networkidle' });
  await q.waitForTimeout(700);
  await q.screenshot({ path: `${OUT}/signin--built.png`, fullPage: true });
  await clean.close();
  console.log('shot signin (signed out)');
}

await b.close();
if (blank) {
  console.log(`\n${blank} design(s) did not render. Their pictures are not evidence of anything.`);
  process.exit(1);
}
console.log('\nAll pairs shot. The comparison is a person looking at two pictures — see docs/DESIGN-GAP.md.');
