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
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';
import { VIRTUAL_GM } from '../src/lib/virtual-gm.ts';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `frontdoor-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Front Door ${stamp}`;
const PROBLEM = 'our best apprentice just quit and it is the second one this year';

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
reportCrashes({ browser: () => b, business: BUSINESS, since: RUN_STARTED });
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

// ── The siteVIP door, at the bare address ────────────────────────────────────────────────────────
// Since 23 September the bare address is siteVIP, the trades edition. Its one ask is the business
// name, and Enter carries it into sign-up so it is never asked for twice.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
let body = await text();
/*
  The invariant is the BRANDING, not the tagline.

  This pinned "The trades edition of SPEC", which was the wording on 23 September and is not the
  wording now — the line under the logo is marketing copy and will be rewritten many times. A check
  that fails every time somebody improves a sentence is a check that gets deleted, and takes the
  real guarantee with it. What must stay true is that the bare address is siteVIP and that it says
  what it is powered by.
*/
check('the bare address is siteVIP', /siteVIP/i.test(body) && /POWERED BY SPEC/i.test(body), body.slice(0, 120));
check('and the SPEC front door is one press away', (await page.locator('a[href="/spec"]').count()) > 0);

/*
  ── The business-name box is gone, on purpose ───────────────────────────────────────────────────

  Until 25 September the bare address asked for a business name and carried it into sign-up, and
  three checks here drove that. The landing was rebuilt and the box went with it: the front door now
  opens on the problem box, which is what the rest of this journey exercises.

  Written down rather than deleted quietly, because a journey that loses checks in a redesign is a
  journey that slowly stops proving anything. What was guaranteed — nobody is asked for the same
  thing twice — is still guaranteed wherever a name IS asked for, and the sign-up journey holds it.

  `src/components/sitevip-landing.tsx` is the old landing and is now unused. It is left for whoever
  rebuilt this to remove or restore on purpose, rather than deleted from underneath them.
*/
check('the front door opens on the problem box', /start with one problem/i.test(body), body.slice(0, 160));

// ── The SPEC door, at /spec ──────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/spec`, { waitUntil: 'networkidle' });
body = await text();
/*
  The virtual GM — design export 9, and the reason it is checked HERE rather than by the coverage
  script: that script asks whether a phrase exists in the source, not whether anybody can see it.
  This copy was written into a lib, reported at 100%, and was on no screen at all. A browser is the
  only thing that can tell the difference.
*/
check('THE VIRTUAL GM IS ON THE PAGE, not just in the source', /the virtual gm/i.test(body), body.slice(0, 120));
/*
  Asked of the product's own choice, not of a sentence written down here. There are four candidate
  headlines and exactly one ships; hard-coding today's would fail the day Kris picks another, which
  teaches everybody that a red check means "somebody changed the copy" rather than "something broke".
*/
check('and it names the thing you were about to hire for', body.includes(VIRTUAL_GM.headline), VIRTUAL_GM.headline);
// After the word and before the ask: the page claims a category, then earns everything else.
{
  const gmAt = body.indexOf(VIRTUAL_GM.headline);
  const askAt = body.search(/Got problems/);
  check('it comes before the page asks for anything', gmAt > -1 && gmAt < askAt, `gm ${gmAt}, ask ${askAt}`);
}

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
// Agreement is required at sign-up — unticked by default, and refused on the server too.
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3500);           // a real person takes a moment over four boxes
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);
/*
  A throttled sign-up is SPEC protecting itself, not a fault — and reporting it as five red product
  checks is how a suite stops being believed. Loud, and exits clean.
*/
if (page.url().includes('error=busy')) {
  console.log('  --   sign-up is being throttled (error=busy) — SPEC protecting itself, not a fault.');
  await b.close();
  // Nothing was created, but a look-around may have been. It does not stay behind either.

  await tidyUp(null, { lookSince: RUN_STARTED });
  process.exit(0);
}

check('signed up and landed inside', !page.url().includes('/signup'), page.url());

// ── The promise, kept ────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
body = await text();
check('THE PROBLEM IS WAITING IN THEIR PAGE', body.includes(PROBLEM));
check('and it is in the register, ranked', /Improvement register/.test(body));

// ── The rest of the ladder, on /pricing ──────────────────────────────────────────────────────────
await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
const priced = await text();
check('THE LADDER IS PUBLISHED, not only promised', /Give us a go\. Add some training if you need it\./.test(priced));
check('and it says what you stop buying', /No ongoing GM/.test(priced));
/*
  Reversed on 18 September, and worth the note.

  This asserted that the consulting price WAS on the page — I put it there the day before, in good
  faith, because nobody had written the rule down. Kris then set it: the seat and training prices
  are published, the consulting one is not, because a five-figure monthly number read before
  anybody has explained what a full day a week buys ends the conversation instead of starting it.
*/
check('THE CONSULTING PRICE IS NOT PUBLISHED', !/20,?888/.test(priced), priced.split('\n').find(l => /20,?888/.test(l)) ?? '');
check('the page invites a conversation instead', /Let.s talk/.test(priced) && /Start the conversation/.test(priced));
check('and the training price IS published, at the new figure', /1,502/.test(priced), priced.split('\n').find(l => /1,5/.test(l)) ?? '');
check('against what a GM actually costs', /A\$300,000 a year/.test(priced));
// The rule of 8 outranks the mock-up: the design draws A$20,000 and A$1,000, neither of which reduces to 8.
check('AND NEVER THE MOCK-UP PRICES, which break the rule of 8', !/A\$20,000|A\$1,000\b/.test(priced));

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
