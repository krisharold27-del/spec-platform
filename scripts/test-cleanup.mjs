/**
 * Journeys clear up after themselves.
 *
 * Kris, 17 September, after clearing the live admin list from 29 businesses down to 2:
 * *"Make your tests delete the example business they create when they finish."*
 *
 * ── Why there were 29 ────────────────────────────────────────────────────────────────────────────
 *
 * Every journey signs a business up. Twelve of them, run over and over against whatever database
 * they were pointed at, and not one ever deleted anything. A test that leaves litter is a test that
 * makes somebody else tidy up, and the tidying is the part nobody schedules.
 *
 * ── Why this does not import the product's own delete ────────────────────────────────────────────
 *
 * `lib/delete-business.ts` is the real thing, with the guards — the typed name, the never-your-own,
 * the never-one-that-has-paid. Those guards exist to protect a customer from a mistake, and a test
 * fixture is not a customer. Importing it from a plain .mjs journey also does not work: it reaches
 * `src/db`, which is a directory import Node will not resolve.
 *
 * So this is deliberately blunt and deliberately narrow: it deletes by EXACT NAME, and every journey
 * passes the timestamped name it made up itself. It can only ever remove something this run created.
 *
 * `tests/test-cleanup.test.ts` holds it to the schema, so a table added later cannot be forgotten
 * here and quietly start accumulating.
 */

import postgres from 'postgres';
import { FK_EDGES_SQL, sortByDependency } from '../src/lib/delete-order.ts';

/**
 * Children that hang off roles, periods or boards rather than naming the business themselves.
 * Each is reached through its parent, because there is no tenant_id on the row to go by.
 */
export const INDIRECT_SQL = [
  'delete from assessments where role_id in (select id from roles where tenant_id = $1)',
  'delete from board_outputs where period_id in (select id from assessment_periods where tenant_id = $1)',
  'delete from gates where period_id in (select id from assessment_periods where tenant_id = $1)',
  'delete from role_curriculum where role_id in (select id from roles where tenant_id = $1)',
  'delete from role_assignments where role_id in (select id from roles where tenant_id = $1)',
  'delete from criteria where role_id in (select id from roles where tenant_id = $1)',
];

/** Asked of the database rather than hard-coded, so a new table cannot be missed. */
async function tenantTables(sql) {
  const rows = await sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
    order by table_name`;
  return rows.map(r => r.table_name);
}

/**
 * The order to delete in, asked of the database's own foreign keys.
 *
 * The sorting itself lives in `src/lib/delete-order.ts`, shared with the product's own delete, so
 * the two cannot drift apart — and so the awkward cases can be tested without a database.
 */
export async function deleteOrder(sql, tables) {
  const edges = await sql.unsafe(FK_EDGES_SQL);
  return sortByDependency(tables, edges.map(e => [e.child, e.parent]));
}

/**
 * Delete every business with this exact name.
 *
 * Returns how many went. Never throws: a journey that has already reported its result must not then
 * fail on the tidying up — the tidying is housekeeping, and turning it into a red check would be
 * reporting a clean-up problem as a product problem.
 */
export async function clearBusiness(sql, name) {
  try {
    const found = await sql`select id from tenants where name = ${name}`;
    if (!found.length) return 0;

    /*
      One statement per table — by tenant_id where the row says whose it is, through its parent
      where it does not — run in the order the foreign keys dictate. See `deleteOrder`: the order
      is sorted out of the database, not written down here, because written down here it was wrong.
    */
    const byTable = new Map();
    for (const table of await tenantTables(sql)) {
      byTable.set(table, `delete from ${table} where tenant_id = $1`);
    }
    for (const statement of INDIRECT_SQL) {
      byTable.set(statement.slice('delete from '.length).split(' ')[0], statement);
    }
    byTable.set('tenants', 'delete from tenants where id = $1');
    const order = await deleteOrder(sql, [...byTable.keys()]);

    for (const { id } of found) {
      for (const table of order) await sql.unsafe(byTable.get(table), [id]);
    }
    return found.length;
  } catch (err) {
    console.log(`  --   could not clear "${name}": ${String(err).slice(0, 120)}`);
    return 0;
  }
}

/**
 * The look-around business this run created, if it never got claimed.
 *
 * A look-around provisions a real tenant the moment somebody presses "Have a look inside", and a
 * journey that only looks — boards, for one — leaves it behind unclaimed. Scoped to the newest
 * unclaimed one so a run can never remove a look-around somebody is in the middle of.
 */
export async function clearUnclaimedLook(sql, sinceIso) {
  try {
    const rows = await sql`
      select id, name from tenants
      where look_id is not null and start_date >= ${sinceIso}
      order by start_date desc`;
    let gone = 0;
    for (const t of rows) gone += await clearBusiness(sql, t.name);
    return gone;
  } catch {
    return 0;
  }
}

/**
 * The one line a journey calls before it exits.
 *
 * Opens its own connection rather than asking every journey to carry one: most of them never touch
 * the database at all, and the whole point is that clearing up costs a journey one import and one
 * line. No DATABASE_URL simply means nothing to clear — a journey run against a deployed site has no
 * business reaching into its database anyway.
 */
export async function tidyUp(name, { lookSince } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = postgres(url, { onnotice: () => {} });
  try {
    let gone = name ? await clearBusiness(sql, name) : 0;
    if (lookSince) gone += await clearUnclaimedLook(sql, lookSince);
    if (gone) console.log(`  --   cleared up after itself: ${gone} test business(es) removed`);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}
