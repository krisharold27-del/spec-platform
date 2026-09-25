/*
  The certificate that proves the work was lawful.

  The reason this is driven rather than trusted: the whole feature turns on SPEC refusing to invent
  a deadline, and "refuses to invent" is exactly the kind of claim that is true in a pure function
  and quietly false on a screen that shows a countdown anyway.
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
const BUS = `Cert Test ${stamp}`;
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
await page.fill('input[name="email"]', `cert-${stamp}@journey.test`);
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
const mk = async (ref, doneDaysAgo) => {
  const r = { id: randomUUID(), tenant_id: tenant.id, ref, stage: 'paid', title: 'Switchboard',
    client: 'Cust', value_cents: 500_000, created_by: me.id,
    created_at: ago(doneDaysAgo + 5), stage_at: ago(doneDaysAgo) };
  await sql`insert into jobs ${sql(r)}`;
  return r;
};
const old = await mk('J-OLD', 40);
await mk('J-NEW', 1);

// ── Before anything is set up ───────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/jobs?tab=certificates`, { waitUntil: 'networkidle' });
const blank = await page.evaluate(() => document.body.innerText);
check('THE TAB OPENS', new URL(page.url()).pathname === '/jobs', `landed on ${new URL(page.url()).pathname}`);
check('  and says nobody has told SPEC what yours is called', /Nobody has told SPEC/i.test(blank),
  blank.slice(0, 260).replace(/\n/g, ' '));

// ── Named, but no window: outstanding, and explicitly NOT called late ──────────────────────────
await page.selectOption('select[name="territory"]', 'NSW');
await page.fill('input[name="name"]', 'Certificate of Compliance Electrical Work');
await page.fill('input[name="withinDays"]', '');
await Promise.all([page.waitForLoadState('networkidle'),
  page.locator('form:has(select[name="territory"]) button').click()]);
await page.waitForTimeout(900);
const noWindow = await page.evaluate(() => document.body.innerText);
check('NAMED BUT NO WINDOW: the job is outstanding', /J-OLD/.test(noWindow));
check('  and SPEC REFUSES TO SAY IT IS LATE', /does not know your lodgement window/i.test(noWindow),
  noWindow.slice(0, 400).replace(/\n/g, ' '));
check('  and never shows an invented countdown', !/days? (left|overdue|remaining)/i.test(noWindow));

// ── With the business's own window, it is late ─────────────────────────────────────────────────
await page.fill('input[name="withinDays"]', '7');
await Promise.all([page.waitForLoadState('networkidle'),
  page.locator('form:has(select[name="territory"]) button').click()]);
await page.waitForTimeout(900);
const windowed = await page.evaluate(() => document.body.innerText);
check('WITH THE BUSINESS’S OWN WINDOW, A 40-DAY-OLD JOB IS LATE', /past the 7 you set/i.test(windowed),
  windowed.slice(0, 400).replace(/\n/g, ' '));
check('  and a one-day-old job is not', !/J-NEW[\s\S]{0,120}past the 7/i.test(windowed));

// ── Written is not lodged ──────────────────────────────────────────────────────────────────────
const row = page.locator('li:has-text("J-OLD")').first();
await row.locator('input[name="ref"]').fill('CCEW-99123');
await Promise.all([page.waitForLoadState('networkidle'), row.locator('button:has-text("Written")').click()]);
await page.waitForTimeout(900);
const [issued] = await sql`select certificate_ref, certificate_issued_at, certificate_lodged_at from jobs where id = ${old.id}`;
check('WRITING IT RECORDS THE NUMBER', issued?.certificate_ref === 'CCEW-99123', JSON.stringify(issued));
check('  and does NOT mark it lodged', issued?.certificate_lodged_at === null);
const written = await page.evaluate(() => document.body.innerText);
/*
  Report the ROW, not the whole page. The first version printed the page from the top on failure,
  which is the navigation — six hundred characters of menu and not one word about the thing being
  checked. A failure message that does not contain the evidence is a failure message that gets read
  once and then ignored.
*/
const owedText = written.slice(written.indexOf('Still owed'), written.indexOf('Still owed') + 500);
check('  and the screen says it still has to be lodged',
  /written but never lodged|still has to be lodged/i.test(owedText), owedText.replace(/\n/g, ' '));
check('  and counts it as written but not sent', /written but not sent/i.test(written),
  (written.match(/\d+ finished job[\s\S]{0,160}/) ?? ['(no summary line found)'])[0].replace(/\n/g, ' '));

// ── Lodging finishes it ────────────────────────────────────────────────────────────────────────
const row2 = page.locator('li:has-text("J-OLD")').first();
await Promise.all([page.waitForLoadState('networkidle'), row2.locator('button:has-text("Lodged")').click()]);
await page.waitForTimeout(900);
const [lodged] = await sql`select certificate_lodged_at from jobs where id = ${old.id}`;
check('LODGING FINISHES IT', Boolean(lodged?.certificate_lodged_at));
const done = await page.evaluate(() => document.body.innerText);
check('  and it leaves the still-owed list', !/J-OLD/.test(done), done.slice(0, 300).replace(/\n/g, ' '));

// ── A job excused needs a reason ───────────────────────────────────────────────────────────────
const newRow = page.locator('li:has-text("J-NEW")').first();
await Promise.all([page.waitForLoadState('networkidle'), newRow.locator('button:has-text("Not needed")').click()]);
await page.waitForTimeout(900);
const [notExcused] = await sql`select no_certificate_because from jobs where ref = 'J-NEW' and tenant_id = ${tenant.id}`;
check('A BLANK REASON EXCUSES NOTHING', !notExcused?.no_certificate_because, JSON.stringify(notExcused));

const newRow2 = page.locator('li:has-text("J-NEW")').first();
await newRow2.locator('input[name="why"]').fill('Supply only, no installation');
await Promise.all([page.waitForLoadState('networkidle'), newRow2.locator('button:has-text("Not needed")').click()]);
await page.waitForTimeout(900);
const [excused] = await sql`select no_certificate_because from jobs where ref = 'J-NEW' and tenant_id = ${tenant.id}`;
check('  but a real one does, and is kept', excused?.no_certificate_because === 'Supply only, no installation',
  JSON.stringify(excused));

const real = errs.filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');
await page.screenshot({ path: '/tmp/claude-0/certificates.png', fullPage: true });
await finish();
