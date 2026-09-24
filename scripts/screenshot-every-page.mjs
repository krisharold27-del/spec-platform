/**
 * A picture of every page in SPEC, signed in as a real business.
 *
 * Not a check — a record. Kris asked to see each page against the handoff README, and a tick list
 * that says "done" with nothing to look at is the kind of claim this repo has learned not to make.
 *
 *   node scripts/screenshot-every-page.mjs http://localhost:3100 /where/to/put/them
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const OUT = process.argv[3] ?? '/tmp/shots';
const CHROME = process.env.CHROME_PATH;

mkdirSync(OUT, { recursive: true });

const stamp = Date.now();
const EMAIL = `shots-${stamp}@journey.test`;
const BUSINESS = `JBI Electrical ${stamp}`;

/* Every page a signed-in person can reach, in the order the nav and the directory put them. */
const PAGES = [
  ['landing', '/'],
  ['pricing-public', '/pricing'],
  ['my-page', '/my-page'],
  ['jobs', '/jobs'],
  ['crm', '/crm'],
  ['clients', '/clients'],
  ['org-chart', '/org'],
  ['people', '/people'],
  ['safety', '/safety'],
  ['safety-incidents', '/safety?tab=incidents'],
  ['safety-hazards', '/safety?tab=hazards'],
  ['safety-onsite', '/safety?tab=site'],
  ['safety-clear', '/safety?tab=clear'],
  ['coverage', '/coverage'],
  ['tech-day', '/tech-day'],
  ['training', '/training'],
  ['scoring', '/scoring'],
  ['my-scorecard', '/me'],
  ['team-rollup', '/team'],
  ['summary', '/summary'],
  ['inbox', '/inbox'],
  ['meeting', '/meeting'],
  ['board-pack', '/board'],
  ['mirrors', '/mirrors'],
  ['connections', '/connections'],
  ['setup', '/setup'],
  ['billing', '/billing'],
  ['settings', '/settings'],
  ['group', '/group'],
  ['curve', '/curve'],
  ['charter', '/charter'],
  ['status', '/status'],
  ['help', '/help'],
  ['site-mobile', '/site'],
];

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();

const broken = [];
page.on('pageerror', e => broken.push(String(e).slice(0, 120)));

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 25000 }).catch(() => {});
console.log(`signed up as ${BUSINESS}, landed on ${page.url()}`);

/* A little real data, so the pages are not all empty states. */
await page.goto(`${BASE}/safety`, { waitUntil: 'networkidle' }).catch(() => {});
for (const [kind, text] of [
  ['Hazard', 'Exposed cable at the Level 3 riser'],
  ['Near miss', 'Ladder slipped on the wet slab, nobody hurt'],
  ['Someone got hurt', 'Apprentice fell from the scaffold, ambulance called, suspected fracture'],
]) {
  await page.getByRole('radio', { name: kind, exact: true }).click().catch(() => {});
  const box = page.getByLabel('Describe what happened');
  await box.fill(text).catch(() => {});
  await box.press('Enter').catch(() => {});
  await page.waitForTimeout(900);
}

const results = [];
for (const [name, path] of PAGES) {
  broken.length = 0;
  let status = 'ok';
  try {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    const text = await page.evaluate(() => document.body.innerText);
    if (/This page did not load|went wrong on our end|Application error/i.test(text)) status = 'CRASHED';
    else if ((res?.status() ?? 0) >= 400) status = `HTTP ${res.status()}`;
    else if (page.url().includes('/signin')) status = 'sent to sign-in';
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  } catch (e) {
    status = `failed: ${String(e).slice(0, 80)}`;
  }
  if (broken.length) status += ` (console: ${broken[0]})`;
  results.push([name, path, status]);
  console.log(`${status === 'ok' ? '  ok  ' : ' !!!! '} ${name.padEnd(20)} ${path.padEnd(24)} ${status}`);
}

console.log(`\n${results.filter(r => r[2] !== 'ok').length} of ${results.length} pages are not clean.`);
await browser.close();
