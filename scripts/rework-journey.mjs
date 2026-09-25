/*
  Going back to a job: paid is a continuation, unpaid is rework.

  Kris, 25 September: "anything paid simple job process - unpaid is re work and negative to the
  business". Driven because the model being right proved nothing — logCallback wrote a flat
  costCents of 0 every time, so the unpaid figure was structurally incapable of moving, and no unit
  test was ever going to notice.
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
const BUS = `Rework Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1200 } })).newPage();
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
await page.fill('input[name="email"]', `rework-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;

const mkJob = async ref => {
  const r = { id: randomUUID(), tenant_id: tenant.id, ref, stage: 'paid', title: 'Switchboard',
    client: 'Cust', value_cents: 900_000, created_by: me.id,
    created_at: new Date().toISOString(), stage_at: new Date().toISOString() };
  await sql`insert into jobs ${sql(r)}`;
  return r;
};
const jPaid = await mkJob('J-PAID');
const jFree = await mkJob('J-FREE');

// ── With no labour rate set, SPEC says hours rather than inventing dollars ──────────────────────
await page.goto(`${BASE}/jobs?tab=rework`, { waitUntil: 'networkidle' });
const first = await page.evaluate(() => document.body.innerText);
check('THE PAID QUESTION IS ASKED FIRST', /Are you being paid for going back/i.test(first),
  first.slice(0, 240).replace(/\n/g, ' '));
check('  and the rule is spelled out', /more work on the same job/i.test(first));

const log = async ({ paid, ref, cause, hours }) => {
  const [{ n: before }] = await sql`select count(*)::int as n from callbacks where tenant_id = ${tenant.id}`;
  await page.goto(`${BASE}/jobs?tab=rework`, { waitUntil: 'networkidle' });
  await page.check(`input[name="paid"][value="${paid}"]`);
  await page.selectOption('select[name="jobId"]', { label: `${ref} · Switchboard` });
  if (cause) await page.selectOption('select[name="cause"]', { value: cause });
  await page.fill('input[name="hours"]', String(hours));
  await Promise.all([page.waitForLoadState('networkidle'), page.locator('form button:has-text("Log it")').click()]);
  /*
    ── Wait for the WRITE, not for a number of milliseconds ──────────────────────────────────────

    A fixed 900ms here was the third check in this suite to pass alone and fail inside the full
    gate. The first attempt at a fix waited for the address instead — which is worse on the unpaid
    path, because it stays on the same tab and the wait returns instantly while the write is still
    in flight. That produced a callback costed at a labour rate inserted AFTER it was submitted.

    So it waits for the row. A journey that waits for its own evidence cannot be raced, and the
    database is the only place that evidence actually is.
  */
  const want = paid === 'yes' ? before : before + 1;
  for (let i = 0; i < 60; i++) {
    const [{ n }] = await sql`select count(*)::int as n from callbacks where tenant_id = ${tenant.id}`;
    if (n === want) break;
    await new Promise(r => setTimeout(r, 250));
  }
  if (paid === 'yes') {
    await page.waitForURL(u => u.searchParams.get('tab') === 'pipeline', { timeout: 15_000 }).catch(() => {});
  } else {
    /*
      Read the page AFTER the row exists. Polling the database proves the write landed and says
      nothing about what the screen is showing — and the screen is what the next checks read.
    */
    await page.goto(`${BASE}/jobs?tab=rework`, { waitUntil: 'networkidle' });
  }
};

await log({ paid: 'no', ref: 'J-FREE', cause: 'workmanship', hours: 2 });
const noRate = await page.evaluate(() => document.body.innerText);
check('WITH NO LABOUR RATE, IT SAYS HOURS RATHER THAN INVENTING DOLLARS',
  /hours of going back for nothing/i.test(noRate) && /Set a labour rate/i.test(noRate),
  noRate.slice(0, 300).replace(/\n/g, ' '));

// ── Now give the business a rate, and the same rework gets a price ──────────────────────────────
await sql`insert into labour_rates ${sql({
  id: randomUUID(), tenant_id: tenant.id, name: 'Electrician',
  cost_cents: 8_000, charge_cents: 14_000, position: 0, created_at: new Date().toISOString(),
})}`;
await log({ paid: 'no', ref: 'J-FREE', cause: 'material', hours: 5 });
const priced = await sql`select cost_cents from callbacks where tenant_id = ${tenant.id} order by created_at`;
check('ONCE A RATE EXISTS, REWORK IS COSTED FROM IT',
  priced.some(r => r.cost_cents === 40_000), JSON.stringify(priced.map(r => r.cost_cents)));
const withRate = await page.evaluate(() => document.body.innerText);
check('  and the money is on the screen', /done twice and paid for once/i.test(withRate),
  withRate.slice(0, 300).replace(/\n/g, ' '));

// ── A paid return is a continuation and never reaches this page ─────────────────────────────────
await log({ paid: 'yes', ref: 'J-PAID', hours: 3 });
const cbPaid = await sql`select id from callbacks where tenant_id = ${tenant.id} and job_id = ${jPaid.id}`;
const tsPaid = await sql`select minutes, billable from timesheet_entries where tenant_id = ${tenant.id} and job_id = ${jPaid.id}`;
check('A PAID RETURN CREATES NO CALLBACK', cbPaid.length === 0, `${cbPaid.length} callbacks`);
check('  and puts the hours on the job as billable time',
  tsPaid.length === 1 && tsPaid[0].minutes === 180 && tsPaid[0].billable === true, JSON.stringify(tsPaid));
check('  and lands on the job board, not rework',
  new URL(page.url()).searchParams.get('tab') === 'pipeline', page.url());

const real = errs.filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');
await finish();
