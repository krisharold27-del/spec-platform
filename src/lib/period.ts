/**
 * The current month, opened the moment there is something to score.
 *
 * A period used to be created only by the Stripe webhook, on the old "start SPEC Basic" event. Under
 * per-seat pricing that event may never happen — building is free — so the dashboards became
 * permanently unreachable: an owner could draw the whole business, set every KPI, and still be told
 * "no period open yet" forever, with no way to open one.
 *
 * The rule is now the honest one: the month exists as soon as the business has something to put in
 * it. One role with its KPIs set is enough. Nothing is opened for an empty business, because an
 * empty month would score zero and read as a failure rather than as a business not yet built.
 */
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';

const PILLARS = ['safety', 'people', 'earnings', 'compliance'] as const;

/** Is there anything worth opening a month for? */
export async function hasSomethingToScore(tenantId: string): Promise<boolean> {
  const roles = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)));
  for (const r of roles.filter(r => r.level !== 'staff')) {
    const crit = await db.select().from(schema.criteria)
      .where(and(eq(schema.criteria.roleId, r.id), eq(schema.criteria.active, true)));
    if (PILLARS.every(p => crit.filter(c => c.pillar === p && c.kpi).length >= 2)) return true;
  }
  return false;
}

/**
 * The period to show. Returns null only when there is genuinely nothing to score yet — never
 * because of a billing state, which is a separate question and never a reason to hide a business's
 * own numbers from it.
 */
export async function currentPeriod(tenantId: string) {
  const existing = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  const open = existing.find(p => p.status === 'open');
  if (open) return open;
  if (existing.length) return existing[existing.length - 1];

  if (!(await hasSomethingToScore(tenantId))) return null;

  const id = randomUUID();
  const period = new Date().toISOString().slice(0, 7);
  await db.insert(schema.periods).values({ id, tenantId, period }).onConflictDoNothing();
  const created = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  return created[0] ?? null;
}
