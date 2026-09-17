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

// ── Taking a business off Stripe, which is what makes a refused one deletable ────────────────────
//
// Kris, 17 September: "yes build the admin control to clear hall contracting" — a business that went
// through Stripe in TEST mode, refused on sight by the delete and stuck on the live admin list.
//
// This opens a door in the strongest guard SPEC has, so the guards ON THE DOOR are what is walked
// here. The decision itself — what Stripe's answer means — is held by tests/detach-stripe.test.ts,
// because the combinations that matter are ones nobody has a Stripe account shaped like.
const { detachFromStripe, DETACH_SAID } = await import('../src/lib/detach-stripe.ts');

// Put the marks back on the one we refused earlier, so there is something to take off.
// It already carries one from the fixture; named here so the check below is readable.
await sql`update tenants set stripe_customer_id = 'cus_test_leftover' where id = ${paying}`;

const wrongName = await detachFromStripe(paying, 'Not The Name', 'other-tenant');
check('A WRONG NAME TAKES NOTHING OFF STRIPE', !wrongName.ok && wrongName.refusal === 'name_mismatch', JSON.stringify(wrongName));

const ownOne = await detachFromStripe(paying, `Paid Test ${stamp}`, paying);
check('AND NEVER THE BUSINESS YOU ARE SIGNED INTO', !ownOne.ok && ownOne.refusal === 'own_business', JSON.stringify(ownOne));

/*
  No Stripe key on this run — which is exactly the state CI is in, and the answer must be "I cannot
  tell", never "probably fine". Not knowing whether somebody is a paying customer is the one
  situation where carrying on is indefensible.
*/
const blind = await detachFromStripe(paying, `Paid Test ${stamp}`, 'other-tenant');
check(
  'AND IT REFUSES WHEN IT CANNOT ASK STRIPE, rather than assuming',
  !blind.ok && (blind.refusal === 'not_configured' || blind.refusal === 'unreachable' || blind.refusal === 'cannot_see_live'),
  JSON.stringify(blind),
);
check('saying which, in words', !blind.ok && DETACH_SAID[blind.refusal].includes('Nothing was changed'), blind.ok ? '' : DETACH_SAID[blind.refusal]);

// And the marks are still on, so the delete is still refused — the refusal cost nothing.
const stillMarked = await sql`select stripe_customer_id from tenants where id = ${paying}`;
check('THE MARKS ARE STILL ON after a refusal', stillMarked[0]?.stripe_customer_id === 'cus_test_leftover', JSON.stringify(stillMarked[0]));
const stillRefused = await deleteBusiness(paying, `Paid Test ${stamp}`, 'other-tenant');
check('and the delete is still refused', !stillRefused.ok && stillRefused.refusal === 'has_paid', JSON.stringify(stillRefused));

// Clear it the way the product would once Stripe had answered, and confirm the delete opens up.
await sql`update tenants set stripe_customer_id = null, stripe_subscription_id = null where id = ${paying}`;
const nowDeletable = await deleteBusiness(paying, `Paid Test ${stamp}`, 'other-tenant');
check('ONCE THE MARKS ARE OFF, THE ORDINARY DELETE WORKS — with all its own guards', nowDeletable.ok === true, JSON.stringify(nowDeletable));

// ── The journeys' own housekeeping only takes what it selected ───────────────────────────────────
//
// Not the product's delete — the blunt one the journeys use on their own fixtures. It selects
// look-arounds carefully (unclaimed, created since this run began) and then USED TO HAND THE NAME
// BACK to a deleter that removed every business with that name. Every look-around SPEC has ever
// made is called "An example business", so the careful selecting was decoration: one run tidied up
// after every other run, including rows it had deliberately excluded and one somebody could have
// been sitting inside.
//
// Locally it only ever swept up stale rows and looked like it worked. It showed up in CI as THIS
// JOURNEY failing — the orphan check above asks the whole database, so the product's own delete was
// being blamed for a mess the housekeeping had left in the room next door.
//
// Proven by putting it back: with the name lookup, both of these go.
const { clearUnclaimedLook } = await import('./test-cleanup.mjs');
const SHARED = 'An example business';
const older = randomUUID();
const mine = randomUUID();
const iso = (ms: number) => new Date(ms).toISOString();
for (const [id, when] of [[older, Date.now() - 3 * 86400000], [mine, Date.now()]] as [string, number][]) {
  await sql`
    insert into tenants (id, name, plan, start_date, look_id)
    values (${id}, ${SHARED}, 'trial', ${iso(when)}, ${randomUUID()})`;
}
await clearUnclaimedLook(sql, iso(Date.now() - 60_000));
const survivors = (await sql`select id from tenants where id in (${older}, ${mine})`).map(r => r.id);
check(
  'THE HOUSEKEEPING NEVER TAKES A LOOK-AROUND IT DID NOT SELECT',
  survivors.includes(older),
  'an older look-around sharing the name was deleted too',
);
check('and does clear the one this run made', !survivors.includes(mine));
await sql`delete from tenants where id in (${older}, ${mine})`;

await sql.end();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
