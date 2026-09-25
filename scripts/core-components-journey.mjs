/**
 * The core components are in the menu, and every one of them opens — in a real browser.
 *
 * Kris, 25 September: he could not find the org chart. It worked at /org and nothing led to it.
 * docs/CORE-COMPONENTS.md lists what must always be findable; `tests/core-components.test.ts`
 * holds the menu's code to it. This holds the running product: a brand-new business, signed up
 * the way a customer does, presses each item in the bar and must land on a page that works — at
 * desk size, and with every item still there on a phone.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/core-components-journey.mjs http://localhost:3000
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const stamp = Date.now();
const EMAIL = `core-${stamp}@journey.test`;
const BUSINESS = `Core Test ${stamp}`;

// The table in the doc IS the list — the same rows the unit test reads.
const doc = await readFile(new URL('../docs/CORE-COMPONENTS.md', import.meta.url), 'utf8');
const CORE = [...doc.matchAll(/^\| ([^|]+?) \| ([^|]+?) \| (\/[^|\s]*) \|$/gm)]
  .map(m => ({ component: m[1].trim(), label: m[2].trim(), route: m[3].trim() }));

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
reportCrashes({ browser: () => browser, business: BUSINESS, since: RUN_STARTED });
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

check('THE DOC LISTS THE CORE COMPONENTS', CORE.length >= 13, `${CORE.length} rows`);

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
if (page.url().includes('error=busy')) await stop(0, 'sign-up is being throttled — not a fault.');
if (!/\/(my-page|welcome|setup)/.test(page.url())) await stop(1, `could not sign up (landed on ${page.url()})`);

const bar = p => p.locator('header nav[aria-label="SPEC"]');

// ── Every core component is in the bar, and pressing it opens a working page ─────────────────────
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const labels = (await bar(page).locator('a').allInnerTexts()).map(t => t.trim());
check('ORG CHART IS SECOND IN THE MENU, after My page', labels[0] === 'My page' && labels[1] === 'Org chart', labels.slice(0, 3).join(', '));

for (const c of CORE) {
  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  const link = bar(page).getByRole('link', { name: c.label, exact: true });
  const href = await link.first().getAttribute('href').catch(() => null);
  check(`${c.component.toUpperCase()} IS IN THE MENU as "${c.label}"`, href === c.route, `href ${href}`);
  if (href !== c.route) continue;
  const errors = [];
  const onError = e => errors.push(String(e).slice(0, 120));
  page.on('pageerror', onError);
  const response = page.waitForResponse(r => r.request().isNavigationRequest(), { timeout: 15000 }).catch(() => null);
  await link.first().click();
  const r = await response;
  await page.waitForLoadState('networkidle').catch(() => {});
  page.off('pageerror', onError);
  const body = await page.evaluate(() => document.body.innerText);
  const bad = /Something went wrong on our end|This page did not load|There is no page at that address/i.test(body) || body.trim().length < 40;
  check(`  and it opens (${c.route} → ${page.url().replace(BASE, '')})`, !bad && (r?.status() ?? 200) < 400 && errors.length === 0,
    `status ${r?.status()} ${errors.join(' | ')} ${bad ? 'error page' : ''}`);
}

// ── The org chart door on the pages people open most ────────────────────────────────────────────
for (const path of ['/my-page', '/people', '/virtual-gm', '/setup']) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const door = page.locator('[data-org-chart-door]');
  check(`${path} LINKS TO THE ORG CHART`, (await door.count()) > 0 && (await door.first().getAttribute('href')) === '/org');
}

// ── All pages is a real list, not My Page ────────────────────────────────────────────────────────
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
await bar(page).getByRole('link', { name: 'All pages', exact: true }).click();
// A client-side navigation: wait for the address to change rather than for the network to settle.
await page.waitForURL(u => u.pathname === '/pages', { timeout: 15000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
const listed = await page.locator('[data-all-pages-count] ~ div a[href="/org"]').count();
check('ALL PAGES OPENS ITS OWN LIST', new URL(page.url()).pathname === '/pages', page.url());
check('  and the org chart is in it', listed > 0);

// ── On a phone, every item is still there and the bar does not slide sideways ────────────────────
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.addCookies(await context.cookies());
const small = await phone.newPage();
await small.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const phoneLabels = (await bar(small).locator('a').allInnerTexts()).map(t => t.trim());
const missing = CORE.filter(c => !phoneLabels.includes(c.label)).map(c => c.label);
check('EVERY CORE ITEM IS IN THE MENU ON A PHONE', missing.length === 0, missing.join(', '));
const over = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('  and the bar wraps rather than sliding sideways', over <= 1, `${over}px over`);

await browser.close();
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });
console.log(failures.length ? `\n${failures.length} failed` : '\nEvery core component is in the menu and opens.');
process.exit(failures.length ? 1 : 0);
