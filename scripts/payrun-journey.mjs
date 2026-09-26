/*
  The pay run cannot be approved until all seven checks pass — and FDV leave is never named.

  Two claims, both of which only a real page can settle.

  The pay run: Kris, 25 September, "payroll is always 100% right. A pay run cannot be approved until
  all seven checks pass." What has to be proven is that there is NO APPROVE BUTTON, not a disabled
  one — a disabled attribute is a devtools window away from gone, and a button that appears and then
  refuses teaches people the checks are advisory. And that a check which never ran blocks exactly as
  one that failed, because a check that is quietly missing is the way this guarantee actually breaks.

  The leave: family and domestic violence leave must read as "Leave" to anybody who is not the
  person, their approver or payroll. Somebody taking it is often hiding from a person who may know
  where they work. A unit test proves labelFor; only a browser proves that no screen went round it.
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
const BUS = `PayRun Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1400 } })).newPage();
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
await page.fill('input[name="email"]', `payrun-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

const now = new Date().toISOString();
const runId = randomUUID();
await sql`insert into pay_runs ${sql({
  id: runId, tenant_id: tenant.id, from_date: '2026-09-14', to_date: '2026-09-20',
  cycle: 'weekly', pay_date: '2026-09-25', created_at: now,
})}`;

const PAY = `${BASE}/people?mode=pay`;
await page.goto(PAY, { waitUntil: 'networkidle' });

check('THE PAY RUN IS ON THE SCREEN', await page.locator('[data-pay-run]').count() === 1);
check('ALL SEVEN CHECKS ARE SHOWN', await page.locator('[data-pay-check]').count() === 7);

/*
  Nothing has run. Every check must read not_run, and — the claim — there must be no approve button
  in the page at all.
*/
const notRun = await page.locator('[data-pay-check][data-state="not_run"]').count();
/*
  Six not run, and the award check FAILED rather than not run — because no rates are set, and an
  award check that "passed" on missing rates would be the most dangerous green tick in the product.
*/
check('NOTHING DONE MEANS SIX NOT RUN AND THE AWARD FAILED', notRun === 6, `${notRun} not run`);
check('THE AWARD CHECK FAILS WITHOUT RATES', await page.locator('[data-pay-check="award"][data-state="failed"]').count() === 1);
check('THERE IS NO APPROVE BUTTON AT ALL', await page.locator('[data-pay-approve] button').count() === 0);
check('AND IT SAYS WHY', await page.locator('[data-pay-blocked]').count() === 1);

const blocked = await page.locator('[data-pay-blocked]').innerText();
check('IT NAMES SOMETHING TO FIX, NOT "CHECKS INCOMPLETE"', blocked.length > 25 && !/incomplete/i.test(blocked), blocked.slice(0, 120));

/* ── Six of seven is still no ────────────────────────────────────────────────────────────────── */

const SIX = ['hours', 'deductions', 'super', 'payment', 'stp', 'records'];
for (const key of SIX) {
  await sql`insert into pay_run_checks ${sql({
    id: randomUUID(), tenant_id: tenant.id, pay_run_id: runId, check_key: key,
    state: 'passed', says: 'ok', ran_at: now,
  })}`;
}
/* The award check is deliberately left NOT RUN rather than failed — the quiet way this breaks. */
await page.goto(PAY, { waitUntil: 'networkidle' });
check('SIX OF SEVEN IS STILL NO APPROVE BUTTON', await page.locator('[data-pay-approve] button').count() === 0);
const six = await page.locator('[data-pay-run]').innerText();
check('A CHECK THAT NEVER RAN BLOCKS LIKE ONE THAT FAILED', /has not run|not set|will not guess/i.test(six), six.replace(/\n/g, ' ').slice(0, 200));

/* ── The award check needs rates, and SPEC will not guess one ────────────────────────────────── */

const rates = await page.locator('[data-pay-rates]').innerText();
check('THE RATES ARE SHOWN AS NOT SET', /Not set/.test(rates), rates.replace(/\n/g, ' ').slice(0, 160));
check('AND SPEC SAYS IT WILL NOT GUESS ONE', /will not guess/i.test(rates), rates.replace(/\n/g, ' ').slice(0, 200));

/*
  A value with no source does not count as set. This is the subtle one: a plausible number that
  nobody can say where it came from is exactly what an audit asks about eighteen months later.
*/
await sql`insert into legal_rates ${sql({
  id: randomUUID(), tenant_id: tenant.id, rate_key: 'super', label: 'Super guarantee rate',
  value: 12, unit: 'percent', source: null, updated_at: now,
})}`;
await sql`insert into legal_rates ${sql({
  id: randomUUID(), tenant_id: tenant.id, rate_key: 'overtimeAfter', label: 'Overtime after (hours a week)',
  value: 38, unit: 'hours', source: 'Award', updated_at: now,
})}`;
await page.goto(PAY, { waitUntil: 'networkidle' });
check('A RATE WITH NO SOURCE STILL BLOCKS', await page.locator('[data-pay-approve] button').count() === 0);

await sql`update legal_rates set source = ${'ATO, checked 1 Jul 2026'} where tenant_id = ${tenant.id} and rate_key = ${'super'}`;
await sql`insert into pay_run_checks ${sql({
  id: randomUUID(), tenant_id: tenant.id, pay_run_id: runId, check_key: 'award',
  state: 'passed', says: 'ok', ran_at: now,
})}`;

await page.goto(PAY, { waitUntil: 'networkidle' });
check('ALL SEVEN PASSING PUTS THE BUTTON THERE', await page.locator('[data-pay-approve] button').count() === 1);

/*
  Wait for the server action's POST to come back before reading the database.

  The fourth journey caught by this shape. The action redirects to the address the page is already
  on, so waiting for a URL resolves instantly and the DB read races the write — reporting working
  code as broken. Waiting on the response is the honest wait: it is the thing that has to finish.
*/
const posted = page.waitForResponse(r => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
await page.click('[data-pay-approve] button');
await posted;
await page.waitForFunction(
  () => /Approved by/i.test(document.querySelector('[data-pay-run]')?.textContent ?? ''),
  null, { timeout: 20000 },
).catch(() => {});
const [approved] = await sql`select approved_at, approved_by from pay_runs where id = ${runId}`;
check('AND IT APPROVES', Boolean(approved?.approved_at), String(approved?.approved_at));
check('WITH A NAME AGAINST IT', Boolean(approved?.approved_by));

/* ── Family and domestic violence leave is never named ───────────────────────────────────────── */

const staffId = randomUUID();
await sql`insert into staff ${sql({
  id: staffId, tenant_id: tenant.id, name: 'Sam Rivers', created_at: now,
})}`;
await sql`insert into leave_entries ${sql({
  id: randomUUID(), tenant_id: tenant.id, staff_id: staffId, kind: 'fdv',
  from_date: '2026-10-01', to_date: '2026-10-03', hours: 24,
  reason: 'private', state: 'requested', created_at: now,
})}`;

await page.goto(PAY, { waitUntil: 'networkidle' });
const leave = await page.locator('[data-leave]').count();
check('LEAVE IS ON THE PAY TAB', leave === 1);

if (leave === 1) {
  /*
    This account IS the approver, so it MAY see the kind. What is being proven here is that the
    machinery is in place and reads through labelFor — the "anyone" case is proven by the unit test
    and by the absence below.
  */
  const text = await page.locator('[data-leave]').innerText();
  check('THE REQUEST IS THERE', /Sam Rivers/.test(text), text.replace(/\n/g, ' ').slice(0, 160));
  check('AND SAYS IT SHOWS ONLY AS "LEAVE" TO ANYBODY ELSE', /only as .?Leave.? to anybody else/i.test(text), text.replace(/\n/g, ' ').slice(0, 300));
  check('IT IS NOT TRACKED AGAINST A BALANCE', /does not come out of a balance/i.test(text), text.replace(/\n/g, ' ').slice(0, 300));
}

/*
  The roster. Anybody can see who is in and who is not, and it must not say why. Checked over the
  whole page, because the leak this guards against is a screen that went round labelFor.
*/
await page.goto(`${BASE}/jobs?tab=schedule`, { waitUntil: 'networkidle' });
const roster = await page.content();
check('THE ROSTER NEVER NAMES IT', !/family and domestic violence/i.test(roster));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
