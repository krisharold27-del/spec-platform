/**
 * The navigation bar, and the virtual GM's eight landing on a business that already existed.
 *
 * Kris, 18 September, looking at the product beside the designs: *"yes put the new kpis on jbi and
 * keep the nav bar"*.
 *
 * ── Why both are in one journey ──────────────────────────────────────────────────────────────────
 *
 * They are the same decision seen twice. The bar is navigation the product had deliberately removed
 * and the designs never stopped carrying; the eight KPIs are a scorecard the product started giving
 * new businesses and had no way to give an existing one. In each case the thing that matters is not
 * that the code exists — it is that a person opening SPEC can SEE it and PRESS it.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/nav-journey.mjs http://localhost:3100
 */

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `nav-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Nav Test ${stamp}`;

/** Verbatim from every design screen's header. */
const BAR = ['My page', 'Org chart', 'Scoring', 'Board pack', 'Boards', 'Connections'];

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const faults = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 160)));

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
if (page.url().includes('error=busy')) await stop(0, 'sign-up is being throttled — not a fault.');
if (!/\/(my-page|welcome|setup)/.test(page.url())) await stop(1, `could not sign up (landed on ${page.url()})`);

// ── The bar is on every screen, not just the one it was built on ─────────────────────────────────
const bar = () => page.locator('header nav[aria-label="SPEC"]');
const barLabels = async () => (await bar().locator('a').allInnerTexts()).map(t => t.trim());

for (const path of ['/my-page', '/org', '/scoring', '/boards', '/connections', '/people', '/setup/kpis']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const labels = await barLabels().catch(() => []);
  check(`THE BAR IS ON ${path}`, BAR.every(l => labels.includes(l)), labels.join(', '));
}

// ── And every item goes somewhere real ───────────────────────────────────────────────────────────
//
// The failure that made the old dropdown worth deleting was items pointing at nothing. Pressed
// rather than read: a link whose href exists is not the same claim as a page that opens.
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const broken = [];
for (const label of BAR) {
  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  await bar().getByRole('link', { name: label, exact: true }).click();
  await page.waitForLoadState('networkidle').catch(() => {});
  const body = await page.evaluate(() => document.body.innerText);
  if (/Something went wrong on our end/i.test(body) || body.trim().length < 40) {
    broken.push(`${label} → ${page.url().replace(BASE, '')}`);
  }
}
check('EVERY ITEM OPENS A PAGE, not a fault', broken.length === 0, broken.join(' | '));

/*
  Board pack is the one that had no address at all. The pack lives at /board/[periodId] and was
  reachable only from a link at the bottom of Executive summary once a month had closed — fine as a
  route, useless as a menu item. A business on its first day has closed nothing, so the honest
  landing is Executive summary rather than a dead end.
*/
await page.goto(`${BASE}/board`, { waitUntil: 'networkidle' });
check(
  'BOARD PACK LANDS SOMEWHERE HONEST BEFORE ANY MONTH HAS CLOSED',
  /\/summary/.test(page.url()),
  page.url().replace(BASE, ''),
);

// ── It fits a phone, because the bar is the thing most likely to slide sideways ──────────────────
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const small = await phone.newPage();
await small.context().addCookies(await context.cookies());
await small.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const over = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('THE BAR WRAPS ON A PHONE rather than sliding sideways', over <= 1, `${over}px over`);
const tiny = await small.evaluate(() =>
  [...document.querySelectorAll('header nav a')].filter(a => a.getBoundingClientRect().height < 24).length);
check('  and nothing in it is under 24px to press', tiny === 0, `${tiny} too small`);

// ── The virtual GM's eight, onto a business that already has a scorecard ─────────────────────────
await page.goto(`${BASE}/setup/kpis`, { waitUntil: 'networkidle' });
const load = page.getByRole('button', { name: /Load the virtual GM/ });
check('THE TOP ROLE IS OFFERED THE VIRTUAL GM’S EIGHT', await load.count() > 0);

if (await load.count()) {
  await load.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  /*
    Read out of the BOXES, not off the page.

    `document.body.innerText` does not include what is in an input, so the first version of this
    check failed on six of the seven — and passed the seventh for the wrong reason, because "fit for
    purpose" also appears in the help line under the button. A check that can pass on its own
    explanatory text is not checking anything.
  */
  const text = (await page.locator('input[name$=":text"]').evaluateAll(
    els => els.map(e => e.value).join('\n'),
  ));
  /*
    The words Kris wrote, checked one pillar at a time. Safety was already right before today; the
    other six were generic template lines, which is the whole reason this exists.
  */
  for (const [pillar, phrase] of [
    ['Safety', 'Zero workers compensation'],
    ['People', 'checked against the org chart'],
    ['People', 'culture nobody wants to leave'],
    ['Earnings', 'The business is profitable'],
    ['Earnings', 'fit for purpose'],
    ['Compliance', 'Every client contract understood'],
    ['Compliance', 'do what they said they would'],
  ]) {
    check(`  ${pillar}: "${phrase}"`, text.includes(phrase));
  }
}

// ── Two per pillar is a foundation, not a cap ────────────────────────────────────────────────────
//
// The screen padded to two blank rows and stopped, so a pillar holding its two had nowhere to type
// a third. Counted on the page rather than read off the code: the point is a box to type in.
const rows = await page.locator('input[name$=":text"]').count();
check('EVERY PILLAR HAS A SPARE ROW — two is a foundation, not a cap', rows >= 12, `${rows} criterion boxes for 4 pillars`);

// ── The first seat is free AND whole ─────────────────────────────────────────────────────────────
//
// Kris: "the first seat should have all tools working - then when adding another staff member the
// $26 seat cost kicks in". The money half was already right — the meter starts at the second person.
// The tools half was not: a new business landed on Basic, so the one screen that has to argue for
// the product carried an upsell strip and an Ask box saying asking comes with Advanced.
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const myPage = await page.evaluate(() => document.body.innerText);
check('NO UPSELL STRIP ON THE FIRST PERSON\u2019S PAGE', !/On Advanced you can ask/.test(myPage));
check('  and nothing says asking comes with Advanced', !/Asking comes with SPEC Advanced/.test(myPage));
/*
  The Ask box, on day one, before anything has been marked.

  My Page held the whole two-column dashboard back until one pillar had a score — right for an Ace
  run with no closed month, wrong for this. It is the box the brief calls the do-anything box, where
  somebody types "connect me to Xero", so hiding it until after they had started hid the one tool
  that could have helped them start.
*/
check('THE ASK BOX IS THERE ON DAY ONE, before anything is marked', /Ask anything/.test(myPage));

// ── There is one SPEC ────────────────────────────────────────────────────────────────────────────
//
// Kris: "take away the basic and advanced". Swept across every screen rather than checked on the
// one it was removed from, because the tier reached nineteen files and the way copy like this
// survives is on the page nobody thought to look at.
const tierWords = [];
for (const path of ['/my-page', '/connections', '/settings', '/setup', '/curve', '/pricing', '/journey']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const body = await page.evaluate(() => document.body.innerText);
  const hit = body.match(/SPEC Basic|SPEC Advanced|power of AI|What Advanced adds|Asking comes with/);
  if (hit) tierWords.push(`${path}: ${hit[0]}`);
}
check('NO SCREEN STILL OFFERS A TIER', tierWords.length === 0, tierWords.join(' | '));

/*
  Connections is the one that mattered most. A business on Basic opened it and was shown a wall
  explaining it could not connect anything, with a link to change tiers — the product's central
  feature taken away, for no difference in price.
*/
await page.goto(`${BASE}/connections`, { waitUntil: 'networkidle' });
const conn = await page.evaluate(() => document.body.innerText);
check('CONNECTIONS IS OPEN, not a wall with a price behind it', !/Change it in settings/.test(conn), conn.slice(0, 120));

check('no page threw', faults.length === 0, faults.join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.');
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
process.exit(failures.length ? 1 : 0);
