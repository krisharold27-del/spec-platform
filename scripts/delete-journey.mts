// Can a test business be cleared, and can a real one survive somebody trying?
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// Kris, 16 September: "yes build a safe way to clear the test businesses". Production had a handful
// of throwaways in it and the alternative was typing DELETE into a console at the same keyboard that
// holds the only copy of every real customer.
//
// So the thing worth checking is not that it deletes. Deleting is one line. It is that every guard
// holds, that a business which has been near Stripe survives being told to go, and that afterwards
// the database has nothing left pointing at something that is no longer there.
//
//   node scripts/fake-auth.mjs 54321 &
//   npm start &
//   node scripts/delete-journey.mjs

import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

let failed = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition || !detail ? '' : `  — ${detail}`}`);
  if (!condition) failed++;
};

const { deleteBusiness, standingOf, tenantTables, REFUSAL_SAID } = await import('../src/lib/delete-business.ts');

/** A business with something in every corner of it, so the delete has real work to do. */
async function buildOne(name) {
  const t = randomUUID();
  await sql`insert into tenants (id, name, plan, start_date) values (${t}, ${name}, 'trial', now())`;
  const gm = randomUUID();
  await sql`
    insert into roles (id, tenant_id, title, stream, level, default_access, sort_order, active)
    values (${gm}, ${t}, 'General Manager', 'operations', 'gm', 'administrator', 0, true)`;
  const u = randomUUID();
  await sql`
    insert into users (id, tenant_id, email, name, access, invited_at)
    values (${u}, ${t}, ${`${t}@example.test`}, 'A Person', 'administrator', now())`;
  await sql`insert into role_assignments (id, role_id, user_id, from_date) values (${randomUUID()}, ${gm}, ${u}, now())`;
  const c = randomUUID();
  await sql`
    insert into criteria (id, role_id, pillar, text, weight, kpi, sort_order, active)
    values (${c}, ${gm}, 'safety', 'Toolbox talks held', 1, true, 0, true)`;
  const per = randomUUID();
  await sql`
    insert into assessment_periods (id, tenant_id, period, status)
    values (${per}, ${t}, '2026-09', 'open')`;
  await sql`
    insert into assessments (id, period_id, role_id, criterion_id, answer, entered_at)
    values (${randomUUID()}, ${per}, ${gm}, ${c}, 'Y', now())`;
  await sql`
    insert into register_entries (id, tenant_id, text, created_by, created_at, status)
    values (${randomUUID()}, ${t}, 'the yard is a mess on Mondays', 'A Person', now(), 'open')`;
  const mod = randomUUID();
  await sql`
    insert into training_modules (id, tenant_id, title, summary, pillar, minutes, core, sort_order, active)
    values (${mod}, ${t}, 'A module', 'about something', 'safety', 20, false, 0, true)`;
  await sql`insert into role_curriculum (id, role_id, module_id, sort_order) values (${randomUUID()}, ${gm}, ${mod}, 0)`;
  /*
    The two rows that pull the delete order in OPPOSITE directions, and the reason the fixture has
    to carry both.

      role_curriculum (no tenant_id) → training_modules (tenant_id)   : child names no business
      role_tasks      (tenant_id)    → criteria         (no tenant_id): child DOES name its business

    This fixture had the first and not the second, so it passed happily while the order was wrong,
    and the journeys' own clean-up was what found it. A fixture with a hole in it is a check whose
    failure mode is silence.
  */
  await sql`
    insert into role_tasks (id, tenant_id, role_id, name, kind, criterion_id, created_at)
    values (${randomUUID()}, ${t}, ${gm}, 'Run the toolbox talk', 'judgement', ${c}, now())`;
  return t;
}

const countsAcross = async id => {
  const out = {};
  for (const table of tenantTables()) {
    const [{ n }] = await sql`select count(*)::int as n from ${sql(table)} where tenant_id = ${id}`;
    if (n > 0) out[table] = n;
  }
  return out;
};

const stamp = Date.now();

// ── It shows what is about to go, before anything goes ───────────────────────────────────────────
const doomed = await buildOne(`Delete Test ${stamp}`);
const before = await standingOf(doomed);
check('it says what is about to be destroyed', before !== null && before.counts.people === 1 && before.counts.roles === 1,
  JSON.stringify(before?.counts));
check('including the months already marked', (before?.counts.marks ?? 0) === 1, String(before?.counts.marks));

// ── The name has to be typed exactly ─────────────────────────────────────────────────────────────
const wrong = await deleteBusiness(doomed, 'Delete Test', doomed === 'x' ? 'y' : 'other-tenant');
check('A WRONG NAME DELETES NOTHING', wrong.ok === false && wrong.refusal === 'name_mismatch', JSON.stringify(wrong));
check('and the business is still there', (await standingOf(doomed)) !== null);

// ── Never the one you are standing in ────────────────────────────────────────────────────────────
const own = await deleteBusiness(doomed, `Delete Test ${stamp}`, doomed);
check('AND NEVER THE BUSINESS YOU ARE SIGNED INTO', own.ok === false && own.refusal === 'own_business', JSON.stringify(own));
check('still there', (await standingOf(doomed)) !== null);

// ── And never one that has been anywhere near money ──────────────────────────────────────────────
const paying = await buildOne(`Paid Test ${stamp}`);
await sql`update tenants set stripe_customer_id = 'cus_real' where id = ${paying}`;
const refusedPaid = await deleteBusiness(paying, `Paid Test ${stamp}`, 'other-tenant');
check(
  'A BUSINESS THAT HAS BEEN THROUGH STRIPE IS REFUSED, however correctly it is typed',
  refusedPaid.ok === false && refusedPaid.refusal === 'has_paid',
  JSON.stringify(refusedPaid),
);
check('and it is untouched', (await standingOf(paying)) !== null);

// ── The real thing ───────────────────────────────────────────────────────────────────────────────
const done = await deleteBusiness(doomed, `Delete Test ${stamp}`, 'other-tenant');
check('THE TEST BUSINESS IS DELETED', done.ok === true, JSON.stringify(done));
check('and it is gone', (await standingOf(doomed)) === null);

const left = await countsAcross(doomed);
check('AND NOTHING OF IT IS LEFT IN ANY TABLE', Object.keys(left).length === 0, JSON.stringify(left));

const [{ n: orphanCriteria }] = await sql`
  select count(*)::int as n from criteria c left join roles r on r.id = c.role_id where r.id is null`;
const [{ n: orphanMarks }] = await sql`
  select count(*)::int as n from assessments a left join roles r on r.id = a.role_id where r.id is null`;
const [{ n: orphanPath }] = await sql`
  select count(*)::int as n from role_curriculum rc left join roles r on r.id = rc.role_id where r.id is null`;
check('and no row anywhere points at something that has gone',
  orphanCriteria === 0 && orphanMarks === 0 && orphanPath === 0,
  `criteria=${orphanCriteria} marks=${orphanMarks} path=${orphanPath}`);

// ── A table somebody forgot must stop the whole thing, not half-do it ────────────────────────────
//
// Proven by taking `criteria` out of the delete list and running this: Postgres refuses to remove a
// role that criteria still points at, the transaction rolls back, and NOTHING is deleted. What that
// produced at first was a stack trace — which on the admin screen is the generic failure page — so
// it is now a sentence instead, and this is where that is held.
check(
  'a forgotten table is refused in words, not as a crash',
  REFUSAL_SAID.left_orphans.includes('put everything back') && REFUSAL_SAID.left_orphans.includes('Nothing was changed'),
  REFUSAL_SAID.left_orphans,
);

// ── The one that was refused is completely untouched ─────────────────────────────────────────────
const stillPaying = await countsAcross(paying);
check(
  'THE ONE IT REFUSED STILL HAS EVERYTHING',
  (stillPaying.users ?? 0) === 1 && (stillPaying.roles ?? 0) === 1 && (stillPaying.register_entries ?? 0) === 1,
  JSON.stringify(stillPaying),
);

// Tidy up after ourselves: clear the Stripe mark, then delete it the proper way.
await sql`update tenants set stripe_customer_id = null where id = ${paying}`;
const cleanup = await deleteBusiness(paying, `Paid Test ${stamp}`, 'other-tenant');
check('and once the money is off it, it can be cleared too', cleanup.ok === true, JSON.stringify(cleanup));

await sql.end();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
