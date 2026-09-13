import { describe, it, expect } from 'vitest';
import { additivePlan, isAdditive, tableShapes } from '../src/lib/schema-sql';
import { expectedShape } from '../src/lib/schema-check';

const emptyDatabase = new Map<string, Set<string>>();

describe('bringing a database up to the build', () => {
  /*
    The guarantee the whole file exists for. Not "we check before dropping" — the strings are never
    generated. This runs against an empty database and a full one, which between them exercise
    every branch that can emit SQL.
  */
  it('never emits anything that could remove data', () => {
    for (const actual of [emptyDatabase, halfADatabase()]) {
      const { statements } = additivePlan(actual);
      for (const s of statements) {
        expect(isAdditive(s), s).toBe(true);
        expect(s.toLowerCase()).not.toMatch(/\bdrop\b/);
        expect(s.toLowerCase()).not.toMatch(/\btruncate\b/);
        expect(s.toLowerCase()).not.toMatch(/\bdelete\b/);
        expect(s.toLowerCase()).not.toMatch(/alter column/);
      }
    }
  });

  it('creates every table when the database is empty', () => {
    const { statements } = additivePlan(emptyDatabase);
    const created = statements.filter(s => s.startsWith('create table'));
    expect(created).toHaveLength(tableShapes().length);
    expect(created.join(' ')).toContain('"obligations"');
    expect(created.join(' ')).toContain('"leave_entries"');
  });

  it('does nothing at all when the database already matches', () => {
    const { statements } = additivePlan(expectedShape());
    // Indexes are still asserted — they are `if not exists` and are how a missing unique index,
    // which no column check would notice, gets repaired.
    expect(statements.every(s => s.includes('index if not exists'))).toBe(true);
  });

  it('adds only the missing columns to a table it already has', () => {
    const actual = expectedShape();
    actual.set('users', new Set([...actual.get('users')!].filter(c => c !== 'seat_token' && c !== 'notify_level')));
    const { statements } = additivePlan(actual);
    const alters = statements.filter(s => s.startsWith('alter table'));
    expect(alters).toHaveLength(2);
    expect(alters.join(' ')).toContain('"seat_token"');
    expect(alters.join(' ')).toContain('"notify_level"');
  });

  /*
    A forgotten table from an old experiment used to stop every schema change reaching production,
    silently, for months. It must now be ignored entirely.
  */
  it('ignores tables and columns the build has never heard of', () => {
    const actual = expectedShape();
    actual.set('claude_registrations', new Set(['id', 'whatever']));
    actual.get('tenants')!.add('an_old_column');
    const { statements } = additivePlan(actual);
    expect(statements.join(' ')).not.toContain('claude_registrations');
    expect(statements.join(' ')).not.toContain('an_old_column');
    expect(statements.every(s => s.includes('index if not exists'))).toBe(true);
  });

  /*
    Adding a NOT NULL column to a table with rows in it fails unless it brings a default. Failing
    the deploy there would be the old disease with new symptoms, and inventing a value would be
    worse — so it goes in nullable and says so.
  */
  it('adds a NOT NULL column without a default as nullable, and says so', () => {
    const actual = expectedShape();
    actual.set('staff', new Set([...actual.get('staff')!].filter(c => c !== 'name')));
    const { statements, notes } = additivePlan(actual);
    const alter = statements.find(s => s.includes('"name"'))!;
    expect(alter).not.toMatch(/not null/i);
    expect(notes.join(' ')).toMatch(/staff\.name as nullable/);
  });

  it('keeps a NOT NULL column that has a default', () => {
    const actual = expectedShape();
    actual.set('tenants', new Set([...actual.get('tenants')!].filter(c => c !== 'tier')));
    const alter = additivePlan(actual).statements.find(s => s.includes('"tier"'))!;
    expect(alter).toMatch(/default 'basic'/);
    expect(alter).toMatch(/not null/);
  });

  it('creates a table with its primary key and its defaults', () => {
    const create = additivePlan(emptyDatabase).statements.find(s => s.includes('create table if not exists "tenants"'))!;
    expect(create).toMatch(/"id" text primary key/);
    expect(create).toMatch(/"status" text default 'active' not null/);
  });

  it('says out loud everything it did', () => {
    const { statements, notes } = additivePlan(emptyDatabase);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.length).toBeLessThanOrEqual(statements.length);
    expect(notes.every(n => n.length > 0)).toBe(true);
  });
});

/*
  ── Every business's rows must be findable without reading everybody's ──────────────────────────

  A load test at twenty thousand seats found `meetings` had no index on tenant_id. Finding one
  business's two dozen meetings meant Postgres reading all 16,008 of them — on My Page, the screen
  every customer opens every morning.

  It is the worst shape of bug for a product sold by the seat, because nothing breaks. One
  business's page simply costs a little more every time ANOTHER business signs up, so the product
  gets slower exactly as it succeeds, and the customers who feel it first are the oldest ones.

  A load test only finds this when somebody remembers to run it. This runs on every change, so a
  new tenant-scoped table cannot arrive without the index that makes it scale.
*/
describe('every business can be read without reading all of them', () => {
  it('indexes tenant_id on every table scoped to a business', () => {
    const missing = tableShapes()
      .filter(t => t.columns.some(c => c.name === 'tenant_id'))
      .filter(t => !t.indexes.some(i => i.columns[0] === 'tenant_id'))
      .map(t => t.name);

    expect(
      missing,
      'These tables belong to a business but have no index starting at tenant_id, so reading one ' +
      `business's rows scans every business's: ${missing.join(', ')}. ` +
      "Add index('<table>_tenant').on(t.tenantId) in src/db/schema.ts.",
    ).toEqual([]);
  });

  /*
    Uniqueness declared on a column reached the schema and never reached the database.
    board_outputs.period_id was `.unique()` in code with no constraint on the real table, so
    nothing stopped two board packs existing for the same month — the pack being that month's
    official account of itself.

    Drizzle keeps column-level unique() on the column, nowhere near index() and uniqueIndex(), and
    only those two were being read. This fails if that quietly stops being true again.
  */
  it('carries column-level unique() through to the database', () => {
    const boardOutputs = tableShapes().find(t => t.name === 'board_outputs');
    expect(boardOutputs, 'board_outputs is missing from the schema').toBeTruthy();
    expect(
      boardOutputs!.indexes.some(i => i.unique && i.columns.join() === 'period_id'),
      'board_outputs.period_id is declared unique in the schema and no unique index is generated ' +
      'for it, so two board packs could exist for the same month.',
    ).toBe(true);
  });
});

/** A database holding roughly half of what the build wants — the realistic middle case. */
function halfADatabase(): Map<string, Set<string>> {
  const full = expectedShape();
  const out = new Map<string, Set<string>>();
  let i = 0;
  for (const [table, columns] of full) {
    if (i++ % 2 === 0) continue;                       // every other table missing entirely
    const kept = [...columns].filter((_, n) => n % 3 !== 0); // and a third of the columns gone
    out.set(table, new Set(kept));
  }
  return out;
}
