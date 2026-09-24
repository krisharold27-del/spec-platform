/**
 * Recording something that has to stay current, and it stopping work when it lapses.
 *
 * Kris's design of 24 September: *"Every licence, policy, certificate, contract and audit in one
 * place. SPEC warns 60 days before anything lapses, and anything that lapses stops the work it
 * covers."*
 *
 * The checks that matter are the two that are easy to get backwards: an EMPTY page must not read as
 * a clean bill of health, and the two areas SPEC already holds must be READ rather than copied.
 *
 *   node scripts/compliance-journey.mjs http://localhost:3100
 */
import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const SHOTS = process.env.SHOTS ?? '';

const stamp = Date.now();
const BUSINESS = `Compliance Test ${stamp}`;
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
const faults = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 140)));

const waitForText = async (re, ms = 9000) => {
  const until = Date.now() + ms;
  let t = '';
  while (Date.now() < until) {
    t = await page.evaluate(() => document.body.innerText);
    if (re.test(t)) return t;
    await page.waitForTimeout(200);
  }
  return t;
};

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', `compliance-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 25000 }).catch(() => {});
if (page.url().includes('error=busy')) await stop(0, 'sign-up throttled — not a fault.');

await page.goto(`${BASE}/compliance`, { waitUntil: 'networkidle' });
const empty = await page.evaluate(() => document.body.innerText);
check('COMPLIANCE OPENS on a brand new business', !/went wrong|did not load/i.test(empty),
      empty.slice(0, 140).replace(/\n/g, ' '));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/compliance-empty.png`, fullPage: true });

/*
  ── The most misleading thing this page could say ──────────────────────────────────────────────

  An empty Compliance page counts zero things stopping work and zero breaches, which reads as a
  clean bill of health and is actually a business that has told SPEC nothing.
*/
check('AN EMPTY PAGE DOES NOT READ AS A CLEAN BILL OF HEALTH',
      /cannot tell you that you are compliant/i.test(empty),
      'zero stopping work and zero breaches is what an empty register looks like too');

check('it is on the nav bar', (await page.locator('nav a', { hasText: /^Compliance$/ }).count()) > 0);

/* All six areas the design names. */
for (const t of ['Licences & tickets', 'Insurance', 'Certificates', 'Audits', 'Contracts & award', 'Breaches & actions']) {
  check(`the ${t} area is there`, empty.includes(t));
}

/*
  ── The two areas SPEC already holds are READ, not copied ──────────────────────────────────────

  A second copy of a licence is the thing that makes both pages untrustworthy the day they disagree.
*/
check('LICENCES SAY THEY ARE READ FROM PEOPLE, and link there',
      /Read from People/i.test(empty)
      && (await page.locator('a[href="/people#clear-to-work"]').count()) > 0,
      'a second copy of Clear to Work is one copy too many');
check('and licences cannot be added here',
      (await page.locator('form input[name="title"]').count()) === 0,
      'the only place to add one is where it already lives');

await page.goto(`${BASE}/compliance?tab=breaches`, { waitUntil: 'networkidle' });
const breaches = await page.evaluate(() => document.body.innerText);
check('BREACHES ARE READ FROM SAFETY, and link there',
      /Read from Safety/i.test(breaches)
      && (await page.locator('a[href="/safety"]').count()) > 0);

/* ── The four it does hold ─────────────────────────────────────────────────────────────────── */
await page.goto(`${BASE}/compliance?tab=insurance`, { waitUntil: 'networkidle' });
check('AN AREA SPEC HOLDS ITSELF CAN BE ADDED TO',
      (await page.locator('form input[name="title"]').count()) > 0);

const lapsed = '2020-01-01';
await page.fill('form input[name="title"]', 'JBI public liability, $20m');
await page.fill('form input[name="covers"]', 'The business');
await page.fill('form input[name="expiresAt"]', lapsed);
await page.locator('form', { has: page.locator('input[name="title"]') }).locator('button[type="submit"]').click();

const added = await waitForText(/JBI public liability/);
check('a policy can be recorded', /JBI public liability/.test(added), added.slice(0, 200).replace(/\n/g, ' '));

/*
  The sentence the whole page turns on: "anything that lapses stops the work it covers." A policy
  that expired in 2020 has to read as stopping work, and has to be counted at the top.
*/
check('A LAPSED POLICY READS AS STOPPING WORK', /Stopping work/.test(added),
      'the page says a lapse stops the work it covers — the row has to agree');
check('and it is counted in the headline', /things? (is|are) stopping work right now/i.test(added),
      'a count that does not move is a count nobody trusts');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/compliance-lapsed.png`, fullPage: true });

/* Renewing it has to clear the alarm, or nobody will use the button twice. */
const future = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
const renew = page.locator('form', { has: page.locator('input[name="expiresAt"][required]') }).first();
await renew.locator('input[name="expiresAt"]').fill(future);
await renew.locator('button[type="submit"]').click();
/*
  Wait for the HEADLINE, and nothing looser. An earlier version of this line also accepted the word
  "Current" — which is the permanent label on the first stat tile, so the wait returned on its first
  poll, before the write had landed, and reported a failure that was really a race.
*/
const renewed = await waitForText(/Everything recorded is current/i);
check('RENEWING IT CLEARS THE ALARM', /Everything recorded is current/i.test(renewed),
      renewed.slice(0, 200).replace(/\n/g, ' '));

check('no page crashed while doing any of it', faults.length === 0, faults.join(' | '));

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
await stop(failures.length === 0 ? 0 : 1, failures.length === 0 ? 'done' : 'see failures above');
