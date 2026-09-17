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
import { sortByDependency } from '../src/lib/delete-order.ts';
import { referenceEdges } from '../src/lib/schema-sql.ts';

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
 * The order to delete in, taken from the schema's own references.
 *
 * NOT from the database: this product's migration deliberately emits no foreign keys, so CI's
 * database and production's have none to read. See `referenceEdges`.
 *
 * The sorting itself lives in `src/lib/delete-order.ts`, shared with the product's own delete, so
 * the two cannot drift apart — and so the awkward cases can be tested without a database.
 */
export function deleteOrder(tables) {
  return sortByDependency(tables, referenceEdges());
}

/**
 * Delete every business with this exact name.
 *
 * Returns how many went. Never throws: a journey that has already reported its result must not then
 * fail on the tidying up — the tidying is housekeeping, and turning it into a red check would be
 * reporting a clean-up problem as a product problem.
 *
 * ── All of it, or none of it ─────────────────────────────────────────────────────────────────────
 *
 * The transaction is the whole reason this is safe to swallow errors in, and the first version did
 * not have one. Thirty-odd statements ran one after another and any failure left everything before
 * it already committed — a half-deleted business, which is to say rows pointing at records that no
 * longer exist.
 *
 * Nothing showed it locally, where no statement failed. CI found it in the worst possible way: the
 * DELETE JOURNEY failed, because its orphan check asks the whole database, and it ran last, after
 * twelve journeys had each tidied up. The product's own delete was fine — it was being blamed for
 * a mess the housekeeping had left in the room next door.
 */
export async function clearBusiness(sql, name) {
  const found = await sql`select id from tenants where name = ${name}`.catch(() => []);
  return clearBusinessIds(sql, found.map(r => r.id), `"${name}"`);
}

/**
 * Clear exactly these businesses, by id.
 *
 * ── Why handing a NAME back to the deleter was wrong ─────────────────────────────────────────────
 *
 * `clearUnclaimedLook` selects carefully — look-arounds, unclaimed, created since this run started —
 * and then handed the NAME to a function that deleted every business with that name. Every
 * look-around SPEC has ever made is called "An example business", so all that careful selecting was
 * decoration: one run's tidying up removed look-arounds belonging to every other run, including the
 * ones it had deliberately excluded, and including one somebody could have been sitting inside.
 *
 * Locally it only ever swept up stale rows, and looked like it was working. CI — twelve journeys
 * back to back against one database — is where it showed, and it showed as the DELETE JOURNEY
 * failing, because that journey's orphan check asks the whole database. The product's own delete
 * was being blamed for a mess the housekeeping had left in the room next door.
 *
 * The rule now: whatever was selected is what gets deleted, and nothing is looked up twice.
 */
export async function clearBusinessIds(sql, ids, what = 'a test business') {
  try {
    if (!ids.length) return 0;

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
    const order = deleteOrder([...byTable.keys()]);

    // Which table it got to, so a failure names the statement rather than just the business.
    let reached = null;
    try {
      await sql.begin(async tx => {
        for (const id of ids) {
          for (const table of order) {
            reached = table;
            await tx.unsafe(byTable.get(table), [id]);
          }
        }
      });
    } catch (err) {
      throw new Error(`on "delete from ${reached}": ${String(err).slice(0, 140)}`);
    }
    return ids.length;
  } catch (err) {
    /*
      Swallowed, but never quietly. A journey has already reported its result by the time this runs,
      and failing it here would report a housekeeping problem as a product problem — but the line is
      printed with the table on it, because a cleanup that silently does nothing is how thirty test
      businesses end up on the live admin page, which is where this whole piece of work started.

      Nothing is half-done: the transaction above rolls back.
    */
    console.log(`  --   could not clear ${what} — NOTHING WAS DELETED: ${String(err.message ?? err).slice(0, 180)}`);
    return 0;
  }
}

/**
 * The look-around business this run created, if it never got claimed.
 *
 * A look-around provisions a real tenant the moment somebody presses "Have a look inside", and a
 * journey that only looks — boards, for one — leaves it behind unclaimed. Scoped to ones created
 * since this run began, so it can never remove a look-around somebody is in the middle of.
 *
 * Cleared BY ID. Every look-around shares one name, so going back to the name would throw the
 * scoping away — see `clearBusinessIds`.
 */
export async function clearUnclaimedLook(sql, sinceIso) {
  try {
    const rows = await sql`
      select id from tenants
      where look_id is not null and start_date >= ${sinceIso}
      order by start_date desc`;
    return await clearBusinessIds(sql, rows.map(r => r.id), 'this run’s look-around');
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
