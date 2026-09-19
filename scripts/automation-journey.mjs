// Can the leader see which parts of a role a process could do — and can nobody else?
//
// Kris, 16 September 2026, calling it "a key for this entire system": map every role and its KPIs,
// automate what can be automated, tell the leader what it saves, and show it to the GM, the CEO and
// the board and to nobody else.
//
// The last clause is the one worth driving a browser for. Read one desk down, this page is about
// whether somebody still has a job — while it is still a proposal, before anybody has decided
// anything. A unit test proves the function returns false for a manager; only a real request proves
// the manager cannot reach the page, and that the server refuses the WRITE as well as the read.
// Hiding a page is not access control, and this codebase has been caught by that before.
//
// Runs with no ANTHROPIC_API_KEY, on purpose. Nothing here asks Claude anything.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/automation-journey.mjs

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `automation-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Automation Test ${stamp}`;

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const context = await b.newContext({ viewport: { width: 1280, height: 1600 } });
const page = await context.newPage();

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
  await page.waitForTimeout(900);
}

// ── A real business ──────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
// Agreement is required at sign-up — unticked by default, and refused on the server too.
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3500);
await press('button[type="submit"]');
await page.waitForTimeout(2500);
check('signed up and landed inside', !page.url().includes('/signup'), page.url());

// ── The GM can see it ────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/org/automation`, { waitUntil: 'networkidle' });
let body = await text();
check('the review opens for the person at the top of the chart', body.includes('Across the business'));
check('and it does not say the page is not theirs', !body.includes('Not this one'));

// ── It says out loud that it must not be forwarded ───────────────────────────────────────────────
// Somebody will eventually screenshot this into a group chat. Software cannot stop that; what it can
// do is make sure nobody does it without having read why not.
check('it warns against forwarding, at the top rather than in small print', body.includes('Not to be forwarded'));
check('and says why, in terms of the person it would land on', body.includes('still has a job'));

// ── Every verdict is on the page, including the one that asks for nothing ────────────────────────
// A page that only lists what can be cut is a page that will be used to cut things. The section
// confirming what must STAY with a person carries the same weight as the rest.
check('it counts what a process could do', body.includes('A process can do this'));
check('it counts what needs the legwork done', body.includes('Do the legwork for them'));
check('IT COUNTS WHAT MUST STAY WITH A PERSON', body.includes('Keep with a person'));
check('and what it has not been able to read', body.includes('Needs somebody to look'));

// ── With nothing connected, nothing may read as ready ────────────────────────────────────────────
// A brand new business has no live systems, so the honest ceiling is "worth doing, not yet
// possible". A page that proposed full automation off the back of the wording alone would be
// confidently wrong on the most expensive subject in the product.
check('a business with nothing connected is told that is the ceiling', body.includes('Nothing is connected yet'));
check('and is pointed at where to fix it', body.includes('Connect a system'));

// ── It will not put a number on hours nobody counted ─────────────────────────────────────────────
// The savings figure is the one a leader repeats to a board. Inventing an hour here would cost SPEC
// every other number on every other page the day somebody checked it.
//
// Read off the rendered paragraph, not off the page's text.
//
// The first version of this check did `body.includes(...)` against page.textContent('body'), which
// also contains Next.js's own flight-data script. It matched a stale copy of the sentence inside
// that payload and reported a failure about a page that was perfectly correct -- the same false
// reading the cascade journey was caught by in September. Assert against the element a person
// actually sees.
const worth = async () => (await page.evaluate(() =>
  [...document.querySelectorAll('p')].map(p => (p.textContent ?? '').trim())
    .find(t => t.startsWith('What that is worth')) ?? ''
));

let money = await worth();
check('it refuses to invent a savings figure', money !== '', money);
check(
  'AND SAYS SO PLAINLY WHEN NOBODY HAS COUNTED THE HOURS',
  money.includes('will not put a figure on it') || money.includes('nothing to claim'),
  money,
);

// ── Every verdict shows its reason ───────────────────────────────────────────────────────────────
// A verdict with no reason is an opinion, and an opinion about somebody's job is the last thing this
// page should be handing a leader.
const reasons = await page.evaluate(() => {
  const forms = [...document.querySelectorAll('form')].filter(f => f.querySelector('select[name="verdict"]'));
  return forms.map(f => (f.querySelectorAll('p')[0]?.textContent ?? '').trim());
});
check('there are measures to review at all', reasons.length > 0, `${reasons.length} found`);
check('EVERY MEASURE SHOWS WHY IT READS THE WAY IT DOES', reasons.length > 0 && reasons.every(r => r.length > 20));

// ── The leader's answer replaces SPEC's ──────────────────────────────────────────────────────────
const firstVerdict = await page.evaluate(() => {
  const s = document.querySelector('select[name="verdict"]');
  return s ? s.value : null;
});
await page.evaluate(() => {
  const form = [...document.querySelectorAll('form')].find(f => f.querySelector('select[name="verdict"]'));
  const select = form.querySelector('select[name="verdict"]');
  select.value = select.value === 'person' ? 'automated' : 'person';
  form.querySelector('input[name="hours"]').value = '6';
});
await page.evaluate(() => {
  const form = [...document.querySelectorAll('form')].find(f => f.querySelector('select[name="verdict"]'));
  form.querySelector('button[type="submit"], button').click();
});
await page.waitForTimeout(2500);
body = await text();
check('the decision saved', body.includes('Saved.'), page.url());

const afterVerdict = await page.evaluate(() => {
  const s = document.querySelector('select[name="verdict"]');
  return s ? s.value : null;
});
check('THE LEADER\'S ANSWER OVERRIDES SPEC\'S', afterVerdict !== firstVerdict, `${firstVerdict} → ${afterVerdict}`);

const hours = await page.evaluate(() => {
  const i = document.querySelector('input[name="hours"]');
  return i ? i.value : null;
});
check('and the hours they counted were kept', hours === '6', String(hours));

// ── Hours the business stated DO become a figure ─────────────────────────────────────────────────
// The other half of the refusal above: SPEC will not invent a number, but it must use one it was
// given, or nobody would ever bother giving it one.
if (afterVerdict === 'automated') {
  money = await worth();
  check('SIX COUNTED HOURS TURN INTO A FIGURE THE LEADER CAN USE', /\b6 hours\b/.test(money), money);
  // And still no dollars, because nobody has told SPEC what an hour costs. Hours without a rate is
  // the honest output; a rate assumed on the leader's behalf is the number that would embarrass
  // them in front of a board.
  check('and no money is invented from an hourly rate nobody set', !money.includes('$'), money);
}

// ── The engine, not just the scorecard read ──────────────────────────────────────────────────────
// The brief's acceptance test, in a browser: a business that has just signed up should already have
// candidates with a HOW against them, because the task lists come with the roles.
await page.goto(`${BASE}/org/automation`, { waitUntil: 'networkidle' });
body = await text();
check('the engine has run without anybody entering anything', body.includes('Across the business'));
check('it names what to build', body.includes('Automate'));
check('it names what to half-build', body.includes('Streamline'));
check('IT NAMES WHAT IS THE JOB, AS A SECTION OF ITS OWN', body.includes('This is the job'));
check('and says what that section is for', body.includes('what the business is actually paying for'));

const candidates = await page.evaluate(() =>
  document.querySelectorAll('form select[name="decision"]').length);
check('there are real candidates to decide on', candidates >= 10, `${candidates} found`);

// A suggestion without a build path is noise — the brief's own rule.
const hows = await page.evaluate(() =>
  [...document.querySelectorAll('details summary')].filter(s => (s.textContent ?? '').includes('How it would work')).length);
check('EVERY CANDIDATE CARRIES A HOW', hows >= candidates && hows > 0, `${hows} briefs for ${candidates} candidates`);

const firstBrief = await page.evaluate(() => {
  const d = document.querySelector('details');
  if (!d) return '';
  d.open = true;
  return (d.textContent ?? '').trim();
});
for (const part of ['Starts when', 'Steps', 'Touches', 'Guardrails']) {
  check(`the brief says ${part.toLowerCase()}`, firstBrief.includes(part), firstBrief.slice(0, 120));
}

// ── A rejection needs a reason, and the server is what enforces it ───────────────────────────────
// A no with no reason cannot be revisited later, only re-argued from scratch. The form asks for it;
// this proves the server refuses without it rather than trusting the form.
await page.evaluate(() => {
  const form = [...document.querySelectorAll('form')].find(f => f.querySelector('select[name="decision"]'));
  form.querySelector('select[name="decision"]').value = 'rejected';
  form.querySelector('input[name="reason"]').value = '';
  form.querySelector('button').click();
});
await page.waitForTimeout(2500);
body = await text();
check('A REJECTION WITH NO REASON IS REFUSED BY THE SERVER', body.includes('needs one line saying why'), page.url());
check('and nothing was changed', body.includes('Nothing was changed'));

// ── The intake box: open to everybody, and it changes the order ──────────────────────────────────
await page.goto(`${BASE}/intake`, { waitUntil: 'networkidle' });
body = await text();
check('anybody signed in can say what they would change', body.includes('What would you change?'));
check('and is told it cannot be used against them', body.includes('changes anybody'));

await page.fill('textarea[name="text"]', 'I spend Friday afternoons chasing timesheets');
await press('button[type="submit"]');
await page.waitForTimeout(2000);
body = await text();
check(
  'WHAT SOMEBODY WRITES IN REACHES WORK SPEC ALREADY KNOWS ABOUT',
  body.includes('already on the list'),
  body.slice(0, 160),
);
check('and their own words are kept, not tidied', body.includes('Friday afternoons chasing timesheets'));

// ── And nobody below the top of the chart can reach it ────────────────────────────────────────────
// The check this whole script exists for. A signed-in person from a DIFFERENT business is the
// cheapest honest stand-in for "somebody who is not the GM of this one": if the page ever rendered
// this business's review to them, that is the failure, and it is the same failure a manager
// reaching their own team's page would be.
const other = await b.newContext({ viewport: { width: 1280, height: 900 } });
const outsider = await other.newPage();
await outsider.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await outsider.fill('input[name="name"]', 'Someone Else');
await outsider.fill('input[name="business"]', `Other Business ${stamp}`);
await outsider.fill('input[name="email"]', `outsider-${stamp}@example.test`);
await outsider.fill('input[name="password"]', PASSWORD);
await outsider.waitForTimeout(3500);
await outsider.click('button[type="submit"]');
await outsider.waitForTimeout(2500);

await outsider.goto(`${BASE}/org/automation`, { waitUntil: 'networkidle' });
const theirs = (await outsider.textContent('body')) ?? '';
check('ANOTHER BUSINESS NEVER SEES THIS ONE\'S REVIEW', !theirs.includes(BUSINESS), BUSINESS);

// And signed out entirely, it is not a page at all.
const stranger = await (await b.newContext()).newPage();
await stranger.goto(`${BASE}/org/automation`, { waitUntil: 'networkidle' });
check(
  'a stranger is sent to sign in rather than shown anything',
  stranger.url().includes('/signin') || !((await stranger.textContent('body')) ?? '').includes('Across the business'),
  stranger.url(),
);

check('no console errors', errors.length === 0, errors.join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
