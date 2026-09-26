/*
  Enquiry to paid, counted.

  Design 20's landing page (`siteVIP Landing.dc.html`) says "Enquiry to paid in 12 taps. Count
  them." A number on the front page is a promise, so this counts them: a fresh business, one
  enquiry, every press a person makes on the way to Paid — each one a click or a pick, typing not
  counted — in a real browser. The landing page may say the number only while this holds it.

    node scripts/fake-auth.mjs 54321 &
    npm start &
    node scripts/taps-journey.mjs http://localhost:3100
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

/** What the landing page says. If this fails, the page is wrong until the product is fixed. */
export const PROMISED_TAPS = 12;

const stamp = Date.now();
const BUS = `Taps Test ${stamp}`;
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
let taps = 0;
const tap = async (locator, label) => {
  taps += 1;
  console.log(`   tap ${taps}: ${label}`);
  await Promise.all([page.waitForLoadState('networkidle'), locator.click({ timeout: 20000 })]);
  await page.waitForTimeout(500);
};

const finish = async () => {
  await browser.close();
  await tidyUp(BUS);
  await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Kris Harold');
await page.fill('input[name="business"]', BUS);
await page.fill('input[name="email"]', `taps-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});
const [tenant] = await sql`select id from tenants where name = ${BUS}`;
if (!tenant) { check('THE BUSINESS EXISTS', false); await finish(); }

/* What a business has before its first job: one pre-build and a labour rate. Set up, not counted. */
const rateId = randomUUID();
await sql`insert into labour_rates ${sql({ id: rateId, tenant_id: tenant.id, name: 'Electrician', cost_cents: 6000, charge_cents: 11000, position: 0, created_at: new Date().toISOString() })}`;
await sql`insert into kits ${sql({ id: randomUUID(), tenant_id: tenant.id, name: 'Switchboard upgrade', components: '[]', labour_hours: 6, labour_rate_id: rateId, checklist: '[]', extra_cost_cents: 120000, created_at: new Date().toISOString() })}`;

await page.goto(`${BASE}/jobs?tab=pipeline`, { waitUntil: 'networkidle' });
await page.fill('input[name="enquiry"]', 'Sam Lee, switchboard upgrade, Balmain');
await tap(page.locator('form:has(input[name="enquiry"]) button[type="submit"]'), 'take the enquiry');
await tap(page.getByRole('button', { name: 'Build the quote' }).first(), 'build the quote');
await tap(page.getByRole('button', { name: '+ Switchboard upgrade' }), 'add the pre-build');
await tap(page.getByRole('button', { name: /Quote sent to/ }), 'quote sent');
const [job] = await sql`select id from jobs where tenant_id = ${tenant.id} and client = 'Sam Lee'`;
/* The quote builder hands back to the job; the pipeline opens on it. */
if (!page.url().includes(`job=${job.id}`)) {
  if (!page.url().includes('tab=pipeline')) await tap(page.getByRole('link', { name: 'Jobs', exact: true }).first(), 'back to Jobs');
  await tap(page.locator(`a[href*="job=${job.id}"]`).first(), 'open the job');
}
await tap(page.getByRole('button', { name: 'Mark as won' }), 'won');
await page.locator('select[name="person"]').selectOption({ index: 1 });
taps += 1; console.log(`   tap ${taps}: pick who`);
await tap(page.getByRole('button', { name: 'Book', exact: true }), 'book them');
if (!page.url().includes(`job=${job.id}`)) {
  if (!page.url().includes('tab=pipeline')) await tap(page.getByRole('link', { name: 'Jobs', exact: true }).first(), 'back to Jobs');
  await tap(page.locator(`a[href*="job=${job.id}"]`).first(), 'back to the job');
}
await tap(page.getByRole('button', { name: 'Start on site' }), 'on site');
await tap(page.getByRole('button', { name: 'Job done, invoice it' }), 'invoice it');
await tap(page.getByRole('button', { name: 'Mark as paid' }), 'paid');

const [done] = await sql`select stage from jobs where id = ${job.id}`;
check('THE JOB GOT ALL THE WAY TO PAID', done?.stage === 'paid', JSON.stringify(done));
check(`ENQUIRY TO PAID IN ${PROMISED_TAPS} TAPS OR FEWER (${taps} counted)`, taps <= PROMISED_TAPS, `${taps} taps`);
await finish();
