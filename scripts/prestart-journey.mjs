/*
  The pre-start gate: no pre-start, no jobs.

  Kris, 25 September: "Not done = no jobs on the phone that day. Any 'Not OK' = jobs stay locked
  until the supervisor clears it."

  What has to be proven here cannot be proven by a unit test, because the claim is about what is
  ON THE PAGE. A gate that renders the jobs and then hides them with CSS passes every test about
  its own logic and fails the only thing that matters — so this reads the page source and checks
  the job reference is genuinely not in it.

  It also proves the part that is easy to build wrong in a way nobody notices: that clearing a
  fault is somebody ELSE's job. A person who can clear their own is a person with no gate at all,
  and everything still looks right from the outside.
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
const BUS = `PreStart Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
/* An iPhone in one hand, which is the only size that proves anything about this screen. */
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
})).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Hemi Walker');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `prestart-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id, name from users where tenant_id = ${tenant.id} limit 1`;

/* ── Somebody who does not drive a company vehicle sees no gate ──────────────────────────────── */

await page.goto(`${BASE}/tech-day`, { waitUntil: 'networkidle' });
check('NO GATE FOR SOMEBODY WHO DOES NOT DRIVE ONE', await page.locator('[data-prestart]').count() === 0);

/* ── Now they do ─────────────────────────────────────────────────────────────────────────────── */

const staffId = randomUUID();
await sql`insert into staff ${sql({
  id: staffId, tenant_id: tenant.id, name: me.name ?? 'Hemi Walker', user_id: me.id,
  drives_company_vehicle: true, created_at: new Date().toISOString(),
})}`;

/* A job booked on them today, so there is genuinely something for the gate to withhold. */
const jobId = randomUUID();
const today = new Date().toISOString().slice(0, 10);
await sql`insert into jobs ${sql({
  id: jobId, tenant_id: tenant.id, ref: 'J-GATED', stage: 'won', title: 'Switchboard upgrade',
  client: 'Harbourview', value_cents: 900000, created_by: me.id,
  created_at: new Date().toISOString(), stage_at: new Date().toISOString(),
})}`;
await sql`insert into schedule_bookings ${sql({
  id: randomUUID(), tenant_id: tenant.id, job_id: jobId, person_key: `user:${me.id}`,
  person_name: me.name ?? 'Hemi Walker', day: today, created_by: me.id, created_at: new Date().toISOString(),
})}`;

await page.goto(`${BASE}/tech-day`, { waitUntil: 'networkidle' });
check('THE PRE-START IS THE WHOLE SCREEN', await page.locator('[data-prestart]').count() === 1);
check('ALL FOUR CHECKS ARE ASKED', await page.locator('[data-prestart-check]').count() === 4);

/*
  The claim that matters. Not "the jobs are hidden" — the job reference is not in the page at all.
*/
const locked = await page.content();
check('THE JOB IS NOT ON THE PHONE AT ALL', !locked.includes('J-GATED'));
check('AND NEITHER IS THE CLIENT', !locked.includes('Harbourview'));

/* ── A fault holds the day, and says so without telling anybody off ──────────────────────────── */

await page.check('[data-prestart-check="vehicle"] input[value="not_ok"]');
for (const key of ['gear', 'testers', 'licence']) {
  await page.check(`[data-prestart-check="${key}"] input[value="ok"]`);
}
await page.fill('textarea[name="note"]', 'Front left tyre is down to the wear bars.');
await page.click('form button');
await page.waitForFunction(
  () => document.querySelector('[data-prestart-held]') !== null,
  null, { timeout: 20000 },
).catch(() => {});

check('A FAULT HOLDS THE DAY', await page.locator('[data-prestart-held]').count() === 1);
const heldText = await page.locator('[data-prestart-held]').innerText().catch(() => '');
check('THE JOBS ARE STILL NOT THERE', !(await page.content()).includes('J-GATED'));
check('IT DOES NOT TELL THEM OFF FOR FINDING IT', /did the right thing/i.test(heldText), heldText.replace(/\n/g, ' ').slice(0, 140));
check('AND DOES NOT CLAIM A MESSAGE WAS SENT', !/has been told|notified|sent to/i.test(heldText), heldText.replace(/\n/g, ' ').slice(0, 140));
check('IT SAYS WHERE IT ACTUALLY IS', /screen/i.test(heldText), heldText.replace(/\n/g, ' ').slice(0, 140));

const [row] = await sql`select marks, note, done_at from pre_starts where tenant_id = ${tenant.id} and person_key = ${`user:${me.id}`}`;
check('THE PRE-START WAS RECORDED', Boolean(row?.done_at));
check('WITH THE FAULT AND THE WORDS', /not_ok/.test(row?.marks ?? '') && /wear bars/.test(row?.note ?? ''));

/* ── Nobody clears their own ─────────────────────────────────────────────────────────────────── */

const desk = await (await browser.newContext({ viewport: { width: 1400, height: 1200 } })).newPage();
await desk.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
await desk.fill('input[name="email"]', `prestart-${stamp}@journey.test`);
await desk.fill('input[name="password"]', 'a-good-password-123');
await desk.click('button[type="submit"]');
await desk.waitForURL(u => !u.pathname.startsWith('/signin'), { timeout: 40000 }).catch(() => {});

await desk.goto(`${BASE}/safety`, { waitUntil: 'networkidle' });
const onList = await desk.locator('[data-prestart-held-list]').count();
check('THE SUPERVISOR CAN SEE IT ON THEIR SCREEN', onList === 1);

if (onList === 1) {
  const listed = await desk.locator('[data-prestart-held-list]').innerText();
  check('IT NAMES THE PERSON AND THE FAULT', /Hemi/i.test(listed) && /wear bars/i.test(listed), listed.replace(/\n/g, ' ').slice(0, 160));

  /*
    This account IS the person with the fault, so clearing must be refused. A person who can clear
    their own is a person with no gate — and it is the failure that leaves everything looking right.
  */
  await desk.click('[data-prestart-held-list] form button');
  await desk.waitForTimeout(2000);
  const [still] = await sql`select cleared_at from pre_starts where tenant_id = ${tenant.id} and person_key = ${`user:${me.id}`}`;
  check('NOBODY CLEARS THEIR OWN', still?.cleared_at === null, String(still?.cleared_at));
}

/* ── A clean pre-start opens the day ─────────────────────────────────────────────────────────── */

await sql`update pre_starts set marks = ${'{"vehicle":"ok","gear":"ok","testers":"ok","licence":"ok"}'}, note = ${''}
          where tenant_id = ${tenant.id} and person_key = ${`user:${me.id}`}`;
await page.goto(`${BASE}/tech-day`, { waitUntil: 'networkidle' });
check('A CLEAN PRE-START OPENS THE DAY', await page.locator('[data-prestart]').count() === 0);
check('AND THE JOB IS THERE NOW', (await page.content()).includes('J-GATED'));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
