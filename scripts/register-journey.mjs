// Does the improvement register actually work, end to end, in a browser?
//
// Not "does the page render" — does a problem typed in plain words survive the whole way: read and
// diagnosed, ranked into the list, given an owner, accepted, marked done, and signed off. Every
// step below is the real shipping code path against a real database.
//
// Run against scripts/fake-auth.mjs, the same as scripts/journey.mjs, so sign-up is genuine.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/register-journey.mjs

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
// In CI, `playwright install` puts chromium where the library looks by default, so let it find
// its own. CHROME_PATH is for a machine that has one somewhere else — this container, for one.
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `register-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Register Test ${stamp}`;
const PROBLEM = 'the yard is a mess every Monday morning and the crew lose an hour finding gear';

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

/** A server action redirects after it writes; waiting for the load is what makes this honest. */
async function press(selector) {
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click(selector),
  ]);
  await page.waitForTimeout(600);
}

// ── A real person, signed up the way a customer does ─────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Dane Whitmore');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
// Agreement is required at sign-up — unticked by default, and refused on the server too.
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3500);           // a real person takes a moment over four boxes
await press('button[type="submit"]');
await page.waitForTimeout(2500);
check('signed up and landed inside', !page.url().includes('/signup'), page.url());

await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
/*
  Asked for what the page IS, not for a phrase it used to carry.

  This read `/your page|Good morning/`, which was the old subtitle. My Page took the design's own
  header on 18 September — the person's name, their role, and "YOUR SPEC SHEET FOR THE DAY" — and
  this check went red on CI for two commits while the page was working perfectly. Exactly the fault
  the org chart's "Team of" check had: a browser check that asserts yesterday's wording reports a
  product fault every time the product is improved, and reports nothing at all when it breaks.

  Both branches are named: a business with a period open gets the design's header, one without gets
  the greeting. Either is a page that loaded.
*/
check(
  'My page loads',
  /your spec sheet for the day|your page|Good morning/i.test(await text()),
);
check('  and it says whose page it is', (await text()).includes('Dane Whitmore'));
check('the improvement box is on it', (await text()).includes('Improvement opportunity'));
check('the register starts empty and says so', /Nothing logged yet/i.test(await text()));

// ── Log a problem in plain words ─────────────────────────────────────────────────────────────────
await page.fill('textarea[name="text"]', PROBLEM);
await press('button:has-text("Log it")');
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
let body = await text();
check('THE PROBLEM IS LOGGED, in the words it was typed in', body.includes(PROBLEM));
check('it was read, not just stored', /Harm — act now|Losing money|Losing people|Everything else/.test(body));

// The single most important line the register produces.
check('nobody owns it yet, and it says whose job that is', /Nobody owns this yet/i.test(body));

// ── Give it an owner ─────────────────────────────────────────────────────────────────────────────
const ownerSelect = page.locator('select[name="owner"]').first();
const hasOwnerPicker = await ownerSelect.count() > 0;
check('it offers somebody to own it', hasOwnerPicker);
if (hasOwnerPicker) {
  await ownerSelect.selectOption({ index: 1 });
  await press('button:has-text("Assign")');
  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  body = await text();
  check('ASSIGNED, and not accepted on the owner’s behalf', /not accepted yet/i.test(body));
}

// ── Accept it ────────────────────────────────────────────────────────────────────────────────────
if (await page.locator('button:has-text("Accept")').count()) {
  await press('button:has-text("Accept")');
  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  body = await text();
  check('ACCEPTED — it now has a named owner', /owns it\./i.test(body));
}

// ── Mark it done ─────────────────────────────────────────────────────────────────────────────────
if (await page.locator('button:has-text("Mark done")').count()) {
  await press('button:has-text("Mark done")');
  await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
  body = await text();
  check('MARKED DONE — waiting on the weekly meeting', /waiting to be signed off/i.test(body));
  // One person deciding their own work is finished is how a register fills with things that were
  // never actually fixed. The owner must not be offered the sign-off on their own entry.
  check('the owner cannot sign off their own work', /Somebody else signs this off/i.test(body));
}

// ── The same problem, raised again ───────────────────────────────────────────────────────────────
await page.fill('textarea[name="text"]', 'the yard is a mess again on Mondays, gear everywhere');
await press('button:has-text("Log it")');
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
body = await text();
check('RAISED AGAIN counts up rather than adding a second row', /Raised 2×/.test(body));
// Counted on the list itself, not the page text — the textarea's placeholder uses the same words,
// so a body-wide count matches twice and would have failed a working product.
const rows = await page.locator('section:has-text("Improvement register") li').count();
check('and it is still one entry', rows === 1, `${rows} rows in the register`);

// ── A BEAUTIFULLY SIMPLE START ───────────────────────────────────────────────────────────────────
//
// Kris, 16 September, looking at the page a brand-new business meets: "they are here because
// problems are overwhelming them — if we make it too much info then that's another problem they
// don't understand which will make them quit — we need a beautifully simple start".
//
// It was five thousand pixels. Twenty blocks, four identical grey cards reading "Not measured yet",
// a week with nothing in it, a training path with nothing on it, a mail block for mail nobody has
// connected. Every one correct, every one empty.
//
// So the first visit holds those back, and this checks BOTH halves of that — absent while empty,
// and back the moment there is something in them. Only asserting the second half would let the page
// creep back to twenty blocks; only asserting the first would let a section vanish for good.
await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
body = await text();

for (const [label, pattern] of [
  ['the four pillars are still named', /Safety[\s\S]*People[\s\S]*Earnings[\s\S]*Compliance/],
  ['the problem box they came for', /Improvement opportunity/],
  ['where they sit', /Where you sit/],
  ['what to do today', /What needs me today/],
  ['it closes the day', /That is the whole day\. Nothing else to open\./],
  ['and every door is still reachable', /Everywhere else in SPEC/],
]) {
  check(`first visit keeps — ${label}`, pattern.test(body));
}

for (const [label, pattern] of [
  ['a week with nothing in it', /My week/],
  ['a training path with nothing on it', /My training/],
  ['a mail block for mail nobody connected', /Mail and the tasks it created/],
  ['changes nobody has made yet', /Changes you should know about/],
]) {
  check(`first visit holds back — ${label}`, !pattern.test(body));
}

check(
  'and it is a page somebody can actually take in',
  (await page.evaluate(() => document.body.scrollHeight)) < 4200,
  `${await page.evaluate(() => document.body.scrollHeight)}px`,
);

// The other half — that these sections come BACK once there is something in them — is checked in
// scripts/journey.mjs, on the look-around business, which has real history in it. A mark needs an
// open period and a row per criterion, and faking that here would be testing the fixture rather
// than the product.

// The visibility rule, said plainly rather than left to be discovered.
check('it states who can see your card', /cannot see theirs|top of the chart/i.test(body));

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
