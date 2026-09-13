// The front door, end to end: a stranger with a problem becomes a business with that problem
// already sitting in the middle of its page.
//
// The promise the landing page makes is literal — "your page is waiting, with this problem already
// sitting in the middle of it" — so the last check is the one that matters: after signing up, is
// the thing they typed on the public page actually in their register?
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/frontdoor-journey.mjs

import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `frontdoor-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Front Door ${stamp}`;
const PROBLEM = 'our best apprentice just quit and it is the second one this year';

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await b.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));

let failed = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition || !detail ? '' : `  — ${detail}`}`);
  if (!condition) failed++;
};
const text = () => page.textContent('body').then(t => t ?? '');

// ── The door ─────────────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
let body = await text();
check('the front door asks before it tells', /Got problems\? We.ll fix them\./.test(body));
check('it asks for an ongoing one, not a one-off', /as long as it.s ongoing/i.test(body));
check('the look-around is still offered', (await page.locator('a[href="/look"]').count()) > 0);

// A price is a claim, and the page demonstrates before it claims. Matched on the design's own
// words — the heading was "What it costs" until the landing page was rebuilt to
// designs/SPEC Landing.dc.html, which says "Per seat, per month, in your own currency".
const costAt = body.indexOf('Per seat, per month');
const askAt = body.indexOf('Got problems');
check('the price comes after the question', costAt > askAt, `ask ${askAt}, price ${costAt}`);

// ── Type a real problem ──────────────────────────────────────────────────────────────────────────
await page.fill('textarea', PROBLEM);
await page.click('button[type="submit"]');
await page.waitForSelector('text=What’s really going on', { timeout: 30_000 }).catch(() => {});
body = await text();
check('IT READS THE PROBLEM', /What.s really going on/i.test(body));
check('and finds a causal chain, not just a category', /Safety|People|Earnings|Compliance/.test(body));

// The rule that is never allowed to bend, whoever read it.
const fix = body.match(/The fix — ([^.]+)\./);
if (fix) {
  const order = fix[1];
  const p = order.indexOf('People'), c = order.indexOf('Compliance'), e = order.indexOf('Earnings');
  const ordered = [p, c, e].filter(i => i > -1);
  check('THE FIX IS IN ORDER: People, Compliance, Earnings',
    ordered.every((v, i, a) => i === 0 || a[i - 1] < v), order);
} else {
  // No fix at all is the correct answer when the story names nobody who owns it.
  check('no owner means no invented fix', /Nobody owns this|first job on it|no one owns/i.test(body));
}

check('it asks whether they want this solved', /Would you like to solve some problems/i.test(body));

// ── Yes ──────────────────────────────────────────────────────────────────────────────────────────
await page.click('button:has-text("Yes")');
body = await text();
check('it asks for the business name, and says why', /Your page is waiting, with this problem/i.test(body));

await page.fill('input[aria-label="Business name"]', BUSINESS);
await page.click('button[type="submit"]');
body = await text();
check('it asks who leads the solutions', /Who is the leader of these solutions/i.test(body));
check('and offers the honest way out', /too hard/i.test(body));

// ── Yes, it's me ─────────────────────────────────────────────────────────────────────────────────
await Promise.all([
  page.waitForURL('**/signup**', { timeout: 20_000 }).catch(() => {}),
  page.click('a:has-text("Yes, it’s me")'),
]);
body = await text();
check('sign-up already knows the business', (await page.inputValue('input[name="business"]')) === BUSINESS);
check('and shows them the problem it is keeping', body.includes(PROBLEM));

await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.waitForTimeout(3500);           // the form refuses a submission that is too fast
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);
check('signed up and landed inside', !page.url().includes('/signup'), page.url());

// ── The promise, kept ────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
body = await text();
check('THE PROBLEM IS WAITING IN THEIR PAGE', body.includes(PROBLEM));
check('and it is in the register, ranked', /Improvement register/.test(body));

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
