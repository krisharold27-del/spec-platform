/**
 * When the business last changed anything, and what is outstanding.
 *
 * Used to show a leader where things actually stand when a rollout has gone quiet. This is written
 * for mature adults running businesses: it reports facts and the decision in front of them. It does
 * not count days at anyone, name their state of mind, or offer encouragement. A board paper does
 * not tell you how to feel about the numbers, and neither does this.
 */
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';

export interface Momentum {
  /** ISO timestamp of the most recent change anywhere in this business, if there has been one. */
  lastChangeAt: string | null;
  /** Whole days since that change. */
  daysSince: number;
  /** True once the rollout has been sitting untouched long enough to be worth reporting. */
  quiet: boolean;
}

export const QUIET_AFTER_DAYS = 7;

export async function momentumFor(tenantId: string, now: Date = new Date()): Promise<Momentum> {
  const stamps: string[] = [];

  const diagnostics = await db.select({ at: schema.diagnostics.answeredAt })
    .from(schema.diagnostics).where(eq(schema.diagnostics.tenantId, tenantId));
  stamps.push(...diagnostics.map(d => d.at));

  const assignments = await db.select({ at: schema.roleAssignments.fromDate })
    .from(schema.roleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.roleAssignments.roleId))
    .where(eq(schema.roles.tenantId, tenantId));
  stamps.push(...assignments.map(a => a.at));

  const periods = await db.select({ id: schema.periods.id })
    .from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  for (const p of periods) {
    const rows = await db.select({ at: schema.assessments.enteredAt })
      .from(schema.assessments).where(eq(schema.assessments.periodId, p.id));
    stamps.push(...rows.map(r => r.at));
    const outs = await db.select({ at: schema.boardOutputs.createdAt })
      .from(schema.boardOutputs).where(eq(schema.boardOutputs.periodId, p.id));
    stamps.push(...outs.map(o => o.at));
  }

  const valid = stamps.filter(Boolean).sort();
  const lastChangeAt = valid.length ? valid[valid.length - 1] : null;
  if (!lastChangeAt) return { lastChangeAt: null, daysSince: 0, quiet: false };

  const daysSince = Math.floor((now.getTime() - new Date(lastChangeAt).getTime()) / (24 * 60 * 60 * 1000));
  return { lastChangeAt, daysSince, quiet: daysSince >= QUIET_AFTER_DAYS };
}

/** "18 August" — a date a person recognises, not a timestamp. */
export function onDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
}
