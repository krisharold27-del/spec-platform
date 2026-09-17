import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { tableShapes } from '../src/lib/schema-sql';
import { sortByDependency } from '../src/lib/delete-order';
import { referenceEdges } from '../src/lib/schema-sql';

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

  it('works out the order rather than writing one down', () => {
    // This was a written-down order twice, and wrong twice. See delete-order.ts.
    expect(cleanup).toContain('sortByDependency');
    expect(read('src/lib/delete-business.ts')).toContain('sortByDependency');
  });

  it('TAKES THE ORDER FROM THE SCHEMA, because no database we ship has foreign keys', () => {
    /*
      The check that would have saved four red CI runs.

      The order was sorted out of `pg_constraint`, which is the obvious place — and this product's
      migration deliberately emits no foreign keys, so CI's database and production's have none. It
      found zero edges, sorted nothing, deleted parents before their children, and there was no
      constraint left to refuse it either. Silent, and identical every run.

      It passed locally the whole time, on a database built by drizzle push, which DOES have the
      keys. Asking the database was asking the one copy that could not answer.
    */
    /*
      Comments stripped first. These files EXPLAIN the pg_constraint mistake at length, and that
      explanation is the most useful thing in them — a check that forbade the words would force the
      story out of the code, which is the opposite of what it is for. Twice in one day I have
      written a check that matched English rather than what runs.
    */
    const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const f of ['scripts/test-cleanup.mjs', 'src/lib/delete-business.ts', 'src/lib/delete-order.ts']) {
      expect(code(f), `${f} is back to asking the database for the order`).not.toContain('pg_constraint');
    }
    expect(cleanup).toContain('referenceEdges');
    expect(read('src/lib/delete-business.ts')).toContain('referenceEdges');
  });

  it('and the schema really does carry them', () => {
    // If `referenceEdges` ever comes back empty, the sort silently becomes "any order at all" —
    // exactly the failure above, wearing a different hat.
    const edges = referenceEdges();
    expect(edges.length).toBeGreaterThan(20);
    const points = (child: string, parent: string) => edges.some(([c, p]) => c === child && p === parent);
    // The two pairs that pull in opposite directions. If either is missing the order is guesswork.
    expect(points('role_tasks', 'criteria'), 'role_tasks → criteria').toBe(true);
    expect(points('role_curriculum', 'training_modules'), 'role_curriculum → training_modules').toBe(true);
    expect(points('assessments', 'roles'), 'assessments → roles').toBe(true);
  });

  it('puts children before parents on the REAL schema, not just a toy one', () => {
    /*
      The sorter's unit tests hand it three tables and two edges. This runs it over all of SPEC —
      which is the thing that actually has to come out right, and the thing that changes whenever
      somebody adds a table.
    */
    const tables = tableShapes().map(t => t.name);
    const order = sortByDependency(tables, referenceEdges());
    expect(order.slice().sort()).toEqual(tables.slice().sort());

    const at = (t: string) => order.indexOf(t);
    const wrong = referenceEdges()
      .filter(([c, p]) => tables.includes(c) && tables.includes(p) && at(c) > at(p))
      .map(([c, p]) => `${c} after ${p}`);
    expect(wrong, `deleted after something that points at it: ${wrong.join(', ')}`).toEqual([]);
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
    /*
      Matched against the SQL, not against the prose. The first version was `/like\s/i` over the
      whole file, which passed only for as long as no comment in it used the word "like" — a check
      that fails the day somebody writes an ordinary English sentence is a check that gets deleted
      rather than understood.
    */
    const statements = cleanup.match(/delete from [^`'"]*/gi) ?? [];
    expect(statements.length).toBeGreaterThan(5);
    for (const s of statements) expect(s.toLowerCase(), `a wildcard match in: ${s}`).not.toMatch(/\blike\b|%/);
  });

  it('never takes a look-around somebody might be inside', () => {
    // Scoped to look-arounds created since this run started, so a long-running visitor is safe.
    expect(cleanup).toContain('start_date >= ${sinceIso}');
  });

  it('DELETES WHAT IT SELECTED, and never looks it up again by name', () => {
    /*
      The scoping above was decoration for a day. It selected look-arounds carefully — unclaimed,
      created since this run began — and then handed the NAME to a deleter that removed every
      business with that name. Every look-around SPEC has ever made is called "An example business",
      so a run tidied up after every other run, including the rows it had deliberately excluded.

      Locally it swept up stale rows and looked fine. CI found it, as the delete journey failing on
      a mess it had not made.
    */
    expect(cleanup).toContain('clearBusinessIds(sql, rows.map(r => r.id)');
    // Only the look-around function itself — `tidyUp` below it legitimately clears by name, which
    // is what a journey knows about the business it made up.
    const from = cleanup.indexOf('export async function clearUnclaimedLook');
    const look = cleanup.slice(from, cleanup.indexOf('\n}', from));
    expect(look, 'the look-around cleanup is back to deleting by name').not.toContain('clearBusiness(sql,');
  });

  it('is all-or-nothing, so a failure cannot half-delete a business', () => {
    // Thirty-odd statements with no transaction: any failure left everything before it committed,
    // which is rows pointing at records that no longer exist.
    expect(cleanup).toContain('sql.begin(');
  });

  it('never turns a tidying-up problem into a failing check', () => {
    // A journey has already reported its result by then. Failing on the housekeeping would report
    // a clean-up problem as a product problem.
    expect(cleanup).toContain('catch');
    expect(cleanup).toContain('could not clear');
  });
});
