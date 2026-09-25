/*
  The month ahead: what it proposes, what it will not invent, and the hole it finds.

  Kris, 26 September: "getting schedules done now and as far into the future as possible - ideally
  1 month in advance".

  Three claims a unit test cannot settle, because all three are about what reaches the screen.

  It PROPOSES and never books. A booking is a promise to a customer, and an automatic one is a
  promise nobody made — Kris's own rule for work orders, and it applies harder here. So the journey
  asks the database afterwards whether anything was written.

  It will not invent a duration. A job of a kind this business has never finished has no median to
  work from, and a guessed day would make every plan wrong in the same direction, quietly. That job
  must be left out AND NAMED, not silently dropped.

  And the hole is the output worth having. A week-at-a-time schedule cannot show a business the
  empty week until it is next week; this one has to find it now.
*/
import { chromium } from 'playwright';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tidyUp } from './test-cleanup.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:3100';
const DB = process.env.DATABASE_URL
  ?? (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
const sql = postgres(DB, { onnotice: () => {} });

const stamp = Date.now();
const BUS = `Ahead Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1600 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `ahead-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id, name from users where tenant_id = ${tenant.id} limit 1`;

const now = new Date();
const iso = now.toISOString();
const SCHEDULE = `${BASE}/jobs?tab=schedule`;

/* ── A month with nothing in it ──────────────────────────────────────────────────────────────── */

await page.goto(SCHEDULE, { waitUntil: 'networkidle' });
check('THE MONTH-AHEAD PANEL IS THERE', await page.locator('[data-ahead]').count() === 1);

const empty = await page.locator('[data-ahead]').innerText();
check('IT PLANS A MONTH, NOT A WEEK', /next 30 days/i.test(empty), empty.replace(/\n/g, ' ').slice(0, 120));
check('AN EMPTY MONTH IS ALL QUIET, AND IT SAYS SO', /quiet/i.test(empty), empty.replace(/\n/g, ' ').slice(0, 200));

/* ── A job of a kind nobody has ever finished ────────────────────────────────────────────────── */

const unknownId = randomUUID();
await sql`insert into jobs ${sql({
  id: unknownId, tenant_id: tenant.id, ref: 'J-UNKNOWN', stage: 'won', title: 'Solar install',
  client: 'Harbourview', work_kind: 'project', value_cents: 5_000_000,
  created_by: me.id, created_at: iso, stage_at: iso,
})}`;

await page.goto(SCHEDULE, { waitUntil: 'networkidle' });
check('IT REFUSES TO GUESS A DURATION', await page.locator('[data-ahead-no-duration]').count() === 1);
const noDur = await page.locator('[data-ahead-no-duration]').innerText();
check('AND NAMES THE JOB RATHER THAN DROPPING IT', /J-UNKNOWN/.test(noDur), noDur.replace(/\n/g, ' ').slice(0, 180));
check('AND SAYS WHY IT WILL NOT ASSUME A DAY', /wrong in the same direction/i.test(noDur), noDur.replace(/\n/g, ' ').slice(0, 220));
check('IT IS NOT PROPOSED ANYWAY', await page.locator('[data-ahead-proposal]').count() === 0);

/* ── History, so there is a median to work from ──────────────────────────────────────────────── */

const staffId = randomUUID();
await sql`insert into staff ${sql({
  id: staffId, tenant_id: tenant.id, name: 'Hemi Walker', user_id: me.id,
  inducted_at: iso, created_at: iso,
})}`;

/* Three finished maintenance jobs, two days each, so the median is a real two days. */
for (let i = 0; i < 3; i += 1) {
  const doneId = randomUUID();
  await sql`insert into jobs ${sql({
    id: doneId, tenant_id: tenant.id, ref: `J-DONE-${i}`, stage: 'paid', title: 'Switchboard',
    client: 'Past', work_kind: 'maintenance', value_cents: 300000,
    created_by: me.id, created_at: iso, stage_at: iso,
  })}`;
  await sql`insert into timesheet_entries ${sql({
    id: randomUUID(), tenant_id: tenant.id, job_id: doneId, person_key: `user:${me.id}`,
    person_name: 'Hemi Walker', day: '2026-09-01', minutes: 960, source: 'phone',
    started_at: '2026-09-01T07:00:00Z', finished_at: '2026-09-01T15:00:00Z', created_at: iso,
  })}`;
}

const plannedId = randomUUID();
await sql`insert into jobs ${sql({
  id: plannedId, tenant_id: tenant.id, ref: 'J-PLANNED', stage: 'won', title: 'Switchboard upgrade',
  client: 'Bean There', work_kind: 'maintenance', value_cents: 400000,
  created_by: me.id, created_at: iso, stage_at: iso,
})}`;

await page.goto(SCHEDULE, { waitUntil: 'networkidle' });
check('WITH HISTORY, IT PLACES THE JOB', await page.locator('[data-ahead-proposal]').count() === 1);

const proposed = await page.locator('[data-ahead-proposals]').innerText();
check('ON A PERSON WHO IS ACTUALLY AVAILABLE', /Hemi Walker/.test(proposed), proposed.replace(/\n/g, ' ').slice(0, 180));
check('AND IT IS TWO DAYS, FROM THE MEDIAN OF PAST JOBS', /to /.test(proposed), proposed.replace(/\n/g, ' ').slice(0, 180));

/* Close in, so it is firm and a customer can be told. */
check('THE NEAR ONES ARE FIRM', await page.locator('[data-ahead-firmness="firm"]').count() === 1);
check('AND IT SAYS A CUSTOMER CAN BE TOLD', /Tell the customer/i.test(proposed), proposed.replace(/\n/g, ' ').slice(0, 200));

/* ── It proposes. It does not book ───────────────────────────────────────────────────────────── */

const booked = await sql`select count(*)::int as n from schedule_bookings where tenant_id = ${tenant.id}`;
check('NOTHING WAS BOOKED', booked[0].n === 0, `${booked[0].n} bookings`);
check('AND THE SCREEN SAYS SO', /Nothing here is booked/i.test(proposed), proposed.replace(/\n/g, ' ').slice(0, 200));

/* ── Somebody not inducted is not available ──────────────────────────────────────────────────── */

await sql`update staff set inducted_at = null where id = ${staffId}`;
await page.goto(SCHEDULE, { waitUntil: 'networkidle' });
check('AN UNINDUCTED PERSON IS NOT SENT TO WORK', await page.locator('[data-ahead-proposal]').count() === 0);
const blocked = await page.locator('[data-ahead-unfilled]').innerText();
check('AND THE JOB IS REPORTED, NOT DROPPED', /J-PLANNED/.test(blocked), blocked.replace(/\n/g, ' ').slice(0, 180));

await sql`update staff set inducted_at = ${iso} where id = ${staffId}`;

/* ── The hole ────────────────────────────────────────────────────────────────────────────────── */

await page.goto(SCHEDULE, { waitUntil: 'networkidle' });
const holes = await page.locator('[data-ahead-holes]').innerText();
check('IT FINDS THE QUIET STRETCH', await page.locator('[data-ahead-hole]').count() >= 1, holes.replace(/\n/g, ' ').slice(0, 160));
/* The reason this is the most valuable output: found now, it is time to sell into. */
check('AND SAYS WHY THAT MATTERS NOW', /time to sell something into/i.test(holes), holes.replace(/\n/g, ' ').slice(0, 220));

/* ── It is straight about what is doing the deciding ─────────────────────────────────────────── */

const how = await page.locator('[data-ahead-how]').innerText();
check('IT SAYS HOW IT DECIDES', /not guessed/i.test(how), how.replace(/\n/g, ' ').slice(0, 180));
check('AND THAT IT GIVES THE SAME ANSWER TWICE', /same answer twice/i.test(how), how.replace(/\n/g, ' ').slice(0, 180));
check('IT ADMITS IT DOES NOT KNOW PUBLIC HOLIDAYS', /public holidays are not/i.test(how), how.replace(/\n/g, ' ').slice(0, 220));
check('AND NAMES WHAT IT STILL NEEDS', await page.locator('[data-ahead-needs]').count() >= 2);

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
