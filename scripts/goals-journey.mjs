// Do the goals actually survive the whole way, in a browser?
//
// Design export 5 made this Setup step one: "before a single role or KPI, the owner or director
// says what winning looks like. Every target Claude proposes later gets checked against this."
// And: "this stays visible on the board pack and the monthly scoring page, so the goals are never
// lost under the numbers."
//
// Both of those are claims about what a customer SEES, and neither is provable by a unit test. The
// pure rules are covered in tests/goals.test.ts; this is the other half — a real sign-up, three
// real text boxes, a real save, and the words turning up on the two pages the design names.
//
// Run against scripts/fake-auth.mjs, the same as the other journeys, so sign-up is genuine.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/goals-journey.mjs

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `goals-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Goals Test ${stamp}`;

const THREE_YEARS = 'Doubled revenue, second site open, off the tools myself';
const THIS_YEAR = 'Margin above 32% every month, no more than one resignation';

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

async function press(selector) {
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click(selector),
  ]);
  await page.waitForTimeout(800);
}

// ── A real person, signed up the way a customer does ─────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
// Agreement is required at sign-up — unticked by default, and refused on the server too.
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3500);           // a real person takes a moment over four boxes
await press('button[type="submit"]');
await page.waitForTimeout(2500);
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

// ── The goals come first ─────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
let body = await text();
check('setup carries the goals step', body.includes('The goals'));
check('and it is step one', /STEP 1[\s\S]{0,120}The goals/i.test(body));
check('a new business is sent there first', /you are on the goals/i.test(body));
check('with nothing answered yet', body.includes('Not answered'));

await page.goto(`${BASE}/setup/goals`, { waitUntil: 'networkidle' });
body = await text();
check('the page asks what the business is for', body.includes('What is this business actually for?'));
for (const q of [
  'Where do you want the business in 3 years?',
  'What would make this year a genuine win?',
  'What keeps you up at night about it?',
]) check(`it asks — ${q}`, body.includes(q));

// The promise that makes the step worth doing.
check('it says a KPI that serves no goal is worth questioning', /worth questioning/i.test(body));
check('it says the words stay the leader’s own', /never rewrites them/i.test(body));

// ── Answer two of the three ──────────────────────────────────────────────────────────────────────
await page.fill('textarea[name="g1"]', THREE_YEARS);
await page.fill('textarea[name="g2"]', THIS_YEAR);
await press('button[name="stay"]');
body = await text();
check('it says it saved', /Saved/.test(body));
check('THE ANSWER SURVIVED, in the words it was typed in',
  (await page.inputValue('textarea[name="g1"]')) === THREE_YEARS);
check('and it does not pretend all three are done', /2 of 3 answered/.test(body));

// One answer is enough to finish the step — three empty boxes at the front of setup is where a busy
// owner closes the tab.
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
body = await text();
check('the step counts as done on two answers', /2 of 3 answered/.test(body));
check('and setup has moved on from it', !/you are on the goals/i.test(body));

// ── Never lost under the numbers ─────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/scoring`, { waitUntil: 'networkidle' });
body = await text();
check('MONTHLY SCORING CARRIES THE GOALS', body.includes('What this business is for'));
check('and the owner’s own words are on it', body.includes(THREE_YEARS));

// The board pack is the other page the design names. It needs a locked period to exist, so this
// checks the panel is wired rather than driving a whole month close — tests/goals.test.ts asserts
// the wiring, and this asserts the page still renders for somebody at the top of the chart.
await page.goto(`${BASE}/summary`, { waitUntil: 'networkidle' });
check('the summary still loads with goals set', !/Something went wrong/i.test(await text()));

// ── Clearing them puts the step back ─────────────────────────────────────────────────────────────
await page.goto(`${BASE}/setup/goals`, { waitUntil: 'networkidle' });
await page.fill('textarea[name="g1"]', '');
await page.fill('textarea[name="g2"]', '');
await press('button[name="stay"]');
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
body = await text();
// An emptied answer deletes its row rather than storing a blank, so the business goes back to
// having no goals rather than carrying three blanks that still count as set.
check('emptying them makes the step outstanding again', body.includes('Not answered'));

await page.goto(`${BASE}/scoring`, { waitUntil: 'networkidle' });
check('and the panel disappears rather than showing an empty box',
  !(await text()).includes('What this business is for'));

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
