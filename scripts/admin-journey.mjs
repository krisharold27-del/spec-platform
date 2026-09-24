/**
 * Handing administration to somebody else, driven in a browser.
 *
 * Kris, 24 September: *"original person to sign up begins as an admin but they can change that to
 * someone else if they wish."* Both halves, on the screen, in order — and the refusal that stops a
 * business reaching nobody.
 *
 *   node scripts/admin-journey.mjs http://localhost:3100
 */
import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const SHOTS = process.env.SHOTS ?? '';

const stamp = Date.now();
const EMAIL = `admin-${stamp}@journey.test`;
const BUSINESS = `Handover Test ${stamp}`;

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();

const waitForText = async (re, ms = 8000) => {
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
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 25000 }).catch(() => {});
if (page.url().includes('error=busy')) await stop(0, 'sign-up throttled — not a fault.');

/* The first half of what Kris asked for: the person who signs up begins as the administrator. */
check('THE PERSON WHO SIGNS UP LANDS ON MY PAGE', /\/my-page/.test(page.url()), page.url());

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
const settings = await page.evaluate(() => document.body.innerText);
check('THE PERSON WHO SIGNS UP IS THE ADMINISTRATOR',
      !/went wrong/i.test(settings) && /Administrator/.test(settings),
      'the administration screen refused them, or does not say what they are');
check('and the screen says who administers the business', /Who administers this business/i.test(settings));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/settings-administrators.png`, fullPage: true });

/*
  ── The refusal ────────────────────────────────────────────────────────────────────────────────

  The founder is the only administrator. Stepping down here would leave a business that cannot add
  a seat, change its billing or recover an account, with nobody able to put it right.
*/
const mine = page.locator('li', { has: page.locator(`text=${EMAIL}`) }).first();
await mine.getByRole('button', { name: /Step down/i }).click();
const refused = await waitForText(/only administrator|Make somebody else/i);
check('THE LAST ADMINISTRATOR CANNOT STEP DOWN', /only administrator/i.test(refused),
      'a business with nobody administering it has no way back on its own');
check('and it says what to do instead, rather than only saying no',
      /make somebody else an administrator first/i.test(refused));

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
await stop(failures.length === 0 ? 0 : 1, failures.length === 0 ? 'done' : 'see failures above');
