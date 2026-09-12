/**
 * Reading and writing the improvement register.
 *
 * The pure rules live in lib/register — ranking, visibility, recurrence. This is the thin layer
 * that puts rows in front of them, so the rules stay testable without a database and the database
 * work stays boring.
 */
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import type { Pillar } from './scoring';
import type { Diagnosis } from './diagnose';
import { rank, visibleTo, recurrenceOf, type Bloom, type RegisterEntry } from './register';

type Row = typeof schema.registerEntries.$inferSelect;

/** JSON in a text column is a reasonable place for a small fixed shape; a bad parse is not. */
function readJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toEntry(row: Row): RegisterEntry {
  return {
    id: row.id,
    text: row.text,
    createdBy: row.createdBy,
    createdAt: Date.parse(row.createdAt),
    bloom: readJson<Bloom[]>(row.bloom, []),
    chain: readJson<Pillar[]>(row.chain, []),
    noOwner: row.noOwner,
    status: row.status as RegisterEntry['status'],
    owner: row.owner,
    accepted: row.accepted,
    deadline: row.deadline,
    recurrenceCount: row.recurrenceCount,
    reopenCount: row.reopenCount,
    signedOffAt: row.signedOffAt ? Date.parse(row.signedOffAt) : null,
  };
}

/** Everything logged for a business, newest arithmetic applied. Filtered by the caller. */
export async function allEntries(tenantId: string): Promise<RegisterEntry[]> {
  const rows = await db.select().from(schema.registerEntries).where(eq(schema.registerEntries.tenantId, tenantId));
  return rows.map(toEntry);
}

/** The register as one person sees it: their own, and their reports' — ranked. */
export async function registerFor(tenantId: string, me: string, myReports: string[]): Promise<RegisterEntry[]> {
  const all = await allEntries(tenantId);
  return rank(all.filter(e => visibleTo(e, me, myReports)));
}

export interface LoggedProblem {
  entry: RegisterEntry;
  /** True when this was the same problem again rather than a new one. */
  raisedAgain: boolean;
}

/**
 * Log a problem.
 *
 * A problem raised again is not a duplicate row — it is the same problem, with the count going up.
 * That count is what makes the register worth reading: four separate rows look like four small
 * things, and one row raised four times looks like what it is.
 *
 * Reopening is stronger still. A problem that was signed off and came back means the fix did not
 * hold, so the entry goes back to open, keeps its history, and carries a reopen count that nobody
 * can quietly lose.
 */
export async function logProblem(
  tenantId: string,
  text: string,
  diagnosis: Diagnosis,
  createdBy: string | null,
): Promise<LoggedProblem> {
  const existing = await allEntries(tenantId);
  const already = recurrenceOf(text, existing);

  if (already) {
    const reopening = already.status === 'closed';
    await db.update(schema.registerEntries)
      .set({
        recurrenceCount: already.recurrenceCount + 1,
        ...(reopening
          ? { status: 'open', reopenCount: already.reopenCount + 1, signedOffAt: null, accepted: null }
          : {}),
      })
      .where(and(eq(schema.registerEntries.id, already.id), eq(schema.registerEntries.tenantId, tenantId)));

    const [row] = await db.select().from(schema.registerEntries).where(eq(schema.registerEntries.id, already.id));
    return { entry: toEntry(row), raisedAgain: true };
  }

  const id = randomUUID();
  await db.insert(schema.registerEntries).values({
    id,
    tenantId,
    text,
    createdBy,
    createdAt: new Date().toISOString(),
    bloom: JSON.stringify(diagnosis.bloom),
    chain: JSON.stringify(diagnosis.chain),
    errorLine: diagnosis.errorLine,
    solutionLine: diagnosis.solutionLine,
    noOwner: diagnosis.noOwner,
  });
  const [row] = await db.select().from(schema.registerEntries).where(eq(schema.registerEntries.id, id));
  return { entry: toEntry(row), raisedAgain: false };
}

/** Give it to somebody. They have not accepted it yet — that is their call, not the assigner's. */
export async function assign(tenantId: string, id: string, owner: string, deadline: string | null) {
  await db.update(schema.registerEntries)
    .set({ owner, accepted: null, deadline, noOwner: false })
    .where(and(eq(schema.registerEntries.id, id), eq(schema.registerEntries.tenantId, tenantId)));
}

/**
 * Accept it, or say it is not yours.
 *
 * Denying is a real answer and not an escalation. A problem landing on the wrong person is the
 * ordinary case in a business that has not finished drawing its chart, and the register treats it
 * as information — the owner comes off, and finding the right one goes back to being the first job.
 */
export async function respond(tenantId: string, id: string, accepted: boolean) {
  await db.update(schema.registerEntries)
    .set(accepted ? { accepted: true } : { accepted: false, owner: null, noOwner: true })
    .where(and(eq(schema.registerEntries.id, id), eq(schema.registerEntries.tenantId, tenantId)));
}

/** The owner says the work is done. It is not closed until somebody else agrees, in the meeting. */
export async function markDone(tenantId: string, id: string) {
  await db.update(schema.registerEntries)
    .set({ status: 'done' })
    .where(and(eq(schema.registerEntries.id, id), eq(schema.registerEntries.tenantId, tenantId)));
}

/**
 * Signed off in the weekly meeting.
 *
 * Deliberately a different act from marking it done, and deliberately not the same person. One
 * person deciding their own work is finished is how a register fills up with things that were never
 * actually fixed — and the sixty-day audit exists because even a signed-off problem can come back.
 */
export async function signOff(tenantId: string, id: string) {
  await db.update(schema.registerEntries)
    .set({ status: 'closed', signedOffAt: new Date().toISOString() })
    .where(and(eq(schema.registerEntries.id, id), eq(schema.registerEntries.tenantId, tenantId)));
}
