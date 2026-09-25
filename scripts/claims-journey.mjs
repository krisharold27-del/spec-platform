/*
  Progress claims, and the two job types.

  The claim that matters here is the one a business most often loses money on without knowing: under
  every Security of Payment Act, a client who does not respond with a payment schedule inside the
  window generally loses the right to argue about the amount. Missing that requires nothing but
  nobody looking for three weeks.

  So this proves SPEC counts the days — and, just as important, that it REFUSES to count them until
  the business has told it which Act it works under. A deadline SPEC invented would be worse than
  none, because a business watching a made-up window while a real one lapses has been harmed by the
  thing it trusted.

  It also proves the simplicity rule that is the whole argument against SimPro: project-only steps
  appear only on projects. A sparkie doing a two-hour service call should never see a retention
  field.
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
const BUS = `Claims Test ${stamp}`;
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
await page.fill('input[name="email"]', `claims-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;

const now = new Date();
const iso = now.toISOString();
const daysAgo = n => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);

/* One of each kind, so the switch has something to switch between. */
const projectId = randomUUID();
const maintId = randomUUID();
await sql`insert into jobs ${sql({
  id: projectId, tenant_id: tenant.id, ref: 'J-PROJ', stage: 'won', title: 'Warehouse fitout',
  client: 'Harbourview', work_kind: 'project', value_cents: 22_000_000,
  created_by: me.id, created_at: iso, stage_at: iso,
})}`;
await sql`insert into jobs ${sql({
  id: maintId, tenant_id: tenant.id, ref: 'J-MAINT', stage: 'won', title: 'Switchboard service',
  client: 'Bean There', work_kind: 'maintenance', value_cents: 90_000,
  created_by: me.id, created_at: iso, stage_at: iso,
})}`;

/* A claim served forty days ago and never responded to — the expensive one. */
await sql`insert into job_bills ${sql({
  id: randomUUID(), tenant_id: tenant.id, job_id: projectId, kind: 'claim',
  what: 'Progress claim 2', amount_cents: 2_230_000, retention_cents: 111_500,
  state: 'sent', claim_number: 2, sent_at: daysAgo(40), served_at: daysAgo(40),
  created_at: iso, updated_at: iso,
})}`;

const BILLING = `${BASE}/jobs?tab=billing`;
await page.goto(BILLING, { waitUntil: 'networkidle' });

check('THE CLAIMS PANEL IS THERE', await page.locator('[data-claims]').count() === 1);
check('THE CLAIM IS LISTED', await page.locator('[data-claim]').count() === 1);

/*
  No Act set. SPEC must track it and refuse to say it is late — the whole rule of this file.
*/
const beforeText = await page.locator('[data-claims]').innerText();
check('SPEC WILL NOT SAY IT IS LATE WITHOUT THE ACT', /will not/i.test(beforeText), beforeText.replace(/\n/g, ' ').slice(0, 200));
check('AND ASKS FOR IT ONCE', await page.locator('[data-claims-not-set]').count() === 1);
check('IT DOES NOT INVENT A DEADLINE', !/\b(10|15|20|28)\s*days?\b/.test(beforeText), beforeText.replace(/\n/g, ' ').slice(0, 200));

/* Now the business sets its own Act. */
await sql`update tenants set sopa_territory = ${'NSW'},
            sopa_act_name = ${'Building and Construction Industry Security of Payment Act 1999'},
            sopa_schedule_within_days = ${10}, sopa_pay_within_days = ${15}
          where id = ${tenant.id}`;

await page.goto(BILLING, { waitUntil: 'networkidle' });
const afterText = await page.locator('[data-claims]').innerText();
check('ONCE THE ACT IS SET IT COUNTS THE DAYS', /40 days/.test(afterText), afterText.replace(/\n/g, ' ').slice(0, 200));
check('AND IT IS THE MISSED-SCHEDULE STATE', await page.locator('[data-claim-state="schedule_missed"]').count() === 1);

/* The sentence that is worth the most money on this screen. */
const next = await page.locator('[data-claim-next]').innerText();
check('IT SAYS WHAT A MISSED SCHEDULE MEANS', /loses the right to dispute/i.test(next), next.slice(0, 160));

/* The wording rule: clients, never builders as a general term. */
check('IT NEVER CALLS A CLIENT A BUILDER', !/\bbuilders?\b/i.test(afterText.replace(/A builder is one kind of client[^.]*\./i, '')), afterText.replace(/\n/g, ' ').slice(0, 200));

/* ── Retention that is due back and nobody has asked ─────────────────────────────────────────── */

await sql`insert into retentions ${sql({
  id: randomUUID(), tenant_id: tenant.id, job_id: projectId, held_cents: 1_115_000,
  release_terms: '5% for 12 months from practical completion',
  defects_end_at: daysAgo(5), created_at: iso,
})}`;
await page.goto(BILLING, { waitUntil: 'networkidle' });
const ret = await page.locator('[data-retentions]').innerText();
check('RETENTION DUE BACK IS FOUND', /due back and nobody has asked/i.test(ret), ret.replace(/\n/g, ' ').slice(0, 200));
check('AND THE REQUEST IS DRAFTED', await page.locator('[data-retention-closing]').count() === 1);

/* ── Two job types ───────────────────────────────────────────────────────────────────────────── */

await page.goto(`${BASE}/jobs?tab=pipeline`, { waitUntil: 'networkidle' });
check('THE ALL/MAINTENANCE/PROJECTS SWITCH IS THERE', await page.locator('[data-pipeline-filter]').count() === 3);

const all = await page.content();
check('BOTH JOBS SHOW UNDER ALL', all.includes('J-PROJ') && all.includes('J-MAINT'));
check('EACH CARD SAYS ITS TYPE', await page.locator('[data-job-type]').count() === 2);

const mixLine = await page.locator('[data-pipeline-mix]').innerText();
check('THE BOOKS ARE SPLIT BY TYPE', /lands this month/i.test(mixLine), mixLine.slice(0, 160));

await page.goto(`${BASE}/jobs?tab=pipeline&kind=maintenance`, { waitUntil: 'networkidle' });
const maint = await page.content();
check('MAINTENANCE HIDES THE PROJECT', maint.includes('J-MAINT') && !maint.includes('J-PROJ'));

await page.goto(`${BASE}/jobs?tab=pipeline&kind=project`, { waitUntil: 'networkidle' });
const proj = await page.content();
check('PROJECTS HIDES THE MAINTENANCE', proj.includes('J-PROJ') && !proj.includes('J-MAINT'));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
