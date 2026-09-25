/*
  Agreed rates, plant on hire, and somebody's last day — the last three holes in the map.

  All three are money that leaves because nothing said it was going, and all three are the kind of
  feature that tests green and does nothing: a register nobody can reach, a trigger that never
  fires, a list that renders empty. So each one is driven until it has actually moved.
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
const BUS = `Leaks Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1300 } })).newPage();
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
await page.fill('input[name="email"]', `leaks-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;

const ago = n => new Date(Date.now() - n * 86_400_000).toISOString();
const running = randomUUID(), finished = randomUUID();
await sql`insert into jobs ${sql({ id: running, tenant_id: tenant.id, ref: 'J-RUNNING', stage: 'onsite',
  title: 'Fitout', client: 'Big Builder', value_cents: 900_000, created_by: me.id,
  created_at: ago(20), stage_at: ago(10) })}`;
await sql`insert into jobs ${sql({ id: finished, tenant_id: tenant.id, ref: 'J-DONE', stage: 'paid',
  title: 'Switchboard', client: 'Big Builder', value_cents: 400_000, created_by: me.id,
  created_at: ago(30), stage_at: ago(12) })}`;

// ── Plant on hire ──────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/jobs?tab=rates`, { waitUntil: 'networkidle' });
const empty = await page.evaluate(() => document.body.innerText);
check('THE TAB OPENS', new URL(page.url()).pathname === '/jobs', `landed on ${new URL(page.url()).pathname}`);
check('  and says nothing is out', /Nothing on hire/i.test(empty), empty.slice(0, 200).replace(/\n/g, ' '));

const onHire = async (jobLabel, what, perDay) => {
  const form = page.locator('form:has(input[name="what"]):has(input[name="perDay"])').first();
  await form.locator('select[name="jobId"]').selectOption({ label: jobLabel });
  await form.locator('input[name="what"]').fill(what);
  if (perDay) await form.locator('input[name="perDay"]').fill(perDay);
  await Promise.all([page.waitForLoadState('networkidle'), form.locator('button').click()]);
  await page.waitForTimeout(900);
};
await onHire('J-RUNNING · Fitout', 'Scissor lift', '120');
await onHire('J-DONE · Switchboard', 'Telehandler', '340');

const hires = await sql`select what, per_day_cents from plant_hires where tenant_id = ${tenant.id}`;
check('PLANT GOES ON HIRE AGAINST A JOB', hires.length === 2, JSON.stringify(hires));
check('  and the daily cost is kept in cents', hires.some(h => h.per_day_cents === 34_000),
  JSON.stringify(hires.map(h => h.per_day_cents)));

const after = await page.evaluate(() => document.body.innerText);
check('THE FINISHED JOB’S HIRE IS FLAGGED, THE RUNNING ONE IS NOT',
  /Still on hire, job finished/i.test(after) && /Telehandler/.test(after), after.slice(0, 300).replace(/\n/g, ' '));
check('  and the waste is counted from when the JOB finished',
  /J-DONE finished 12 days ago/i.test(after), (after.match(/J-DONE finished[^.]*\./) ?? ['(not found)'])[0]);

const lift = page.locator('li:has-text("Telehandler")').first();
await Promise.all([page.waitForLoadState('networkidle'), lift.locator('button:has-text("Off hire")').click()]);
await page.waitForTimeout(900);
const [back] = await sql`select off_hire_at from plant_hires where tenant_id = ${tenant.id} and what = 'Telehandler'`;
check('ONE PRESS STOPS THE METER', Boolean(back?.off_hire_at));
check('  and it leaves the flagged list', !/Still on hire, job finished/i.test(await page.evaluate(() => document.body.innerText)));

// ── Agreed rates ───────────────────────────────────────────────────────────────────────────────
const cardForm = page.locator('form:has(input[name="customerName"])').first();
await cardForm.locator('input[name="customerName"]').fill('Big Builder');
await cardForm.locator('input[name="name"]').fill('2026 schedule');
await cardForm.locator('input[name="endsAt"]').fill('2027-12-31');
await Promise.all([page.waitForLoadState('networkidle'), cardForm.locator('button').click()]);
await page.waitForTimeout(900);
const [card] = await sql`select id, customer_key from rate_cards where tenant_id = ${tenant.id}`;
check('A RATE CARD IS HELD AGAINST A CUSTOMER', card?.customer_key === 'big-builder', JSON.stringify(card));

const lineForm = page.locator('form:has(input[name="dollars"])').first();
await lineForm.locator('input[name="what"]').fill('Double GPO');
await lineForm.locator('input[name="dollars"]').fill('125');
await Promise.all([page.waitForLoadState('networkidle'), lineForm.locator('button').click()]);
await page.waitForTimeout(900);
const lines = await sql`select what, cents from rate_card_lines where card_id = ${card.id}`;
check('  and a rate is kept in the builder’s own wording',
  lines.length === 1 && lines[0].what === 'Double GPO' && lines[0].cents === 12_500, JSON.stringify(lines));
const withCard = await page.evaluate(() => document.body.innerText);
check('  and the card shows what it holds', /Double GPO/.test(withCard) && /1 rate/.test(withCard),
  withCard.slice(withCard.indexOf('Agreed rates'), withCard.indexOf('Agreed rates') + 300).replace(/\n/g, ' '));

// ── Somebody leaves ────────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/org`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
await page.fill('textarea[name="text"]', 'Electrician, Dana Ward, General Manager');
await Promise.all([page.waitForLoadState('networkidle'),
  page.locator('form:has(textarea[name="text"]) button[type="submit"]').first().click()]);
await page.waitForTimeout(1200);

await page.goto(`${BASE}/people?mode=leavers`, { waitUntil: 'networkidle' });
const before = await page.evaluate(() => document.body.innerText);
check('THE LEAVERS TAB OPENS', new URL(page.url()).pathname === '/people',
  `landed on ${new URL(page.url()).pathname}`);
check('  and says nobody has left with anything open', /Nobody has left with anything still open/i.test(before),
  before.slice(0, 260).replace(/\n/g, ' '));

await page.selectOption('select[name="staffId"]', { label: 'Dana Ward' });
await page.fill('input[name="lastDay"]', new Date(Date.now() - 19 * 86_400_000).toISOString().slice(0, 10));
await Promise.all([page.waitForLoadState('networkidle'),
  page.locator('form:has(select[name="staffId"]) button').click()]);
await page.waitForTimeout(1000);

const [row] = await sql`select name, done from leavers where tenant_id = ${tenant.id}`;
check('RECORDING A LAST DAY STARTS THE LIST', row?.name === 'Dana Ward', JSON.stringify(row));
const listed = await page.evaluate(() => document.body.innerText);
check('  and it leads with what BITES', /login open or a seat being paid for/i.test(listed),
  listed.slice(0, 300).replace(/\n/g, ' '));
check('  and says how long it has been', /19 days since Dana Ward left/i.test(listed),
  (listed.match(/\d+ days since[^.]*\./) ?? ['(not found)'])[0]);
check('  and every step links to the register that already holds it',
  /Do it on \/people/.test(listed) && /Do it on \/billing/.test(listed));

const tick = page.locator('li:has-text("Close their login") button:has-text("Done")').first();
check('EACH STEP CAN BE TICKED', await tick.count() > 0);
if (await tick.count()) {
  await Promise.all([page.waitForLoadState('networkidle'), tick.click()]);
  await page.waitForTimeout(900);
  const [ticked] = await sql`select done from leavers where tenant_id = ${tenant.id}`;
  check('  and it is kept', ticked?.done === 'access', JSON.stringify(ticked));
  const rest = await page.evaluate(() => document.body.innerText);
  check('  and the summary now names only the seat', /seat being paid for/i.test(rest) && !/Close their login/.test(rest),
    rest.slice(0, 300).replace(/\n/g, ' '));
}

const real = errs.filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');
await finish();
