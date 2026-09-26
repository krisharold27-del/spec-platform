/*
  The administrator's controls, driven with real rows in the database.

  Three things built on 26 September, each of which only matters if it works end to end:

    1. Late quotes on My Page (Kris: "control is always in my page - this is associated with the
       administrator of the company"). A quote whose chase is due shows there, and approving it
       records the chase once — the same row Jobs reads, so Jobs stops offering it too.
    2. From your inboxes, on the Jobs pipeline. A pasted email is read into who and what, and
       Approve opens the enquiry — once.
    3. Understand the work. What the customer said becomes a job priced from this business's OWN
       pre-builds, and Build the quote makes a real draft quote with those lines.

    node scripts/fake-auth.mjs 54321 &
    npm start &
    node scripts/admin-control-journey.mjs http://localhost:3100
*/
import { chromium } from 'playwright';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tidyUp } from './test-cleanup.mjs';

const BASE = process.argv[2] ?? process.env.APP_URL ?? 'http://localhost:3100';
const DB = process.env.DATABASE_URL
  ?? (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
const sql = postgres(DB, { onnotice: () => {} });

const stamp = Date.now();
const BUS = `Control Test ${stamp}`;
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures.push(label);
};
const daysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString();

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

const finish = async () => {
  check('no page threw', errs.length === 0, errs.join(' | '));
  await browser.close();
  await tidyUp(BUS);
  await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `control-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id, access from users where tenant_id = ${tenant.id} limit 1`;

/* ── 1. Late quotes on My Page ─────────────────────────────────────────────────────────────── */
const late = {
  id: randomUUID(), tenant_id: tenant.id, ref: 'J-7001', stage: 'quoted', title: 'Switchboard upgrade',
  client: 'Dana Ward', value_cents: 480_000, created_by: me.id, created_at: daysAgo(12),
  stage_at: daysAgo(11), quoted_at: daysAgo(11),
};
await sql`insert into jobs ${sql(late)}`;

await page.goto(`${BASE}/my-page`, { waitUntil: 'networkidle' });
const section = page.locator('[data-late-quotes]');
if (me.access === 'administrator') {
  check('MY PAGE SHOWS THE LATE QUOTE TO THE ADMINISTRATOR', await section.count() > 0 && (await section.innerText()).includes('Dana Ward'));
  const approve = section.getByRole('button', { name: "Approve SPEC's draft and send" });
  check('  with the design’s own words on the button', await approve.count() === 1);
  await Promise.all([page.waitForLoadState('networkidle'), approve.click()]);
  await page.waitForTimeout(800);
  const chases = await sql`select day from quote_chases where tenant_id = ${tenant.id} and job_id = ${late.id}`;
  check('APPROVING RECORDS THE CHASE — the seven-day one, eleven days out', chases.length === 1 && chases[0].day === 7, JSON.stringify(chases));
  check('  and the page says it went', (await page.locator('[data-late-quotes]').innerText().catch(() => '')).includes('Sent · Dana Ward has it'));
} else {
  check('MY PAGE SHOWS THE LATE QUOTE TO THE ADMINISTRATOR', false, `the sign-up user is ${me.access}, not administrator`);
}

/* ── 2. From your inboxes ──────────────────────────────────────────────────────────────────── */
await page.goto(`${BASE}/jobs?tab=pipeline`, { waitUntil: 'networkidle' });
const inbox = page.locator('[data-inbox]');
check('THE PIPELINE HAS "FROM YOUR INBOXES"', await inbox.count() === 1 && (await inbox.innerText()).includes('From your inboxes'));
await inbox.locator('textarea[name="message"]').fill(
  'From: Sam Lee <sam.lee@example.com>\nSubject: EV charger\n\nHi, we would like an EV charger installed in the garage at 14 Smith St. Could you quote it?');
await Promise.all([page.waitForLoadState('networkidle'), inbox.getByRole('button', { name: 'Read it' }).click()]);
await page.waitForTimeout(800);
const inboxText = await page.locator('[data-inbox]').innerText();
check('  it reads who and what', inboxText.includes('Sam Lee') && inboxText.includes('Wants a quote'), inboxText.slice(0, 300));
await Promise.all([page.waitForLoadState('networkidle'), page.locator('[data-inbox]').getByRole('button', { name: 'Approve' }).click()]);
await page.waitForTimeout(800);
const opened = await sql`select id, client, title, site, stage from jobs where tenant_id = ${tenant.id} and client = 'Sam Lee'`;
check('APPROVE OPENS THE ENQUIRY', opened.length === 1 && opened[0].stage === 'enquiry' && opened[0].site === '14 Smith St', JSON.stringify(opened));
const msgs = await sql`select job_id, done_at from mailbox_messages where tenant_id = ${tenant.id}`;
check('  once, and the message remembers which job', msgs.length === 1 && msgs[0].job_id === opened[0]?.id && !!msgs[0].done_at);

/* ── 3. Understand the work ────────────────────────────────────────────────────────────────── */
const rateId = randomUUID();
await sql`insert into labour_rates ${sql({ id: rateId, tenant_id: tenant.id, name: 'Electrician', cost_cents: 6000, charge_cents: 11000, position: 0, created_at: daysAgo(1) })}`;
const kitId = randomUUID();
await sql`insert into kits ${sql({ id: kitId, tenant_id: tenant.id, name: 'EV charger install', components: '[]', labour_hours: 4, labour_rate_id: rateId, checklist: '[]', extra_cost_cents: 90_000, created_at: daysAgo(1) })}`;

await page.goto(`${BASE}/jobs?tab=pipeline&job=${opened[0]?.id}`, { waitUntil: 'networkidle' });
const uw = page.locator('[data-understand]');
check('THE PIPELINE HAS "UNDERSTAND THE WORK" FOR THE ENQUIRY', await uw.count() === 1 && (await uw.innerText()).includes('Sam Lee'));
await uw.locator('textarea[name="said"]').fill('Wants a 7 kW EV charger in the garage for a new car.');
await uw.getByRole('button', { name: 'Read it' }).click();
await page.waitForFunction(() => document.querySelector('[data-understand]')?.textContent?.includes('The job, as SPEC reads it'), null, { timeout: 60000 }).catch(() => {});
const uwText = await page.locator('[data-understand]').innerText();
check('  it reads the job from the business’s own pre-builds', uwText.includes('The job, as SPEC reads it') && uwText.includes('EV charger install'), uwText.slice(0, 400));
check('  and prices it inc GST', /\$[\d,]+\s*inc GST/.test(uwText));
await Promise.all([page.waitForURL(u => u.searchParams.get('tab') === 'quotes', { timeout: 30000 }).catch(() => {}), page.locator('[data-understand]').getByRole('button', { name: 'Build the quote' }).click()]);
const quotes = await sql`select q.id, q.status, count(l.id)::int as lines from quotes q left join quote_lines l on l.quote_id = q.id where q.tenant_id = ${tenant.id} group by q.id`;
check('BUILD THE QUOTE MAKES A DRAFT WITH THE KIT ON IT', quotes.length === 1 && quotes[0].status === 'draft' && quotes[0].lines >= 1, JSON.stringify(quotes));

/* ── 4. Estimate from plans: approving a clean count records the quote as sent ─────────────── */
const takeoffId = randomUUID();
const plansJob = { ...late, id: randomUUID(), ref: 'J-9901', stage: 'enquiry', client: 'Paul Builder', title: 'Duplex', quoted_at: null, stage_at: daysAgo(1), created_at: daysAgo(1) };
await sql`insert into jobs ${sql(plansJob)}`;
await sql`insert into plan_takeoffs ${sql({ id: takeoffId, tenant_id: tenant.id, job_id: plansJob.id, file_name: 'plans.pdf', rows: JSON.stringify([{ kitId, where: 'Unit 1', qty: 2, unsure: false }]), by_model: true, created_at: daysAgo(0) })}`;
await page.goto(`${BASE}/jobs?tab=takeoff&job=${plansJob.id}`, { waitUntil: 'networkidle' });
const plans = page.locator('[data-plans]');
const plansText = await plans.innerText().catch(() => '(no section)');
check('TAKEOFF HAS "ESTIMATE FROM PLANS" WITH THE COUNT', await plans.count() === 1 && plansText.includes('EV charger install · Unit 1 × 2'), plansText.slice(0, 500));
await Promise.all([page.waitForLoadState('networkidle'), plans.getByRole('button', { name: 'Approve and send to Paul' }).click({ timeout: 15000 }).catch(() => {})]);
await page.waitForTimeout(800);
const [sentQ] = await sql`select status from quotes where tenant_id = ${tenant.id} and job_id = ${plansJob.id}`;
const [movedJob] = await sql`select stage from jobs where id = ${plansJob.id}`;
check('APPROVING A CLEAN COUNT RECORDS THE QUOTE AS SENT AND MOVES THE JOB', sentQ?.status === 'sent' && movedJob?.stage === 'quoted', JSON.stringify({ sentQ, movedJob }));

await finish();
