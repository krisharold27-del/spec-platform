/*
  Who can see what, driven as three different people in three different browsers.

  This is the one that has to be proved rather than reasoned about. The model is tested; the
  question here is whether the PAGE honours it — and specifically whether typing ?tab=cash gets
  past it, because filtering the tab row only hides the door.
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
const BUS = `Sight Test ${stamp}`;
const PW = 'a-good-password-123';
const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${l}${ok || !d ? '' : `  — ${d}`}`);
  if (!ok) failures.push(l);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const finish = async () => {
  await browser.close(); await tidyUp(BUS); await sql.end();
  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} FAILED: ${failures.join(', ')}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
};

const boss = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await boss.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await boss.fill('input[name="name"]', 'Kris Harold');
await boss.fill('input[name="business"]', BUS);
await boss.fill('input[name="email"]', `sight-${stamp}@journey.test`);
await boss.fill('input[name="password"]', PW);
await boss.check('input[name="consent"]').catch(() => {});
await boss.waitForTimeout(3000);
await boss.click('button[type="submit"]');
await boss.waitForURL(u => !u.pathname.startsWith('/signup'), { timeout: 40000 }).catch(() => {});

const [tenant] = await sql`select id from tenants where name = ${BUS}`;
check('THE BUSINESS EXISTS', Boolean(tenant));
if (!tenant) await finish();

// A job worth real money, so "can they see the value" is a question with an answer.
await sql`insert into jobs ${sql({
  id: randomUUID(), tenant_id: tenant.id, ref: 'J-SECRET', stage: 'quoted',
  title: 'Switchboard', client: 'Big Builder', value_cents: 4_444_400,
  created_by: (await sql`select id from users where tenant_id = ${tenant.id} limit 1`)[0].id,
  created_at: new Date().toISOString(), stage_at: new Date().toISOString(),
})}`;

/*
  ── One account, three seats ────────────────────────────────────────────────────────────────────

  The obvious journey signs in as three different people. It cannot: creating a user by SQL gives
  them no account with the authentication provider, so they can never sign in, and building the
  full invite flow three times would test the invite flow rather than this.

  So the same signed-in person is moved between seats, which is the path that actually decides it —
  `seatFor` reads the staff row, and everything else follows from what it returns. It also proves
  something the three-people version could not: the change takes effect on the next page load,
  rather than being baked into a session at sign-in.
*/
const [meUser] = await sql`select id from users where tenant_id = ${tenant.id} limit 1`;

async function beSeat(kind) {
  await sql`delete from staff where tenant_id = ${tenant.id} and user_id = ${meUser.id}`;
  if (kind === 'leadership-by-chart') return;   // no staff row: falls back to the org chart
  await sql`insert into staff ${sql({
    id: randomUUID(), tenant_id: tenant.id, name: 'Kris Harold', user_id: meUser.id,
    seat_kind: kind === 'subcontractor' ? 'team' : kind,
    is_subcontractor: kind === 'subcontractor',
    created_at: new Date().toISOString(),
  })}`;
}

const MONEY = ['cash', 'wip', 'billing', 'customers', 'quotes', 'catalogue'];
const WORK = ['pipeline', 'schedule', 'time'];

async function landsOn(page, tab) {
  await page.goto(`${BASE}/jobs?tab=${tab}`, { waitUntil: 'networkidle' });
  return new URL(page.url()).pathname;
}

// ── The founder: leadership off the chart, sees everything ──────────────────────────────────────
await beSeat('leadership-by-chart');
for (const tab of [...MONEY, ...WORK]) {
  const at = await landsOn(boss, tab);
  check(`LEADERSHIP reaches ?tab=${tab}`, at === '/jobs', `landed on ${at}`);
}
await boss.goto(`${BASE}/jobs?tab=pipeline`, { waitUntil: 'networkidle' });
check('LEADERSHIP sees what a job is worth', /4,444/.test(await boss.evaluate(() => document.body.innerText)));

// ── A team member: the work, not the money ──────────────────────────────────────────────────────
await beSeat('team');
const team = boss;

for (const tab of WORK) {
  const at = await landsOn(team, tab);
  check(`  team reaches the work: ?tab=${tab}`, at === '/jobs', `landed on ${at}`);
}
for (const tab of MONEY) {
  const at = await landsOn(team, tab);
  check(`  team is TURNED AWAY from ?tab=${tab}`, at !== '/jobs', `landed on ${at}`);
}

await team.goto(`${BASE}/jobs?tab=pipeline`, { waitUntil: 'networkidle' });
const teamSees = await team.content();
check('A TEAM MEMBER NEVER SEES THE VALUE, even on the board', !/4,444/.test(teamSees),
  'the job value is in the page');
check('  and the money tabs are not even offered', !/Cash flow|Work in progress/.test(
  await team.evaluate(() => document.body.innerText)));
check('  but they can still see what is on', /J-SECRET|Switchboard/.test(
  await team.evaluate(() => document.body.innerText)));

// ── A subcontractor: their own work only ────────────────────────────────────────────────────────
await beSeat('subcontractor');
const subbie = boss;

for (const tab of [...MONEY, ...WORK]) {
  const at = await landsOn(subbie, tab);
  check(`  subbie is TURNED AWAY from ?tab=${tab}`, at !== '/jobs', `landed on ${at}`);
}
const subbieSees = await subbie.content();
check('A SUBCONTRACTOR NEVER SEES A JOB VALUE', !/4,444/.test(subbieSees));
check('  and is sent to their own work, not a dead end',
  new URL(subbie.url()).pathname === '/tech-day', `landed on ${new URL(subbie.url()).pathname}`);

await finish();
