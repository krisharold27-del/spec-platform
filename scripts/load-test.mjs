// Twenty thousand seats, and does it still open in the morning?
//
//   node scripts/load-test.mjs [seats]
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// The cockpit's readiness list carried one honest red line for months: "Load-tested to twenty
// thousand seats — never run. The largest thing SPEC has served is one business."
//
// That gap is not academic. SPEC is sold on a number — twenty thousand seats — and a product sold
// on a number it has never been held to is a promise with nothing behind it. Worse, the way a
// multi-tenant product fails at scale is not a crash. It is one business's morning page getting
// slower every week as OTHER businesses sign up, which looks like nothing until it looks like
// everything, and by then the customers who felt it have gone.
//
// ── What it actually measures ────────────────────────────────────────────────────────────────────
//
// The question is not "can the database hold 20,000 rows" — any database can. It is:
//
//   **Does one business's page cost more because other businesses exist?**
//
// Every query in SPEC is scoped to a tenant. If the indexes are right, a business with 30 people
// costs the same whether it is the only customer or the six-hundredth. If an index is missing,
// Postgres reads the whole table to find those 30 rows, and the cost grows with every customer
// signed — the exact shape of failure above.
//
// So this seeds a realistic population, then does two things:
//
//   1. **Times the real pages** over HTTP, as a customer gets them.
//   2. **Reads the query plans** for the hot paths and fails on a sequential scan over a large
//      table — which is the cause, where a slow page is only the symptom. A plan is a fact about
//      how the query will behave at ANY size; a timing on a quiet laptop is not.
//
// The second is the one that matters. A seq scan on a table of 20,000 rows is fast enough to pass
// a stopwatch and is still the bug that will take the product down at 200,000.

import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SEATS = Number(process.argv[2] ?? 20_000);
const PER_BUSINESS = 30;          // An $8–30m business: a GM and four streams with people under them.
const BUSINESSES = Math.ceil(SEATS / PER_BUSINESS);

function databaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  try {
    const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const line = text.split('\n').find(l => /^\s*DATABASE_URL\s*=/.test(l));
    return line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  } catch { return undefined; }
}

const url = databaseUrl();
if (!url) {
  console.error('No DATABASE_URL, and none in .env.local. Nothing to load-test.');
  process.exit(2);
}
if (/supabase\.(co|com)/i.test(url)) {
  // Twenty thousand fabricated seats do not go in the database customers are in. This is not a
  // configuration preference; it is the difference between a test and an incident.
  console.error('That DATABASE_URL points at the hosted database. Refusing — this writes 20,000 rows.');
  process.exit(2);
}

const sql = postgres(url, { max: 4, idle_timeout: 20, onnotice: () => {} });
const say = s => console.log(s);
const ms = n => `${Math.round(n)}ms`;
const failures = [];

/* ── Seeding ─────────────────────────────────────────────────────────────────────────────────────
   Bulk inserts rather than the application's own provisioning, on purpose: what is being measured
   is how the product READS at scale, and spending an hour writing through the app to get there
   measures the wrong thing. The shape matches what provisionTenant produces. */

const STREAMS = ['commercial', 'operations', 'growth', 'people'];
const LEVELS = ['gm', 'commercial_manager', 'operations_manager', 'growth_manager'];

async function seed() {
  const already = Number((await sql`select count(*)::int as n from users`)[0].n);
  if (already >= SEATS) {
    say(`  Already seeded — ${already.toLocaleString('en-AU')} seats in place.`);
    return;
  }

  say(`  Seeding ${BUSINESSES.toLocaleString('en-AU')} businesses × ${PER_BUSINESS} seats…`);
  const t0 = Date.now();
  const BATCH = 50;

  for (let start = 0; start < BUSINESSES; start += BATCH) {
    const tenants = [];
    const roles = [];
    const users = [];
    const staff = [];
    const meetings = [];
    const periods = [];
    const register = [];

    for (let b = start; b < Math.min(start + BATCH, BUSINESSES); b++) {
      const t = `load-t-${b}`;
      tenants.push({ id: t, name: `Load Business ${b}`, sector: 'construction', start_date: '2026-01-01', status: 'active', plan: 'advanced', tier: 'advanced', board_cadence: 'monthly' });

      for (let r = 0; r < 5; r++) {
        roles.push({
          id: `${t}-r${r}`, tenant_id: t, title: r === 0 ? 'General Manager' : `${STREAMS[r - 1]} Manager`,
          stream: r === 0 ? 'commercial' : STREAMS[r - 1], level: LEVELS[Math.min(r, 3)],
          reports_to_role_id: r === 0 ? null : `${t}-r0`, sort_order: r, active: true,
        });
      }
      for (let u = 0; u < PER_BUSINESS; u++) {
        users.push({ id: `${t}-u${u}`, tenant_id: t, email: `p${u}@load-${b}.test`, name: `Person ${u}`, access: u === 0 ? 'gm' : 'staff', accepted_at: '2026-02-01' });
        staff.push({ id: `${t}-s${u}`, tenant_id: t, name: `Person ${u}`, user_id: `${t}-u${u}`, created_at: '2026-02-01' });
      }
      // Twelve months of the rhythm: a weekly and a board meeting each month, and a scored period.
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        meetings.push({ id: `${t}-m${m}w`, tenant_id: t, type: 'weekly', date: `2026-${mm}-07` });
        meetings.push({ id: `${t}-m${m}b`, tenant_id: t, type: 'board', date: `2026-${mm}-21` });
        periods.push({ id: `${t}-p${m}`, tenant_id: t, period: `2026-${mm}`, status: 'signed' });
      }
      for (let e = 0; e < 8; e++) {
        register.push({
          id: `${t}-e${e}`, tenant_id: t, text: `Something that keeps happening, number ${e}`,
          created_at: '2026-03-01', status: e < 5 ? 'open' : 'done',
          owner: e < 3 ? null : `${t}-u1`, accepted: e >= 3,
        });
      }
    }

    await sql.begin(async tx => {
      await tx`insert into tenants ${tx(tenants)} on conflict (id) do nothing`;
      await tx`insert into roles ${tx(roles)} on conflict (id) do nothing`;
      await tx`insert into users ${tx(users)} on conflict (id) do nothing`;
      await tx`insert into staff ${tx(staff)} on conflict (id) do nothing`;
      await tx`insert into meetings ${tx(meetings)} on conflict (id) do nothing`;
      await tx`insert into assessment_periods ${tx(periods)} on conflict (id) do nothing`;
      await tx`insert into register_entries ${tx(register)} on conflict (id) do nothing`;
    });

    if ((start / BATCH) % 4 === 0) process.stdout.write(`\r  … ${Math.min(start + BATCH, BUSINESSES)} of ${BUSINESSES} businesses`);
  }

  // Without this Postgres plans against stale statistics and the plans below mean nothing.
  await sql.unsafe('analyze');
  process.stdout.write(`\r  Seeded in ${Math.round((Date.now() - t0) / 1000)}s.                    \n`);
}

/* ── The plans ───────────────────────────────────────────────────────────────────────────────────
   Each of these is a query the product really runs, on a page somebody really opens. The rule is
   the same for all of them: finding one business's rows must never mean reading everybody's. */

const HOT = [
  {
    what: 'My Page reads this business’s meetings',
    where: 'lib/today-data, and again in meeting-data and boards-data',
    query: `select * from meetings where tenant_id = $1`,
  },
  {
    what: 'My Page reads this business’s people',
    where: 'lib/today-data',
    query: `select * from users where tenant_id = $1`,
  },
  {
    what: 'The org chart reads this business’s roles',
    where: 'lib/org-data',
    query: `select * from roles where tenant_id = $1`,
  },
  {
    what: 'The improvement register',
    where: 'lib/register-data',
    query: `select * from register_entries where tenant_id = $1 and status = 'open'`,
  },
  {
    what: 'The scored months behind the curve',
    where: 'lib/curve and lib/momentum',
    query: `select * from assessment_periods where tenant_id = $1`,
  },
  {
    what: 'Signing in finds the seat for this account',
    where: 'lib/auth — on EVERY request, so it matters more than any page',
    query: `select * from users where auth_user_id = $1`,
  },
];

/** Does this plan read a whole table? Returns the offending node, or null. */
function seqScanOver(plan, rowsThreshold = 5000) {
  const found = [];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (node['Node Type'] === 'Seq Scan' && (node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0) >= rowsThreshold) {
      found.push(`${node['Relation Name']} (read ${((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)).toLocaleString('en-AU')} rows to return ${(node['Actual Rows'] ?? 0).toLocaleString('en-AU')})`);
    }
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(plan);
  return found.length ? found.join('; ') : null;
}

async function plans(tenantId) {
  say('\nHow each page finds its rows');
  for (const { what, where, query } of HOT) {
    const param = query.includes('auth_user_id') ? `${tenantId}-u0-auth` : tenantId;
    const [row] = await sql.unsafe(
      `explain (analyze, format json) ${query.replace('$1', `'${param}'`)}`,
    );
    const plan = row['QUERY PLAN'][0].Plan;
    const took = row['QUERY PLAN'][0]['Execution Time'];
    const bad = seqScanOver(plan);
    if (bad) {
      say(`  ✗ ${what}`);
      say(`      reads the whole table: ${bad}`);
      say(`      ${where}`);
      failures.push(what);
    } else {
      say(`  ✓ ${what} — ${plan['Node Type']}, ${ms(took)}`);
    }
  }
}

/* ── The pages ───────────────────────────────────────────────────────────────────────────────────
   A plan can be right and a page still slow, so the pages that need no sign-in are timed for real
   over HTTP. The signed-in ones are covered by the plans above, which is the honest division. */

async function pages(base) {
  say('\nHow long the public pages take, with all that in the database');
  const PAGES = [['/', 'the front door'], ['/pricing', 'pricing'], ['/status', 'the status page'], ['/api/health', 'the health check']];
  for (const [path, name] of PAGES) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      try {
        execFileSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', '30', `${base}${path}`], { stdio: 'ignore' });
        times.push(Date.now() - t);
      } catch { times.push(NaN); }
    }
    const good = times.filter(n => !Number.isNaN(n));
    if (!good.length) { say(`  – ${name} — could not be reached`); continue; }
    const median = good.sort((a, b) => a - b)[Math.floor(good.length / 2)];
    say(`  ${median < 2000 ? '✓' : '!'} ${name} — ${ms(median)}`);
  }
}

/* ── Run ─────────────────────────────────────────────────────────────────────────────────────── */

say(`\nLoad test — ${SEATS.toLocaleString('en-AU')} seats\n`);
await seed();

const counts = await sql`
  select
    (select count(*)::int from tenants) as businesses,
    (select count(*)::int from users) as seats,
    (select count(*)::int from meetings) as meetings,
    (select count(*)::int from register_entries) as entries`;
const c = counts[0];
say(`  ${c.businesses.toLocaleString('en-AU')} businesses, ${c.seats.toLocaleString('en-AU')} seats, ${c.meetings.toLocaleString('en-AU')} meetings, ${c.entries.toLocaleString('en-AU')} register entries.`);

await plans('load-t-0');

const base = process.env.APP_URL ?? 'http://localhost:3000';
try {
  execFileSync('curl', ['-fsS', '-o', '/dev/null', '--max-time', '5', `${base}/`], { stdio: 'ignore' });
  await pages(base);
} catch {
  say(`\n  – the pages were not timed: nothing is running at ${base}`);
}

await sql.end();

say(`\n${'─'.repeat(60)}`);
if (failures.length) {
  say(`NOT READY — ${failures.length} of ${HOT.length} hot queries read the whole table.`);
  say('Each one gets slower for every business that signs up. The lines marked ✗ say which.');
  say(`${'─'.repeat(60)}\n`);
  process.exit(1);
}
say(`HOLDS — at ${c.seats.toLocaleString('en-AU')} seats, no hot query reads more than its own business.`);
say('One business costs the same whether it is the only customer or the last one.');
say(`${'─'.repeat(60)}\n`);
