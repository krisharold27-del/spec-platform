/**
 * Which table points at which, read from the schema — and reachable from a plain .mjs journey.
 *
 * ── Why this is its own file, with an extension on the import ────────────────────────────────────
 *
 * `schema-sql.ts` already knows this, and `referenceEdges()` there is what the application uses.
 * But the journeys' clean-up is a plain `.mjs` run by node, and node's type stripping cannot follow
 * `from '../db/schema'` with no extension — it wants the file. Adding the extension THERE is not
 * free either: `tsc` rejects a `.ts` import path unless `allowImportingTsExtensions` is turned on
 * for the whole project, which is a global setting changed for one line.
 *
 * So the import lives here, in a `.mts` file that both node and tsc are happy with, and this is the
 * only copy of the logic. `schema-sql.ts` re-exports it.
 *
 * This is the second time today the journeys' cleanup has been broken by module resolution rather
 * than by anything it does. Both times it passed `tsc`, passed `vitest`, passed a `.mts` journey
 * run through tsx — and died in one second under plain node in CI, because those three resolve
 * imports differently and only the fourth is how a journey actually runs.
 *
 * `tests/test-cleanup.test.ts` loads this the way a journey does, so it cannot happen a third time.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema.ts';

export type Edge = [child: string, parent: string];

/**
 * Every `.references(...)` in the schema, as "this one goes before that one".
 *
 * Self-references are left out: a table pointing at itself cannot be ordered against itself, and
 * the single delete statement clears the whole table's rows at once anyway.
 */
export function referenceEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== 'object') continue;
    let config;
    try {
      config = getTableConfig(value as PgTable);
    } catch {
      continue; // not a table — enums, relations, helpers
    }
    for (const fk of config.foreignKeys) {
      const parent = getTableConfig(fk.reference().foreignTable as PgTable).name;
      if (parent !== config.name) edges.push([config.name, parent]);
    }
  }
  return edges;
}
