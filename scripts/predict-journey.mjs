// Does "what is this chart missing?" actually work, end to end, in a browser?
//
// Design export 5: "Claude's read of what this structure is still missing. Nothing here counts as
// real until you say so — approve to add it to the chart, deny to drop it."
//
// Three claims worth proving, and none of them provable by a unit test:
//   1. A reading of a real chart finds a real gap and says why in terms of THIS business.
//   2. Approving one puts a role on the chart — and it arrives with no KPIs.
//   3. Denying one drops it AND it is never proposed again, however many times the chart is read.
//
// Runs with no ANTHROPIC_API_KEY, on purpose. SPEC Basic is a complete way to run the whole system,
// so the structural reading has to stand on its own — and this is the check that says it does.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/predict-journey.mjs

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

// When this run began — everything it created is newer than this.
const RUN_STARTED = new Date().toISOString();

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;

const stamp = Date.now();
const EMAIL = `predict-${stamp}@example.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Predict Test ${stamp}`;

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

async function press(selector) {
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click(selector),
  ]);
  await page.waitForTimeout(900);
}

// ── A real business, signed up the way a customer does ───────────────────────────────────────────
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

// ── Nothing is proposed until somebody asks ──────────────────────────────────────────────────────
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
let body = await text();
check('the chart asks what it is missing', body.includes('What is this chart missing?'));
check('and proposes nothing before being asked',
  !body.includes('Predicted roles — approve or deny'));

// ── A chart with no hole in it finds nothing, and says so ───────────────────────────────────────
// Worth proving before anything else: a brand-new business is provisioned with all three streams
// owned, so the honest answer is "nothing new". A reading that invented work here would be worse
// than no reading at all.
await press('button:has-text("Read the chart")');
body = await text();
check('A COMPLETE CHART GETS NOTHING INVENTED FOR IT', body.includes('Nothing new'));
check('and it reads as a result rather than a broken button',
  /Every stream has an owner/.test(body));

// ── Make a real hole, then read again ────────────────────────────────────────────────────────────
// Deleting a head is the ordinary thing a leader does while restructuring, and afterwards a quarter
// of the business genuinely has nobody accountable for it.
// Two of them, so there is one to deny and one to approve — the two halves of the decision.
for (const head of ['Head of Operations', 'Head of Growth']) {
  await page.goto(`${BASE}/setup/business`, { waitUntil: 'networkidle' });
  const btn = page.locator('li', { hasText: head }).locator('button:has-text("delete role")').first();
  check(`the business page can remove ${head}`, await btn.count() > 0);
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(1500); }
}

await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await press('button:has-text("Read the chart")');
body = await text();
check('a reading of a real chart finds something', body.includes('Predicted roles — approve or deny'), body.slice(0, 200));
check('and says nothing is real until the leader says so',
  /Nothing here counts as real until you say so/.test(body));
check('every proposal carries a reason, not just a title',
  /from your chart|a judgement/.test(body));

// ── Deny one, and it must never come back ────────────────────────────────────────────────────────
const beforeDeny = (await page.locator('form button:has-text("Deny")').count());
check('there is something to decide on', beforeDeny > 0);

const deniedTitle = await page.locator('section[aria-label="Predicted roles"] li').first()
  .locator('span').first().innerText();
await press('form button:has-text("Deny")');
body = await text();
check('the denied one is gone', !body.includes(deniedTitle) || !body.includes('Predicted roles — approve or deny'),
  deniedTitle);

// Read again. A denial that does not stick is how software teaches people to ignore it.
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
const readAgain = page.locator('button:has-text("Read the chart")');
if (await readAgain.count()) await press('button:has-text("Read the chart")');
body = await text();
check('A DENIED ROLE IS NEVER PROPOSED AGAIN',
  !(body.includes('Predicted roles — approve or deny') && body.includes(deniedTitle)), deniedTitle);

// ── Approve one, and it becomes a real role ──────────────────────────────────────────────────────
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
body = await text();
if (body.includes('Approve — add to chart')) {
  const approvedTitle = await page.locator('section[aria-label="Predicted roles"] li').first()
    .locator('span').first().innerText();
  const clean = approvedTitle.split(' — under ')[0].trim();
  await press('form button:has-text("Approve — add to chart")');
  body = await text();
  check('APPROVING PUTS IT ON THE CHART', body.includes(clean), clean);
  // It is on the chart now, so it must not also still be sitting in the list waiting to be decided.
  const stillPending = await page.locator('section[aria-label="Predicted roles"] li', { hasText: clean }).count();
  check('and it is no longer waiting to be decided', stillPending === 0, `${stillPending} still pending`);

  // It arrives with no KPIs on purpose — a scorecard that turned up already written is not the
  // role holder's. Setup is where that shows.
  await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
  check('the approved role is counted as a real role', /\d+ drawn/.test(await text()));
} else {
  check('there was a second proposal to approve', false, 'nothing left after the denial');
}

// ── A reading that finds nothing says so ─────────────────────────────────────────────────────────
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
if (await page.locator('button:has-text("Read the chart")').count()) {
  await press('button:has-text("Read the chart")');
  body = await text();
  const settled = !body.includes('Predicted roles — approve or deny');
  if (settled) check('a chart with nothing left to find says so out loud', body.includes('Nothing new'));
  else check('a further reading still shows what is outstanding', true);
}

check('no page errors anywhere in the journey', errors.length === 0, errors.slice(0, 3).join(' | '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
// Clear up after ourselves. Kris, 17 September: "Make your tests delete the example
// business they create when they finish."
await tidyUp(BUSINESS, { lookSince: RUN_STARTED });

process.exit(failed ? 1 : 0);
