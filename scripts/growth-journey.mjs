/*
  Keep work coming — the Growth stream, driven with real rows in the database.

  The point of this journey is not that the tab renders. It is that the tab is RIGHT: a quote
  eleven days out has to offer the seven-day chase rather than the gentle first nudge, a chase
  already sent must never be offered twice, and a customer past their own rhythm has to appear
  without anybody tagging them. All three are arithmetic over dates, and arithmetic over dates is
  exactly what passes a unit test and then reads wrong on a screen.
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
const BUS = `Growth Test ${stamp}`;
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures.push(label);
};
const daysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString();
const daysOn = n => new Date(Date.now() + n * 86_400_000).toISOString();

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

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
await page.fill('input[name="email"]', `growth-${stamp}@journey.test`);
await page.fill('input[name="password"]', 'a-good-password-123');
await page.check('input[name="consent"]').catch(() => {});
await page.waitForTimeout(3000);
await page.click('button[type="submit"]');
await page.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

const [me] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;
const job = async (over = {}) => {
  const row = {
    id: randomUUID(), tenant_id: tenant.id, ref: `J-${Math.floor(Math.random() * 9000 + 1000)}`,
    stage: 'quoted', title: 'Switchboard', client: 'Somebody', value_cents: 500_000,
    created_by: me.id, created_at: daysAgo(30), stage_at: daysAgo(30), quoted_at: daysAgo(30),
    ...over,
  };
  await sql`insert into jobs ${sql(row)}`;
  return row;
};

// A quote eleven days out that nobody has touched.
const stale = await job({ ref: 'Q-ELEVEN', client: 'Dana Ward', quoted_at: daysAgo(11), value_cents: 480_000 });
// One too new to chase.
await job({ ref: 'Q-NEW', client: 'Fresh Co', quoted_at: daysAgo(1) });
// One already chased at three days, now four days out.
const chased = await job({ ref: 'Q-DONE', client: 'Chased Co', quoted_at: daysAgo(4) });
await sql`insert into quote_chases ${sql({
  id: randomUUID(), tenant_id: tenant.id, job_id: chased.id, day: 3,
  said: 'already went', sent_at: daysAgo(1),
})}`;
// One gone cold.
await job({ ref: 'Q-COLD', client: 'Silent Co', quoted_at: daysAgo(25) });

// A customer with a rhythm, now overdue: roughly every 6 months, last one 10 months ago.
for (const d of [760, 580, 400]) {
  await job({ stage: 'paid', client: 'Regular Pty', created_at: daysAgo(d), quoted_at: null, value_cents: 900_000 });
}
// A tender closing in three days.
await sql`insert into tenders ${sql({
  id: randomUUID(), tenant_id: tenant.id, title: 'Mill switchroom', builder: 'Big Builder',
  due_at: daysOn(3), status: 'open', created_at: daysAgo(10),
})}`;

const r = await page.goto(`${BASE}/jobs?tab=growth`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const txt = await page.evaluate(() => document.body.innerText);
check('THE TAB OPENS', new URL(page.url()).pathname === '/jobs' && (r?.status() ?? 0) < 400,
  `landed on ${new URL(page.url()).pathname}`);
check('  and it is reachable under Win the work', /Keep work coming/.test(txt));

check('A TENDER CLOSING THIS WEEK IS NAMED', /Mill switchroom/.test(txt) && /Closes in 3 days/.test(txt),
  txt.slice(0, 200).replace(/\n/g, ' '));

check('THE STALE QUOTE IS THERE', /Q-ELEVEN/.test(txt));
/*
  Case-insensitive, because the label is upper-cased by CSS and innerText returns what is RENDERED.
  The first version of this matched the source spelling, found nothing, and reported a failure
  against working code — and then the "never offered twice" check below passed for the same reason,
  having proved nothing at all. A check that cannot match is worse than a check that is absent.
*/
const offered = t => (t.match(/The (\d+)-day chase, written/i) ?? [])[1] ?? null;
check('  and it offers the 7-day chase, not the 3-day one', offered(txt) === '7',
  `offered the ${offered(txt) ?? 'no'}-day chase`);
check('A QUOTE TOO NEW TO CHASE IS LEFT ALONE', !/Q-NEW/.test(txt));
check('A CHASE ALREADY SENT IS NOT OFFERED AGAIN', !/Q-DONE/.test(txt));
check('A COLD QUOTE SAYS CALL IT, AND OFFERS NO CHASE', /Q-COLD/.test(txt) && /mark it lost/i.test(txt));

check('A CUSTOMER PAST THEIR OWN RHYTHM IS SURFACED', /Regular Pty/.test(txt), txt.slice(-500).replace(/\n/g, ' '));
check('  and it says what their rhythm is', /Normally back about every/.test(txt));

// The draft is real, and pressing "Sent it" records it so it is never offered twice.
const draft = await page.locator('textarea[readonly]').first().inputValue().catch(() => '');
check('THE CHASE IS WRITTEN, NOT LEFT TO THE USER', /Dana/.test(draft) && /Q-ELEVEN/.test(draft), draft.slice(0, 120));
check('  and it is signed by the business', draft.includes(BUS), draft.slice(-60));

const sent = page.locator('button:has-text("Sent it")').first();
check('THERE IS ONE PRESS TO RECORD IT', await sent.count() > 0);
if (await sent.count()) {
  await Promise.all([page.waitForLoadState('networkidle'), sent.click()]);
  await page.waitForTimeout(1000);
  const rows = await sql`select day from quote_chases where job_id = ${stale.id}`;
  check('  and it is recorded against the right quote, as the right chase',
    rows.length === 1 && rows[0].day === 7, JSON.stringify(rows));
  const after = await page.evaluate(() => document.body.innerText);
  /* Meaningful only because it WAS offered a moment ago — asserted above, not assumed. */
  check('  and the same chase is never offered twice', offered(after) !== '7',
    `still offering the ${offered(after)}-day chase`);
}

const real = errs.filter(e => !/_next\/hmr|WebSocket connection to 'ws:/i.test(e));
check('no console errors', real.length === 0, real[0] ?? '');
await page.screenshot({ path: '/tmp/claude-0/growth.png', fullPage: true });
await finish();
