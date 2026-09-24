import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Every table that holds one business's data is under the tenant policy — derived, not trusted.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────────
 *
 * `drizzle/0001_rls.sql` names its tables in hand-written lists, and several test files check that
 * THEIR tables appear in it. Between them they covered most of the schema and nothing covered the
 * gap: a new table nobody wrote a test for.
 *
 * On 24 September three went in — work_streams, quote_chases, shutdowns — and the deploy printed
 * "69 tables carry the tenant policy", the same number it had printed before, for a schema that had
 * just grown by three. Nothing failed. The number did not even move, because it counts the tables
 * the file names rather than the tables that exist.
 *
 * That is the exact shape the RLS file's own opening comment warns about — a safeguard that depends
 * on somebody remembering is a safeguard you do not have — turning up again one layer along. So
 * this reads the schema and asks the question the other way round: for every table with a
 * tenant_id, is there a policy? A list derived from the thing it describes cannot drift from it.
 */
const SCHEMA = readFileSync('src/db/schema.ts', 'utf8');
const RLS = readFileSync('drizzle/0001_rls.sql', 'utf8');

/**
 * Every `pgTable('name', { ... })` that really declares a tenant_id COLUMN.
 *
 * Both halves of that sentence were got wrong on the first attempt, and the way it went wrong is
 * worth keeping. The body was taken as far as the next `pgTable(`, which swallows the prose
 * between two tables, and the match was on the string `tenant_id` anywhere in it. So
 * `board_outputs` — which has no tenant_id at all, and is scoped through its period — was reported
 * as an unprotected table, because the comment block BELOW it happens to discuss tenant_id.
 *
 * A check that cries wolf is worse than no check: the first thing anybody does with a security
 * test that names an innocent table is stop reading its output. So the body ends at the real
 * closing of the definition, and the match is on the column declaration itself.
 */
function tenantTables(): string[] {
  const out: string[] = [];
  const re = /pgTable\(\s*'([a-z_]+)'\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SCHEMA))) {
    const from = m.index + m[0].length;
    /* `}, t => [...]` or `})` — the end of the column block, whichever comes first. */
    const close = SCHEMA.slice(from).search(/\n\}(,|\))/);
    const body = SCHEMA.slice(from, close === -1 ? SCHEMA.length : from + close);
    if (/text\('tenant_id'\)/.test(body)) out.push(m[1]);
  }
  return [...new Set(out)];
}

describe('nothing holding one business’s data is outside the tenant policy', () => {
  it('finds the tables to check', () => {
    /* A parser that quietly matched nothing would make every assertion below pass on air. */
    const tables = tenantTables();
    expect(tables.length).toBeGreaterThan(60);
    expect(tables).toContain('jobs');
    expect(tables).toContain('staff');
  });

  it('every table with a tenant_id is named in the policy file', () => {
    const missing = tenantTables().filter(t => !RLS.includes(`'${t}'`));
    expect(missing, `no tenant policy for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every table with a tenant_id has RLS switched on in the schema', () => {
    /*
      `.enableRLS()` turns it on; the policy file says what is allowed. Both are needed, and a table
      with a policy and no RLS is a table where the policy is never consulted.
    */
    const off: string[] = [];
    for (const t of tenantTables()) {
      const at = SCHEMA.indexOf(`pgTable('${t}'`);
      const next = SCHEMA.indexOf('pgTable(', at + 10);
      const body = SCHEMA.slice(at, next === -1 ? SCHEMA.length : next);
      if (!body.includes('.enableRLS()')) off.push(t);
    }
    expect(off, `RLS not enabled on: ${off.join(', ')}`).toEqual([]);
  });

  it('the policy file names no table that no longer exists', () => {
    /*
      The other direction. A policy for a dropped table is harmless, but it is also how the file
      slowly stops describing the database — and a file nobody believes is a file nobody updates.
    */
    const named = [...RLS.matchAll(/'([a-z_]{3,})'/g)].map(m => m[1]);
    const real = new Set([...SCHEMA.matchAll(/pgTable\(\s*'([a-z_]+)'/g)].map(m => m[1]));
    /*
      `claude_registrations` is a deliberate survivor, and the policy file says so at length: it is
      the table whose absence used to abort the whole file partway through, silently skipping every
      policy below it. The guard that now skips a missing table is the fix, and the row is left in
      as the thing that proves the guard works. Removing it to tidy this test would delete the
      evidence.
    */
    const KEPT_ON_PURPOSE = ['claude_registrations'];
    const NOT_TABLES = ['tenant_isolation', 'tenant_id', 'auth_tenant_id'];
    const ghosts = [...new Set(named)]
      .filter(n => !real.has(n) && ![...NOT_TABLES, ...KEPT_ON_PURPOSE].includes(n));
    expect(ghosts, `named in the policy file but not in the schema: ${ghosts.join(', ')}`).toEqual([]);
  });
});
