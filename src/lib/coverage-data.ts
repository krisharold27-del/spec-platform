import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import {
  effectiveChoices, rowsFor, ownLine, connectionState, type Choices, type Runner, type ModuleKey, type OwnLine,
} from './coverage';

/**
 * The Coverage choices, against the database. Thin on purpose: every decision is in `lib/coverage`.
 *
 * Every read and write carries the tenant in the query — the same rule every other table keeps, and
 * RLS holds it again underneath.
 */

/** Who runs what in this business. A business that has never changed anything reads all SPEC. */
export async function coverageFor(tenantId: string): Promise<Choices> {
  const rows = await db.select({ capability: schema.coverageChoices.capability, choice: schema.coverageChoices.choice })
    .from(schema.coverageChoices)
    .where(eq(schema.coverageChoices.tenantId, tenantId));
  return effectiveChoices(rows);
}

/** The business's own connections — never a person's mailbox — by kind and state. */
export async function connectionsFor(tenantId: string): Promise<{ category: string; status: string }[]> {
  return db.select({ category: schema.systemConnections.category, status: schema.systemConnections.status })
    .from(schema.systemConnections)
    .where(and(eq(schema.systemConnections.tenantId, tenantId), isNull(schema.systemConnections.personalFor)));
}

/**
 * Hand these capabilities to SPEC or to the business's own system. SPEC is the default and is never
 * written: choosing it removes the row.
 */
export async function setCoverage(tenantId: string, keys: readonly string[], runner: Runner, by: string): Promise<void> {
  const { set, clear } = rowsFor(keys, runner);
  if (clear.length) {
    await db.delete(schema.coverageChoices).where(and(
      eq(schema.coverageChoices.tenantId, tenantId),
      inArray(schema.coverageChoices.capability, clear),
    ));
  }
  const at = new Date().toISOString();
  for (const capability of set) {
    await db.insert(schema.coverageChoices)
      .values({ id: randomUUID(), tenantId, capability, choice: runner, updatedBy: by, updatedAt: at })
      .onConflictDoUpdate({
        target: [schema.coverageChoices.tenantId, schema.coverageChoices.capability],
        set: { choice: runner, updatedBy: by, updatedAt: at },
      });
  }
}

/**
 * What a module tab says about who runs it — the line (or null) and whether that kind of system is
 * connected. One read each of the choices and the connections; both are small.
 */
export async function ownSystemFor(tenantId: string, module: ModuleKey, tab: string): Promise<{ line: OwnLine | null; connected: boolean }> {
  const line = ownLine(module, tab, await coverageFor(tenantId));
  if (!line) return { line, connected: false };
  return { line, connected: connectionState(line.category, await connectionsFor(tenantId)) === 'live' };
}
