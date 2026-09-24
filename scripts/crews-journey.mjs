/*
  Two crews on one job, and the one name over all of it.

  Kris, 25 September: "multi crew is common - split scopes with one supervisor overall". The
  booking side already worked — the schedule's uniqueness rule is on person and day, not job — so
  what this proves is the half that was missing: that splitting a job ASKS who carries it, and says
  so where somebody will see it rather than in a field they can leave blank.
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
const BUS = `Crews Test ${stamp}`;
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
await page.fill('input[name="email"]', `crews-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;

const jobId = randomUUID();
await sql`insert into jobs ${sql({
  id: jobId, tenant_id: tenant.id, ref: 'J-BIG', stage: 'won', title: 'Warehouse fitout',
  client: 'Big Builder', value_cents: 6_000_000, created_by: me.id,
  created_at: new Date().toISOString(), stage_at: new Date().toISOString(),
})}`;

await page.goto(`${BASE}/jobs?tab=schedule&book=${jobId}`, { waitUntil: 'networkidle' });
const start = await page.evaluate(() => document.body.innerText);
check('SPLITTING IS ON THE SAME SCREEN AS CREWING', /Crews on J-BIG/.test(start),
  start.slice(0, 260).replace(/\n/g, ' '));
check('  and one crew on one job needs nobody over it', !/nobody over the whole/i.test(start));

const split = async (name) => {
  await page.fill('input[name="name"]', name);
  await Promise.all([page.waitForLoadState('networkidle'),
    page.locator('form:has(input[name="name"]) button:has-text("Split it")').click()]);
  await page.waitForTimeout(900);
};

await split('Switchboard');
const one = await page.evaluate(() => document.body.innerText);
check('ONE SCOPE STILL NEEDS NOBODY', !/nobody over the whole/i.test(one),
  'asked for a supervisor on a single-scope job');
check('  and the scope is listed', /Switchboard/.test(one));

await split('Lighting');
const two = await page.evaluate(() => document.body.innerText);
check('A SECOND SCOPE ASKS WHO CARRIES THE JOB', /nobody over the whole/i.test(two),
  two.slice(0, 300).replace(/\n/g, ' '));
check('  and says what a supervisor is FOR, not that a field is needed',
  /carry the join/i.test(two) && !/required|invalid/i.test(two));
check('  and names the day it will matter', /the day they disagree/i.test(two));

const opts = await page.locator('select[name="supervisorName"] option').allTextContents();
check('THERE IS SOMEBODY TO PUT OVER IT', opts.length > 1, opts.join(' | '));
if (opts.length > 1) {
  await page.selectOption('select[name="supervisorName"]', { index: 1 });
  await Promise.all([page.waitForLoadState('networkidle'),
    page.locator('form:has(select[name="supervisorName"]) button').click()]);
  await page.waitForTimeout(900);
  const [held] = await sql`select supervisor_name, supervisor_key from jobs where id = ${jobId}`;
  check('ONE NAME IS RECORDED OVER THE WHOLE JOB', Boolean(held?.supervisor_name), JSON.stringify(held));
  const after = await page.evaluate(() => document.body.innerText);
  check('  and the warning goes', !/nobody over the whole/i.test(after));
  check('  and the job reads as held', new RegExp(`2 scopes, ${held.supervisor_name}`).test(after),
    after.slice(0, 300).replace(/\n/g, ' '));
}

const rows = await sql`select name from job_scopes where job_id = ${jobId} order by position`;
check('BOTH SCOPES ARE ON THE JOB, IN ORDER',
  rows.map(r => r.name).join(',') === 'Switchboard,Lighting', JSON.stringify(rows.map(r => r.name)));

const real = errs.filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');
await page.screenshot({ path: '/tmp/claude-0/crews.png', fullPage: true });
await finish();
