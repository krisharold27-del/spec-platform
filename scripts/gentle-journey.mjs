/*
  "Hang on a second, is this correct?" — and what happens when somebody says yes.

  Kris, 25 September: never a red WRONG. The wording is the feature, and the thing that makes it
  more than a speed bump is that "Yes, it's right" KEEPS what was entered and is written down — so
  three of the same answer from the same person becomes a conversation a fortnight later rather than
  three separate Tuesdays nobody connected.

  So what has to be proven in a browser is exactly the opposite of what a validation test normally
  proves: that the thing was NOT blocked. A quote priced under cost must still be a quote priced
  under cost after the prompt has been answered, and the record must exist.

  It also proves what the leader is shown. One confirmed under-cost quote must NOT appear — showing
  a leader every individual confirmation turns a gentle prompt into surveillance, and people stop
  answering honestly. Three does appear.
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
const BUS = `Gentle Test ${stamp}`;
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
await page.fill('input[name="email"]', `gentle-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();
const [me] = await sql`select id, name from users where tenant_id = ${tenant.id} limit 1`;
const now = new Date().toISOString();

/* ── A quote priced under what the work costs ────────────────────────────────────────────────── */

const jobId = randomUUID();
await sql`insert into jobs ${sql({
  id: jobId, tenant_id: tenant.id, ref: 'J-CHEAP', stage: 'quoted', title: 'Switchboard upgrade',
  client: 'Harbourview', value_cents: 100000, created_by: me.id,
  created_at: now, stage_at: now, quoted_at: now,
})}`;

const quoteId = randomUUID();
await sql`insert into quotes ${sql({
  id: quoteId, tenant_id: tenant.id, job_id: jobId, ref: 'Q-CHEAP',
  /* A negative markup prices the sell below the cost, which is the whole point of this one. */
  markup_pct: -40, status: 'draft', created_at: now, updated_at: now,
})}`;
await sql`insert into quote_lines ${sql({
  id: randomUUID(), tenant_id: tenant.id, quote_id: quoteId, kind: 'material',
  name: 'Switchboard', ref_id: '', qty: 1, unit_cost_cents: 200000, position: 1,
  hours: 0, rate_cost_cents: 0, rate_charge_cents: 0,
})}`;

await page.goto(`${BASE}/jobs?tab=quotes&quote=${quoteId}`, { waitUntil: 'networkidle' });

check('THE PROMPT IS THERE', await page.locator('[data-gentle="under_cost"]').count() === 1);

const asked = await page.locator('[data-gentle-ask]').innerText();
check('IT ASKS RATHER THAN TELLS', /hang on a second, is this correct/i.test(asked), asked.slice(0, 90));

const because = await page.locator('[data-gentle-because]').innerText();
check('IT GIVES THE REASON IN REAL FIGURES', /\$/.test(because), because.slice(0, 140));
check('IT ALLOWS FOR THE ANSWER BEING YES', /unless you meant to/i.test(because), because.slice(0, 160));

/* Never a red WRONG. The wording is the feature. */
const whole = (await page.locator('[data-gentle="under_cost"]').innerText()).toLowerCase();
for (const banned of ['wrong', 'invalid', 'error', 'not allowed']) {
  check(`IT NEVER SAYS "${banned.toUpperCase()}"`, !whole.includes(banned), whole.slice(0, 120));
}

check('BOTH ANSWERS ARE REAL', await page.locator('[data-gentle-yes]').count() === 1 && await page.locator('[data-gentle-check]').count() === 1);

/* ── Saying yes keeps it ─────────────────────────────────────────────────────────────────────── */

const posted = page.waitForResponse(r => r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
await page.click('[data-gentle-yes]');
await posted;

const [kept] = await sql`select markup_pct from quotes where id = ${quoteId}`;
check('THE QUOTE IS UNCHANGED — NOTHING WAS BLOCKED', kept?.markup_pct === -40, String(kept?.markup_pct));

const confirmed = await sql`select prompt_key, who, what from gentle_confirmations where tenant_id = ${tenant.id}`;
check('THE ANSWER WAS WRITTEN DOWN', confirmed.length === 1, `${confirmed.length} rows`);
/* The QUOTE ref, not the job's — it identifies the exact quote a leader would go and look at. */
check('WITH WHO AND WHICH QUOTE', confirmed[0]?.prompt_key === 'under_cost' && /Q-CHEAP/.test(confirmed[0]?.what ?? ''), JSON.stringify(confirmed[0] ?? {}));
check('AND THE NAME OF WHOEVER SAID YES', Boolean(confirmed[0]?.who), String(confirmed[0]?.who));

/* ── What the leader sees ────────────────────────────────────────────────────────────────────── */

const PAY = `${BASE}/people?mode=pay`;
await page.goto(PAY, { waitUntil: 'networkidle' });
check('THE LEADER HAS A PLACE TO SEE PATTERNS', await page.locator('[data-patterns]').count() === 1);

/*
  One is a Tuesday. Showing a leader every individual confirmation turns a gentle prompt into
  surveillance, people stop answering honestly, and the prompts become worthless.
*/
check('ONE CONFIRMATION IS NOT A PATTERN', await page.locator('[data-pattern]').count() === 0);
const none = await page.locator('[data-patterns]').innerText();
check('AND IT SAYS SO WITHOUT ALARM', /nothing to have a word about/i.test(none), none.replace(/\n/g, ' ').slice(0, 160));

/* Two more of the same, from the same person. */
for (let i = 0; i < 2; i += 1) {
  await sql`insert into gentle_confirmations ${sql({
    id: randomUUID(), tenant_id: tenant.id, prompt_key: 'under_cost',
    who: me.name ?? 'Kris Harold', what: `J-OTHER-${i} priced under cost`, created_at: now,
  })}`;
}

await page.goto(PAY, { waitUntil: 'networkidle' });
check('THREE IS A PATTERN', await page.locator('[data-pattern="under_cost"]').count() === 1);

const pattern = await page.locator('[data-pattern="under_cost"]').innerText();
check('IT NAMES THE PERSON AND THE COUNT', /3 quotes/.test(pattern), pattern.replace(/\n/g, ' ').slice(0, 160));
/* The useful reading: a pattern usually means the pricing is wrong, not the person. */
check('IT POINTS AT THE PRICING, NOT THE PERSON', /pricing is wrong or the rate is/i.test(pattern), pattern.replace(/\n/g, ' ').slice(0, 200));

const panel = await page.locator('[data-patterns]').innerText();
check('AND SAYS IT IS NOT CHECKING UP ON ANYBODY', /not to check up on anybody/i.test(panel), panel.replace(/\n/g, ' ').slice(0, 220));

check('NOTHING BROKE IN THE BROWSER', errs.length === 0, errs.slice(0, 2).join(' | '));

await finish();
