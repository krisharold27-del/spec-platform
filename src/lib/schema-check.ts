/**
 * Does the database actually have the shape this build expects?
 *
 * A deploy can succeed, the app can start, `select 1` can pass, and the product can still be broken
 * — because the code was shipped with a column the database has not been given yet. That failure
 * looks like a 500 on one page and nothing at all on the others, which is the hardest kind to
 * diagnose and the easiest kind to ship.
 *
 * So the expectation is derived FROM the Drizzle schema rather than written out by hand. A
 * hand-written list is a second source of truth that drifts the first time somebody adds a column
 * and forgets this file, which would make the check worse than useless: it would report healthy.
 *
 * Reads `information_schema` only. It touches no tenant row, returns no data, and is safe to expose
 * to an operator who is not allowed to look at a customer's numbers.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';

export interface SchemaDrift {
  /** Tables the code needs that the database does not have at all. */
  missingTables: string[];
  /** Columns the code needs, on tables that do exist. */
  missingColumns: { table: string; columns: string[] }[];
}

export type SchemaCheck =
  | { status: 'ok'; tables: number }
  | ({ status: 'behind'; tables: number } & SchemaDrift)
  | { status: 'unknown'; reason: string };

/** Every table and column this build expects, read straight out of the Drizzle definitions. */
export function expectedShape(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== 'object') continue;
    let config;
    try {
      config = getTableConfig(value as PgTable);
    } catch {
      continue; // not a table — enums, relations, helpers
    }
    out.set(config.name, new Set(config.columns.map(c => c.name)));
  }
  return out;
}

/**
 * Compare what the code expects against what the database has.
 *
 * Deliberately one-directional. A column the DATABASE has and the code does not is not reported as
 * a problem: that is what every rollback and every mid-migration state looks like, and flagging it
 * would make the check cry wolf on exactly the deploys somebody is already watching closely.
 */
export function compareShape(
  expected: Map<string, Set<string>>,
  actual: Map<string, Set<string>>,
): SchemaDrift {
  const missingTables: string[] = [];
  const missingColumns: { table: string; columns: string[] }[] = [];

  for (const [table, columns] of expected) {
    const has = actual.get(table);
    if (!has) {
      missingTables.push(table);
      continue;
    }
    const gone = [...columns].filter(c => !has.has(c));
    if (gone.length) missingColumns.push({ table, columns: gone.sort() });
  }

  return {
    missingTables: missingTables.sort(),
    missingColumns: missingColumns.sort((a, b) => a.table.localeCompare(b.table)),
  };
}

/** One sentence an operator can act on, without going and reading the diff themselves. */
export function driftLine(drift: SchemaDrift): string {
  const t = drift.missingTables.length;
  const c = drift.missingColumns.reduce((n, x) => n + x.columns.length, 0);
  if (!t && !c) return 'The database has everything this build expects.';
  const parts = [
    t ? `${t} ${t === 1 ? 'table' : 'tables'}` : null,
    c ? `${c} ${c === 1 ? 'column' : 'columns'}` : null,
  ].filter(Boolean);
  return `This build expects ${parts.join(' and ')} the database does not have. Run the schema push against this environment; until then the pages that read them will fail.`;
}

/** The live check. Returns `unknown` rather than throwing — a broken probe must not take a page down. */
export async function checkSchema(): Promise<SchemaCheck> {
  try {
    const { db } = await import('../db');
    const expected = expectedShape();

    const rows = (await db.execute(sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `)) as unknown as { table_name: string; column_name: string }[];

    const actual = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = actual.get(r.table_name) ?? new Set<string>();
      set.add(r.column_name);
      actual.set(r.table_name, set);
    }

    const drift = compareShape(expected, actual);
    const behind = drift.missingTables.length > 0 || drift.missingColumns.length > 0;
    return behind
      ? { status: 'behind', tables: expected.size, ...drift }
      : { status: 'ok', tables: expected.size };
  } catch (err) {
    const message = (err as { message?: string })?.message ?? 'Unknown error';
    // Never let a connection string reach an operator endpoint.
    return { status: 'unknown', reason: message.replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').slice(0, 160) };
  }
}
