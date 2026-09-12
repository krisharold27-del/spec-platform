/**
 * The SQL that brings a database up to this build — and nothing else.
 *
 * Why this exists, written down because the cost was real: the deploy used `drizzle-kit push`,
 * which reconciles in BOTH directions. It adds what the code needs and drops what the code no
 * longer mentions. Dropping is how an automated deploy becomes data loss, so the deploy refused to
 * run at all whenever the database held anything the build did not recognise.
 *
 * That refusal was correct and its consequence was a disaster. One forgotten table in the live
 * database — something from an experiment months ago — meant **no schema change ever reached
 * production again**, silently, for months. By 12 September the live database was missing nine
 * tables and seventeen columns, so the improvement register, training, approvals and candidates
 * had never worked for a real customer. The product was not broken. The database was empty of the
 * things it needed, and the mechanism that should have said so had been politely declining to act.
 *
 * So this generates ONLY additive statements:
 *
 *   create table if not exists     — never `drop table`
 *   alter table ... add column     — never `drop column`, never `alter column type`
 *   create index if not exists     — never `drop index`
 *
 * There is no code path here that removes anything. Not "we check first" — the strings are not
 * generated. Extras in the database are left exactly alone, which means a forgotten table can no
 * longer hold the whole product hostage.
 *
 * What it deliberately does NOT do: change a column that already exists. If the code says a column
 * is now an integer and the database has text, this leaves it and says so. That is a decision for
 * a person, and unlike a missing column it is not the thing that silently breaks a page.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';

export interface AdditivePlan {
  /** Statements in the order they must run. */
  statements: string[];
  /** Said out loud in the build log, so a deploy is never silent about what it did. */
  notes: string[];
}

interface ColumnShape {
  name: string;
  type: string;
  notNull: boolean;
  hasDefault: boolean;
  defaultSql: string | null;
  primary: boolean;
}

interface TableShape {
  name: string;
  columns: ColumnShape[];
  indexes: { name: string; columns: string[]; unique: boolean }[];
}

/** A Postgres literal for a Drizzle default. Only the shapes this schema actually uses. */
function defaultLiteral(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  // Anything else — a function, an SQL expression, a JSON object — is not worth guessing at.
  return null;
}

/** Every table this build defines, in the shape needed to write SQL for it. */
export function tableShapes(): TableShape[] {
  const out: TableShape[] = [];
  for (const value of Object.values(schema)) {
    if (!value || typeof value !== 'object') continue;
    let config;
    try {
      config = getTableConfig(value as PgTable);
    } catch {
      continue; // not a table — enums, relations, helpers
    }
    out.push({
      name: config.name,
      columns: config.columns.map(c => ({
        name: c.name,
        type: c.getSQLType(),
        notNull: c.notNull,
        hasDefault: c.hasDefault,
        defaultSql: defaultLiteral((c as { default?: unknown }).default),
        primary: c.primary,
      })),
      indexes: config.indexes.map(i => {
        const cfg = i.config as { name: string; unique?: boolean; columns?: { name?: string }[] };
        return {
          name: cfg.name,
          unique: Boolean(cfg.unique),
          columns: (cfg.columns ?? []).map(c => c?.name).filter((n): n is string => Boolean(n)),
        };
      }),
    });
  }
  return out;
}

const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;

/** One column, as it appears inside `create table`. */
function columnDdl(c: ColumnShape): string {
  const bits = [quote(c.name), c.type];
  if (c.primary) bits.push('primary key');
  if (c.hasDefault && c.defaultSql !== null) bits.push(`default ${c.defaultSql}`);
  if (c.notNull && !c.primary) bits.push('not null');
  return bits.join(' ');
}

/**
 * The plan.
 *
 * `actual` is what the database currently has, table name → column names, exactly as
 * `schema-check.actualShape` reads it. A table absent from the map is created; a table present
 * with columns missing gets those columns added.
 */
export function additivePlan(actual: Map<string, Set<string>>): AdditivePlan {
  const statements: string[] = [];
  const notes: string[] = [];
  const shapes = tableShapes();

  /*
    Foreign keys are left out entirely, and that is on purpose.

    A missing table can hold up a page. A missing FK constraint cannot — the application already
    only writes ids it just read, and every tenant-scoped read is scoped in code and again by
    row-level security. Emitting FKs here would mean creating tables in dependency order and
    inventing `add constraint if not exists` on a version of Postgres that has no such thing, for
    a guarantee this schema is not relying on at runtime. Not worth the ways it could go wrong
    mid-deploy. `drizzle/` holds the full definitions for a database built from scratch.
  */
  for (const t of shapes) {
    const have = actual.get(t.name);

    if (!have) {
      statements.push(
        `create table if not exists ${quote(t.name)} (\n  ${t.columns.map(columnDdl).join(',\n  ')}\n)`,
      );
      notes.push(`created table ${t.name}`);
    } else {
      for (const c of t.columns) {
        if (have.has(c.name)) continue;

        /*
          A NOT NULL column cannot be added to a table that already has rows unless it brings a
          default with it. Rather than fail the whole deploy — or invent a value for somebody's
          real data — it is added nullable and said out loud. The page that reads it works either
          way; what would not work is the deploy stopping here.
        */
        const canBeNotNull = c.notNull && (c.hasDefault && c.defaultSql !== null);
        const bits = [quote(c.name), c.type];
        if (c.hasDefault && c.defaultSql !== null) bits.push(`default ${c.defaultSql}`);
        if (canBeNotNull) bits.push('not null');

        statements.push(`alter table ${quote(t.name)} add column if not exists ${bits.join(' ')}`);
        notes.push(
          c.notNull && !canBeNotNull
            ? `added ${t.name}.${c.name} as nullable — the code wants it NOT NULL but it has no default, and existing rows would have nothing to put in it`
            : `added ${t.name}.${c.name}`,
        );
      }
    }

    // Indexes last: the columns they cover have to exist first. Unique ones matter most — several
    // writes rely on `on conflict` against them.
    for (const i of t.indexes) {
      if (!i.name || i.columns.length === 0) continue;
      statements.push(
        `create ${i.unique ? 'unique ' : ''}index if not exists ${quote(i.name)} on ${quote(t.name)} (${i.columns.map(quote).join(', ')})`,
      );
    }
  }

  return { statements, notes };
}

/**
 * Proof, not intention.
 *
 * Every statement this file can produce begins with one of three words. A test runs the generator
 * against an empty database and against a full one and checks every statement it emits — so a
 * future edit that introduces a `drop` fails the build rather than reaching a customer's data.
 */
export const ALLOWED_STARTS = ['create table if not exists', 'alter table', 'create index if not exists', 'create unique index if not exists'];

export function isAdditive(statement: string): boolean {
  const s = statement.trim().toLowerCase();
  if (!ALLOWED_STARTS.some(a => s.startsWith(a))) return false;
  // `alter table` is the only one that could carry something destructive.
  if (s.startsWith('alter table')) return / add column if not exists /.test(s);
  return true;
}
