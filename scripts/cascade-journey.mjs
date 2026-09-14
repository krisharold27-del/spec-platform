// Does the goal actually reach a scorecard, in a browser?
//
// Design export 5: "The goal only means something once it is broken into what each role has to
// actually move. This is that cascade, once structure is approved."
//
// The claim worth proving is the one about TRUST, not about the list rendering. SPEC is allowed to
// suggest what a role measures; it is never allowed to set the number a person is judged against —
// "a target is agreed with whoever holds the role, never imposed on them." So the last check here
// opens the role's own KPI page and confirms the figure landed as PROPOSED with the agreed target
// still empty, waiting for the conversation.
//
// Runs with no ANTHROPIC_API_KEY, on purpose. Without one the cascade is the smaller, honest
// reading — where the goal has nobody moving it — and it must say so rather than dress up as the
// real thing.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/cascade-journey.mjs

import { chromium } from 'playwright';

const BASE = process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `cascade-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Cascade Test ${stamp}`;
const GOAL = 'Margin above 32% every month, no more than one resignation';

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
  await page.waitForTimeout(900);
}

// ── A real business ──────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.waitForTimeout(3500);
await press('button[type="submit"]');
await page.waitForTimeout(2500);
check('signed up and landed inside', !page.url().includes('/signup'), page.url());

// ── No goal, no cascade ──────────────────────────────────────────────────────────────────────────
// The whole object is "the goal, broken down". Without one there is nothing to break down, and the
// alternative — inventing a goal to cascade from — is the failure this feature must never have.
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
let body = await text();
check('the chart offers the cascade', body.includes('Predictive KPIs from the goal'));
check('NO GOAL MEANS NO CASCADE, and it says where to go', body.includes('Set the goals'));
check('and it does not offer to work down a goal that does not exist',
  !body.includes('Work the goal down the chart'));

// ── Set a goal ───────────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/setup/goals`, { waitUntil: 'networkidle' });
await page.fill('textarea[name="g2"]', GOAL);
await press('button[name="stay"]');

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
body = await text();
check('with a goal set, the cascade offers to work it down', body.includes('Work the goal down the chart'));
check("and it quotes the leader's own goal back", body.includes(GOAL));

// ── Work it down the chart ───────────────────────────────────────────────────────────────────────
// A brand-new business arrives with template KPIs in all four pillars, so the loud finding — a
// pillar with nothing measuring it — is absent. The quiet one is not: those KPIs have no agreed
// target, which is exactly "measured, and nothing saying what good looks like".
await press('button:has-text("Work the goal down the chart")');
body = await text();
check('a reading produces rows to decide on', /to decide/.test(body), body.slice(0, 160));

// Without a key this is the smaller reading, and it has to say so.
check('IT SAYS IT WILL NOT INVENT THE NUMBER', body.includes('SPEC will not invent the number'));

const rows = await page.locator('section[aria-label="Predictive KPIs from the goal"] li').count();
check('there is something on the list', rows > 0, `${rows} rows`);

// The order is the argument: top of the chart first.
const firstRole = await page.locator('section[aria-label="Predictive KPIs from the goal"] li')
  .first().locator('span.font-serif').first().innerText();
check('it reads from the top of the chart down', /General Manager|Head of/.test(firstRole), firstRole);

// ── Drop one, and it must not come back ──────────────────────────────────────────────────────────
const before = await page.locator('section[aria-label="Predictive KPIs from the goal"] li').count();
await press('form button:has-text("Not this one")');
const after = await page.locator('section[aria-label="Predictive KPIs from the goal"] li').count();
check('a dropped row goes', after === before - 1, `${before} → ${after}`);

await press('button:has-text("Work the goal down the chart")').catch(() => {});
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
const again = await page.locator('section[aria-label="Predictive KPIs from the goal"] li').count();
check('A DROPPED ROW IS NEVER SUGGESTED AGAIN', again <= after, `${after} → ${again}`);

// ── Take one, and see where the number lands ─────────────────────────────────────────────────────
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
const takeable = page.locator('section[aria-label="Predictive KPIs from the goal"] li').first();
const metric = await takeable.locator('span.text-sm.text-ink').first().innerText();

/*
  A row SPEC has no number for cannot be "added" — there is nothing to adopt, because it does not
  know what the number should be. The honest action is the one that sends somebody to agree it with
  whoever holds the seat; a button reading "add" would promise something the software cannot do.

  Both shapes are covered, because which one appears depends on whether the assistant is on.
*/
const hasNumber = await takeable.locator('form button:has-text("Add to scorecard")').count() > 0;

if (!hasNumber) {
  const link = takeable.locator('a:has-text("Agree the number")');
  check('A ROW WITH NO NUMBER SENDS YOU TO AGREE ONE, rather than pretending to add it',
    await link.count() > 0);
  const href = await link.first().getAttribute('href');
  check('and it goes to that role’s own KPIs', /\/setup\/kpis\?role=/.test(href ?? ''), href ?? '');
  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
} else {
  await press('form button:has-text("Add to scorecard")');
  await page.goto(`${BASE}/setup/kpis`, { waitUntil: 'networkidle' });
  const tab = page.locator('a', { hasText: await takeable.locator('span.font-serif').first().innerText() }).first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(1200); }
}

/*
  The KPI page holds each criterion in an INPUT, not as text on the page, so this reads the row out
  of the DOM rather than matching against textContent. Worth saying: an earlier version of this
  check passed on `body.includes(metric)` while the row it claimed to have found did not exist —
  the text was somewhere else on the page entirely. A check that can pass without the thing being
  there is not a check.
*/
const found = await page.evaluate(m => {
  const box = [...document.querySelectorAll('input[name$=":text"]')].find(i => i.value === m);
  if (!box) return null;
  const tr = box.closest('tr');
  return {
    agreed: tr?.querySelector('input[name$=":target"]')?.value ?? null,
    proposed: tr?.lastElementChild?.textContent?.trim() ?? '',
  };
}, metric);

check('THE MEASURE IS ON THAT ROLE’S SCORECARD', found !== null, metric);

/*
  The promise the whole product rests on. SPEC may suggest what a role measures; it may never set
  the number a person is judged against. So the agreed target must still be empty and waiting.
*/
if (found) {
  check('AND THE AGREED TARGET IS STILL EMPTY, waiting for the conversation',
    found.agreed === '', `"${found.agreed}"`);
  if (hasNumber) {
    check('while the suggested figure is on record as a proposal', found.proposed !== '—', found.proposed);
  }
}

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
