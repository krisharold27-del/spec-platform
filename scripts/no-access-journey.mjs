/*
  Turned up and could not get in — one press, on a phone, in a driveway.

  Driven at 390x844 with touch, because that is the only place this button is ever used and a
  control that only works at desk width fails the one test it has.
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
const BUS = `NoAccess Test ${stamp}`;
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const office = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const page = await office.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `noaccess-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id, name from users where tenant_id = ${tenant.id} limit 1`;

const today = new Date().toISOString().slice(0, 10);
const jobId = randomUUID();
await sql`insert into jobs ${sql({
  id: jobId, tenant_id: tenant.id, ref: 'J-LOCKED', stage: 'scheduled', title: 'Switchboard',
  client: 'Dana Ward', site: '12 Mill St', value_cents: 400_000, created_by: me.id,
  created_at: new Date().toISOString(), stage_at: new Date().toISOString(),
})}`;
/*
  Booked on today, so it is on this person's day.

  The key is `user:<id>` — what tech-day actually looks for. The first version of this slugged the
  person's name, which is how the REWORK form keys a return visit, and the phone found nothing: two
  different key shapes in one schema, and a journey that guessed the wrong one reported a missing
  button rather than a missing booking.
*/
await sql`insert into schedule_bookings ${sql({
  id: randomUUID(), tenant_id: tenant.id, job_id: jobId,
  person_key: `user:${me.id}`,
  person_name: me.name ?? 'Kris Harold', day: today,
  created_by: me.id, created_at: new Date().toISOString(),
})}`;

// ── On the phone ───────────────────────────────────────────────────────────────────────────────
const them = await phone.newPage();
const theirErrs = [];
them.on('pageerror', e => theirErrs.push(String(e).slice(0, 200)));
them.on('console', m => { if (m.type() === 'error') theirErrs.push(m.text().slice(0, 200)); });

/* Carry the office's session onto the phone — the same person, on their own device. */
const cookies = await office.cookies();
await phone.addCookies(cookies);

await them.goto(`${BASE}/tech-day`, { waitUntil: 'networkidle' });
await them.waitForTimeout(1200);
const start = await them.evaluate(() => document.body.innerText);
check('THE JOB IS ON THEIR DAY', /J-LOCKED|Switchboard/.test(start), start.slice(0, 260).replace(/\n/g, ' '));

const button = them.locator('button:has-text("Could not get in")').first();
check('THERE IS ONE BUTTON FOR IT', await button.count() > 0);
if (await button.count() === 0) await finish();

const box = await button.boundingBox();
check('  and it is thumb-sized', (box?.height ?? 0) >= 44, `${Math.round(box?.height ?? 0)}px`);

check('IT ASKS NOTHING BEFORE IT IS PRESSED',
  await them.locator('input[name="because"]').count() === 0,
  'a reason field is shown before anything is recorded');

await Promise.all([them.waitForLoadState('networkidle'), button.click()]);
await them.waitForTimeout(1200);

const rows = await sql`select who, told_at, because from no_access_visits where job_id = ${jobId}`;
check('ONE PRESS RECORDS IT', rows.length === 1, JSON.stringify(rows));
check('  and tells the customer as part of the same press', Boolean(rows[0]?.told_at));
check('  and asked for no reason', rows[0]?.because === null);

const [job] = await sql`select stage from jobs where id = ${jobId}`;
check('  and the job goes back on the list to rebook', job?.stage === 'won', `stage is ${job?.stage}`);

const after = await them.evaluate(() => document.body.innerText);
check('  and it says so, including that there is no charge',
  /back on the list to rebook/i.test(after) && /no charge/i.test(after), after.slice(0, 300).replace(/\n/g, ' '));

// The reason, offered afterwards.
const why = them.locator('button:has-text("Say why, if you want to")').first();
check('THE REASON IS OFFERED AFTERWARDS', await why.count() > 0);
if (await why.count()) {
  await why.click();
  await them.fill('input[name="because"]', 'Nobody home, no key left');
  await Promise.all([them.waitForLoadState('networkidle'), them.locator('button:has-text("Add it")').click()]);
  await them.waitForTimeout(1000);
  const all = await sql`select because from no_access_visits where job_id = ${jobId} order by created_at`;
  check('  and it is kept', all.some(r => r.because === 'Nobody home, no key left'), JSON.stringify(all));
}

// ── Back in the office ─────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/jobs?tab=rework`, { waitUntil: 'networkidle' });
const officeText = await page.evaluate(() => document.body.innerText);
check('THE OFFICE SEES IT COUNTED', /could not get in this year/i.test(officeText),
  officeText.slice(0, 300).replace(/\n/g, ' '));
check('  and is asked for what one costs, rather than shown an invented figure',
  /Set what one costs you in hours/i.test(officeText) && !/\$\s?0\.00 of driving/i.test(officeText));

const real = [...errs, ...theirErrs].filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');
await them.screenshot({ path: '/tmp/claude-0/no-access.png', fullPage: true });
await finish();
