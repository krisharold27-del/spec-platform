import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { tableShapes } from '../src/lib/schema-sql';
import { sortByDependency } from '../src/lib/delete-order';

/**
 * Journeys clear up after themselves.
 *
 * Kris, 17 September, after clearing the live admin list from 29 businesses down to 2:
 * *"Make your tests delete the example business they create when they finish."*
 *
 * Twelve journeys, each signing a business up, run over and over, and not one ever deleted anything.
 * A test that leaves litter makes somebody else tidy up, and the tidying is the part nobody
 * schedules.
 *
 * What is held here is the thing that would rot: the cleanup lists tables, the schema gains tables,
 * and nobody would notice the two drifting apart until an admin list was 29 long again.
 */

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const cleanup = read('scripts/test-cleanup.mjs');

describe('the cleanup covers the whole schema', () => {
  /*
    The tenant tables are asked of the DATABASE at run time — information_schema — rather than
    listed here, which is what makes a new table impossible to forget. This checks that it really
    does that, because a hard-coded list is the version that goes stale.
  */
  it('asks the database which tables carry a tenant, rather than keeping a list', () => {
    expect(cleanup).toContain('information_schema.columns');
    expect(cleanup).toContain("column_name = 'tenant_id'");
  });

  it('clears every table that hangs off a role, a period or a board', () => {
    // These nine are the ones with no tenant_id of their own. If the schema grows another, this
    // fails and names it.
    const indirect = tableShapes()
      .filter(t => !t.columns.some(c => c.name === 'tenant_id'))
      .map(t => t.name)
      // Not a business's data: the shared rulebook, uptime pings, and the tenants table itself.
      .filter(t => !['rulebook_rules', 'health_pings', 'tenants'].includes(t));

    for (const table of indirect) {
      expect(cleanup, `${table} has no tenant_id and is never cleared`).toContain(`delete from ${table} `);
    }
  });

  it('asks the foreign keys what order to delete in, rather than writing one down', () => {
    /*
      This was a written-down order twice, and wrong twice. Both files now sort it out of
      pg_constraint, so a table added later orders itself. See delete-order.ts.
    */
    expect(cleanup).toContain('sortByDependency');
    expect(read('src/lib/delete-business.ts')).toContain('sortByDependency');
  });
});

describe('the order comes out children-first', () => {
  /*
    The two shapes that broke a written-down order, and the one that would hang a naive sort.
    Tested here rather than against a database, because the awkward cases are the ones nobody has
    a fixture for.
  */
  const before = (order: string[], a: string, b: string) => order.indexOf(a) < order.indexOf(b);

  it('puts a table that names its business before the one it points at', () => {
    // role_tasks carries a tenant_id; criteria does not. "Tenant tables first" got this right by
    // accident and "children first" got it wrong.
    const order = sortByDependency(['criteria', 'role_tasks', 'roles'], [
      ['role_tasks', 'criteria'],
      ['criteria', 'roles'],
    ]);
    expect(before(order, 'role_tasks', 'criteria')).toBe(true);
    expect(before(order, 'criteria', 'roles')).toBe(true);
  });

  it('and one that does NOT name its business before the one it points at', () => {
    // role_curriculum hangs off a role; training_modules carries a tenant_id. This is the pair that
    // proved no fixed order works — it pulls the opposite way to the one above.
    const order = sortByDependency(['training_modules', 'role_curriculum', 'roles'], [
      ['role_curriculum', 'training_modules'],
      ['role_curriculum', 'roles'],
    ]);
    expect(before(order, 'role_curriculum', 'training_modules')).toBe(true);
  });

  it('never drops a table, even in a loop it cannot satisfy', () => {
    // Two tables pointing at each other have no valid order. Appending them means Postgres refuses
    // and names the table; dropping them would mean a table quietly never deleted.
    const order = sortByDependency(['a', 'b', 'c'], [['a', 'b'], ['b', 'a'], ['c', 'a']]);
    expect(order.slice().sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a foreign key pointing somewhere we are not deleting', () => {
    const order = sortByDependency(['users'], [['users', 'auth_identities']]);
    expect(order).toEqual(['users']);
  });
});

describe('every journey that creates a business clears it', () => {
  const journeys = readdirSync(new URL('../scripts', import.meta.url))
    .filter(f => f.endsWith('-journey.mjs') || f === 'journey.mjs');

  it('there are journeys to check', () => {
    expect(journeys.length).toBeGreaterThan(8);
  });

  it('EVERY ONE OF THEM TIDIES UP', () => {
    const missing = journeys.filter(f => {
      const src = read(`scripts/${f}`);
      // A journey that never signs anybody up has nothing to clear — cockpit is one.
      const creates = src.includes('/signup') || src.includes('Have a look inside');
      return creates && !src.includes('tidyUp(');
    });
    expect(missing, `these leave a business behind: ${missing.join(', ')}`).toEqual([]);
  });

  it('and does it on an early exit too, not only at the end', () => {
    // The throttle escapes bail out mid-run. Those were the ones quietly leaving litter, because
    // they are exactly the runs nobody watches to the end.
    const src = read('scripts/journey.mjs');
    const beforeFinal = src.slice(0, src.lastIndexOf('process.exit('));
    expect((beforeFinal.match(/tidyUp\(/g) ?? []).length).toBeGreaterThan(1);
  });
});

describe('what the cleanup must never become', () => {
  it('only ever deletes by an exact name it was given', () => {
    /*
      The product's own delete has the guards — the typed name, never your own, never one that has
      paid. This is a blunt instrument for fixtures, so the ONE thing keeping it safe is that it
      cannot match anything it was not handed. No LIKE, no prefix, no wildcard.
    */
    expect(cleanup).toContain('where name = ${name}');
    expect(cleanup).not.toMatch(/like\s/i);
    expect(cleanup).not.toContain('%');
  });

  it('never takes a look-around somebody might be inside', () => {
    // Scoped to look-arounds created since this run started, so a long-running visitor is safe.
    expect(cleanup).toContain('start_date >= ${sinceIso}');
  });

  it('never turns a tidying-up problem into a failing check', () => {
    // A journey has already reported its result by then. Failing on the housekeeping would report
    // a clean-up problem as a product problem.
    expect(cleanup).toContain('catch');
    expect(cleanup).toContain('could not clear');
  });
});
