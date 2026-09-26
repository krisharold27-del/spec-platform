/*
  Does the cost of a page grow with the size of the business?

  ── The morning this was written (26 September) ────────────────────────────────────────────────

  `/my-page`, `/org`, `/people`, `/connections`, `/financials`, `/meeting` and `/setup` all returned
  504 FUNCTION_INVOCATION_TIMEOUT in production. Kris could not open any of them.

  Nothing was broken and nothing was slow. `getRoles` ran four joined queries PER ROLE — two of them
  character-for-character duplicates of the other two — so a sixty-role chart made two hundred and
  forty sequential round trips to draw one page. Every query was indexed and answered in about a
  millisecond; there were simply hundreds of them, in a row, across a network, inside a request with
  five minutes to live.

  2,967 tests passed the whole time. They could not have caught it: every test business has a
  handful of roles, and at four roles the fault is sixteen queries and invisible. **It did not break
  when the code changed. It broke when the CHART GOT BIGGER.**

  ── Why this counts queries and not seconds ───────────────────────────────────────────────────

  The obvious check is a stopwatch: fail if a page takes more than N seconds. It is the wrong one.
  On a shared machine running thirty other journeys, a stopwatch fires when the MACHINE is busy, not
  when the code is wrong — and a check that goes red for reasons nobody can act on is a check people
  re-run until it passes, then delete. This suite has been bitten by that three times already.

  So it measures the thing that actually went wrong: **how the cost scales.** It builds the same
  page data against a small chart and a large one and counts the round trips each makes. Four
  queries per role shows up instantly and unmistakably as a difference between the two, on any
  machine, at any speed, with no timing involved.

  A stopwatch is kept as a backstop, but a deliberately enormous one — it exists to catch a page
  that has become catastrophically slow for some reason this does not model, not to police
  milliseconds.

  ── How the counting works ────────────────────────────────────────────────────────────────────

  Every query drizzle sends goes through the postgres client's `unsafe`. `src/db/index.ts` reuses
  `globalThis.sql` outside production, so this installs its OWN counting client there BEFORE the app
  connects. Nothing in the product changes to be measured, which is the point: an instrument that
  requires production code to know it is being watched measures the instrument.
*/
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL
  ?? (readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
if (!url) {
  console.log('  skip  no DATABASE_URL — nothing to measure against.');
  process.exit(0);
}
process.env.DATABASE_URL = url;

/* ── The counting client, installed before the app asks for one ──────────────────────────────── */

const raw = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
let queries = 0;
const counting = new Proxy(raw, {
  get(target, property, receiver) {
    if (property !== 'unsafe') return Reflect.get(target, property, receiver);
    return (text: string, ...rest: unknown[]) => {
      queries += 1;
      return (target.unsafe as (...a: unknown[]) => unknown)(text, ...rest);
    };
  },
});
(globalThis as unknown as { sql?: postgres.Sql }).sql = counting as unknown as postgres.Sql;

const { getRoles, scorecardsFor } = await import('../src/lib/queries.ts');
const { clearAcross } = await import('../src/lib/clear-to-work-data.ts');

/* ── Two businesses: one small, one the size of a real one ───────────────────────────────────── */

const stamp = Date.now();
const made: string[] = [];

async function build(roles: number): Promise<{ tenantId: string; periodId: string; roleIds: string[] }> {
  const tenantId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  await raw`insert into tenants ${raw({ id: tenantId, name: `Scale ${stamp} ${roles}`, start_date: today })}`;
  made.push(tenantId);

  const periodId = randomUUID();
  await raw`insert into assessment_periods ${raw({ id: periodId, tenant_id: tenantId, period: '2026-09' })}`;

  const roleIds: string[] = [];
  for (let i = 0; i < roles; i += 1) {
    const roleId = randomUUID();
    roleIds.push(roleId);
    await raw`insert into roles ${raw({
      id: roleId, tenant_id: tenantId, title: `Role ${i}`, stream: 'operations', level: 'staff', sort_order: i,
    })}`;
    const staffId = randomUUID();
    await raw`insert into staff ${raw({ id: staffId, tenant_id: tenantId, name: `Person ${i}`, created_at: nowIso })}`;
    await raw`insert into role_assignments ${raw({
      id: randomUUID(), role_id: roleId, staff_id: staffId, from_date: today,
    })}`;
    /* Eight KPIs each, which is what a leader's scorecard actually carries. */
    for (let k = 0; k < 8; k += 1) {
      await raw`insert into criteria ${raw({
        id: randomUUID(), role_id: roleId, pillar: ['safety', 'people', 'earnings', 'compliance'][k % 4],
        text: `KPI ${k}`, weight: 1, sort_order: k,
      })}`;
    }
  }
  return { tenantId, periodId, roleIds };
}

/** Run something and report what it cost, in round trips and in milliseconds. */
async function cost(what: () => Promise<unknown>): Promise<{ queries: number; ms: number }> {
  queries = 0;
  const t = Date.now();
  await what();
  return { queries, ms: Date.now() - t };
}

const SMALL = 4;
const BIG = 60;

/*
  How much more the big chart may cost than the small one.

  Not zero. A batched read can legitimately fan out a little — a page might ask one extra question
  when there is something to ask it about. What it may never do is cost MORE PER ROLE, which is what
  any number in the region of the fifty-six extra roles would mean.
*/
const ALLOWANCE = 4;

/* A backstop, not a budget. Only ever meant to catch something catastrophic. */
const NEVER_LONGER_THAN_MS = 20_000;

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failures.push(label);
};

console.log(`\n  Building a ${SMALL}-role business and a ${BIG}-role one…`);
const small = await build(SMALL);
const big = await build(BIG);

/*
  ── The three that took the site down ────────────────────────────────────────────────────────

  `getRoles` is the one every timed-out page had in common, through `getScope`. `scorecardsFor`
  replaced the per-role scorecard read that both /org and /people also ran. `clearAcross` is the
  shared Clear to Work loader, which had the same loop in it.
*/
const WATCHED: { name: string; run: (b: typeof small) => Promise<unknown> }[] = [
  { name: 'the chart (getRoles) — behind /my-page, /org, /people, /setup and more',
    run: b => getRoles(b.tenantId) },
  { name: 'every role\'s scorecard (scorecardsFor)',
    run: b => scorecardsFor(b.roleIds, b.periodId) },
  { name: 'Clear to Work for the business (clearAcross)',
    run: b => clearAcross(b.tenantId) },
];

console.log('');
for (const w of WATCHED) {
  /* Warm first: the very first query on a connection pays for connecting, which is not the subject. */
  await w.run(small);

  const atSmall = await cost(() => w.run(small));
  const atBig = await cost(() => w.run(big));
  const grew = atBig.queries - atSmall.queries;

  console.log(`  ${w.name}`);
  console.log(`      ${SMALL} roles: ${atSmall.queries} queries · ${atSmall.ms} ms`);
  console.log(`      ${BIG} roles: ${atBig.queries} queries · ${atBig.ms} ms`);

  check(
    `    its cost does not grow with the business`,
    grew <= ALLOWANCE,
    `${grew} more queries for ${BIG - SMALL} more roles — that is per-role work, and per-role work is what timed the site out`,
  );
  check(`    and it finishes at all`, atBig.ms < NEVER_LONGER_THAN_MS, `${atBig.ms} ms on ${BIG} roles`);
}

/* ── Tidy up: this check must never leave businesses behind ──────────────────────────────────── */

for (const tenantId of made) {
  await raw`delete from criteria where role_id in (select id from roles where tenant_id = ${tenantId})`;
  await raw`delete from role_assignments where role_id in (select id from roles where tenant_id = ${tenantId})`;
  await raw`delete from staff where tenant_id = ${tenantId}`;
  await raw`delete from roles where tenant_id = ${tenantId}`;
  await raw`delete from assessment_periods where tenant_id = ${tenantId}`;
  await raw`delete from tenants where id = ${tenantId}`;
}
await raw.end();

console.log(failures.length === 0
  ? '\nAll checks passed.'
  : `\n${failures.length} FAILED: ${failures.map(f => f.trim()).join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
