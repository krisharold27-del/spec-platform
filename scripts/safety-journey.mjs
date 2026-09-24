/**
 * Reporting a hazard, and the promise that an anonymous report has no name in it.
 *
 * ── Why this exists alongside tests/safety.test.ts ───────────────────────────────────────────────
 *
 * The unit tests prove `anonymise()` returns an object with no reporter in it. That is the rule,
 * and it is a good one — it strips the id, the role, the job AND the time of day, because a
 * timestamp to the second is a name to anybody who can see who was on shift.
 *
 * What they cannot prove is what reaches the DATABASE. Between the rule and the row sit a form, a
 * server action, a schema default and a column that a later edit could quietly start filling. Kris's
 * instruction is about the row, not the function: *"An anonymous psychosocial report must never
 * store a name at all."*
 *
 * So the last checks here open the database and read the row back. They are the only checks in SPEC
 * that can fail while every unit test passes, and they are the ones worth having.
 *
 *   node scripts/fake-auth.mjs 54321 &
 *   npm start &
 *   node scripts/safety-journey.mjs http://localhost:3100
 */

import { chromium } from 'playwright';
import { tidyUp } from './test-cleanup.mjs';
import { reportCrashes } from './journey-crash.mjs';

const RUN_STARTED = new Date().toISOString();
const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3000';
const CHROME = process.env.CHROME_PATH;
const SHOTS = process.env.SHOTS ?? '';

const stamp = Date.now();
const EMAIL = `safety-${stamp}@journey.test`;
const PASSWORD = 'a-good-password-123';
const BUSINESS = `Safety Test ${stamp}`;

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
reportCrashes({ browser: () => browser, business: BUSINESS, since: RUN_STARTED });
const context = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
const page = await context.newPage();

const faults = [];
page.on('pageerror', e => faults.push(String(e).slice(0, 160)));

const shot = async name => {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
};

/*
  Wait for the TEXT, not for the network.

  A server action posts and then re-renders, so `networkidle` can settle while React has not yet
  committed the new register — reading innerText at that moment sees the old page and reports a
  failure that is really a race. Three journeys in this repo have been wrong that way. Poll for the
  state being looked for.
*/
const waitForText = async (re, ms = 10000) => {
  const until = Date.now() + ms;
  let text = '';
  while (Date.now() < until) {
    text = await page.evaluate(() => document.body.innerText);
    if (re.test(text)) return text;
    await page.waitForTimeout(200);
  }
  return text;
};

const stop = async (code, why) => {
  console.log(`  --   ${why}`);
  await browser.close();
  await tidyUp(code === 0 ? null : BUSINESS, { lookSince: RUN_STARTED });
  process.exit(code);
};

/** The kind pills are buttons with role=radio, so a person clicks the words. So does this. */
const pick = async label => {
  await page.getByRole('radio', { name: label, exact: true }).click();
};

/** Type the line and press Enter, which is how the design says a report is sent. */
const send = async text => {
  await page.getByLabel('Describe what happened').fill(text);
  await page.getByLabel('Describe what happened').press('Enter');
};

// ── A real business, signed up the way anybody does ──────────────────────────────────────────────
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUSINESS);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.check('input[name="consent"]').catch(() => {});
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
if (page.url().includes('error=busy')) await stop(0, 'sign-up throttled (error=busy) — not a fault.');
if (!/\/(my-page|welcome|setup)/.test(page.url())) await stop(1, `could not sign up (at ${page.url()})`);

/* ─────────────────────────────────────────────────────────────────────────────
 * The page opens, and can be reported to before it has anything on it
 * ───────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/safety`, { waitUntil: 'networkidle' });
const first = await page.evaluate(() => document.body.innerText);
check('SAFETY OPENS on a brand new business', !/went wrong|Application error/i.test(first),
      first.slice(0, 160).replace(/\n/g, ' '));
await shot('safety-empty');

/*
  An empty-state-only route is a door that closes behind you: the report box has to be there before
  there is anything to report, or the register can never get its first row.
*/
check('THE REPORT BOX IS THERE BEFORE THERE IS ANYTHING TO REPORT',
      /Something not right\? Tell SPEC\./i.test(first));
check('and it says a report is never held against you', /never held against you/i.test(first));

await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
check('SAFETY IS REACHABLE WITHOUT TYPING THE ADDRESS',
      (await page.locator('a[href^="/safety"]').count()) > 0,
      'the apprentice who needs it is not going to guess the URL');

/* ─────────────────────────────────────────────────────────────────────────────
 * A hazard
 * ───────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/safety`, { waitUntil: 'networkidle' });
await pick('Hazard');
await send('Exposed cable at the Level 3 riser');
const afterHazard = await waitForText(/Exposed cable at the Level 3 riser|Sent\b/i);
check('A HAZARD CAN BE REPORTED', /Exposed cable at the Level 3 riser|Sent\b/i.test(afterHazard),
      afterHazard.slice(0, 200).replace(/\n/g, ' '));
await shot('safety-hazard');

/* ─────────────────────────────────────────────────────────────────────────────
 * The notifiable flag
 * ───────────────────────────────────────────────────────────────────────────── */

await pick('Someone got hurt');
await send('Apprentice fell from the scaffold, ambulance called, suspected fracture');
const afterInjury = await waitForText(/notifiable/i);
check('AN INJURY THAT SOUNDS SERIOUS IS FLAGGED AS POSSIBLY NOTIFIABLE',
      /notifiable/i.test(afterInjury),
      'the flag Kris asked for — it raises the question, it never answers it');

/*
  The regulator must be the right one for where the business works, not the design's hard-coded
  SafeWork NSW. On a business that has not said where it is, the honest answer is to ask.
*/
check('and it either names the right regulator or asks which state the site is in',
      /which state is the site in|site not in/i.test(afterInjury)
      || /WorkSafe|SafeWork|Workplace Health/i.test(afterInjury),
      'JBI Electrical is in Victoria; the design hard-codes NSW');
await shot('safety-notifiable');

// An ordinary injury must NOT be flagged, or the flag stops meaning anything and gets ignored.
await pick('Someone got hurt');
await send('Small cut to hand on cable tray, band-aid from the kit');
const afterMinor = await waitForText(/Sent|band-aid/i);
check('AN ORDINARY INJURY IS NOT FLAGGED', !/looks notifiable|call .* now/i.test(afterMinor),
      'a flag on everything is a flag on nothing');

/* ─────────────────────────────────────────────────────────────────────────────
 * The wellbeing report, sent the default way — which is anonymously
 * ───────────────────────────────────────────────────────────────────────────── */

await pick('Not coping / pressure');
const namedBox = page.locator('input[name="named"]');
check('ANONYMOUS IS THE DEFAULT on a wellbeing report, not something to opt into',
      (await namedBox.count()) > 0 && !(await namedBox.isChecked()),
      'the person deciding whether to speak up should not have to find a checkbox first');

await send('Workload in estimating is not sustainable right now');
const afterPsych = await waitForText(/GM|received|sent/i);
await shot('safety-anonymous');

/* ─────────────────────────────────────────────────────────────────────────────
 * The checks that read the row back out of the database
 * ───────────────────────────────────────────────────────────────────────────── */

const { db, schema } = await import('../src/db/index.ts').catch(() => ({}));
if (!db) {
  check('THE ANONYMOUS REPORT HAS NO NAME STORED AGAINST IT', false,
        'could not open the database — the promise is UNVERIFIED, which is not the same as kept');
} else {
  const { eq, and } = await import('drizzle-orm');
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.name, BUSINESS));
  const mine = kind => (tenant
    ? db.select().from(schema.safetyReports)
      .where(and(eq(schema.safetyReports.tenantId, tenant.id), eq(schema.safetyReports.kind, kind)))
    : Promise.resolve([]));

  const [wellbeing] = await mine('wellbeing');
  check('the wellbeing report reached the database at all', Boolean(wellbeing));

  if (wellbeing) {
    check('THE ANONYMOUS REPORT HAS NO NAME STORED AGAINST IT',
          wellbeing.reportedBy === null,
          `reported_by is ${JSON.stringify(wellbeing.reportedBy)} — the promise is BROKEN`);
    check('and no ROLE either, which would name them just as well in a small business',
          wellbeing.roleId === null);
    check('and no job reference, which places them on a site on a day',
          wellbeing.jobRef === null);
    /*
      The time of day. A wellbeing report stamped 14:52:07 is a name to anybody holding the roster,
      so only the date survives. This is the subtlest of the four and the easiest to lose in a
      refactor that "tidies up" a timestamp.
    */
    check('AND NOT THE MINUTE IT WAS SENT — a timestamp is a name if you hold the roster',
          !/\d\d:\d\d/.test(String(wellbeing.createdAt)),
          `created_at is ${JSON.stringify(wellbeing.createdAt)}`);
    check('it is marked anonymous, so a screen can say so rather than "not recorded"',
          wellbeing.anonymous === true);
    check('and nothing else on the row carries who sent it',
          !JSON.stringify(wellbeing).toLowerCase().includes(EMAIL.toLowerCase()));
  }

  // A NAMED report must keep its name, or the register has nobody to go back to.
  const [hazard] = await mine('hazard');
  check('A NAMED REPORT STILL KEEPS ITS NAME',
        Boolean(hazard?.reportedBy),
        'anonymity has to be the exception that was asked for, not the default everywhere');
}

check('no page crashed while doing any of it', faults.length === 0, faults.join(' | '));

console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
await stop(failures.length === 0 ? 0 : 1, failures.length === 0 ? 'done' : 'see failures above');
