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
import { MIN_KPIS } from './chart-seats';

const PILLARS = ['safety', 'people', 'earnings', 'compliance'] as const;

/** Is there anything worth opening a month for? */
export async function hasSomethingToScore(tenantId: string): Promise<boolean> {
  const roles = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)));
  for (const r of roles.filter(r => r.level !== 'staff')) {
    const crit = await db.select().from(schema.criteria)
      .where(and(eq(schema.criteria.roleId, r.id), eq(schema.criteria.active, true)));
    /*
      The same minimum the org chart's readiness dots use — see lib/chart-seats.

      It was the literal 2 here and the literal 2 there, which is how a chart goes green on a
      pillar against a month that will not open on it.
    */
    if (PILLARS.every(p => crit.filter(c => c.pillar === p && c.kpi).length >= MIN_KPIS)) return true;
  }
  return false;
}

/** This calendar month, as the `YYYY-MM` a period is keyed on. */
export const monthNow = (at: Date = new Date()): string => at.toISOString().slice(0, 7);

/**
 * Has the calendar moved past the last month this business has?
 *
 * ── The rhythm, and what it replaced ─────────────────────────────────────────────────────────────
 *
 * Kris, 24 September:
 *
 *   "Scores SET (lock) at the end of the last day of the month. On the 1st of the next month the
 *    SCORES clear to zero. The KPIs themselves, targets, owners and team KPIs all carry over
 *    unchanged. Nothing is deleted. The locked month is still reviewed and signed off (GM submits,
 *    Director signs) as before, but scoring for the new month starts on the 1st regardless."
 *
 * This supersedes the rule still written on the `periods` table — *"Locking is a separate,
 * deliberate act — a person's decision, never a date."* That was right about SIGN-OFF, which is
 * still nobody's decision but a person's, and wrong about SCORING. A month whose marks can still be
 * changed halfway through the next one is not a month a board pack can be built from.
 *
 * ── The fault this fixes is worse than a missing feature ─────────────────────────────────────────
 *
 * `currentPeriod` returned the LAST period whenever none was open. It never asked what month it is.
 * So a business that signed September off would open SPEC on 1 October and be shown September —
 * signed, unmarkable — as its current month, with no way to start the new one. That is not a
 * feature waiting to be built. It is a product that stops working on the first of the month, and it
 * would have happened to JBI in seven days.
 *
 * Nothing is migrated when a month rolls. KPIs, targets, owners and team KPIs live on the ROLE, not
 * on the period, so they carry over by sitting still; the scores clear to zero because a new period
 * simply has no marks against it yet. That is the whole mechanism, and it is why the schema needed
 * no change at all.
 */
export const needsNewMonth = (
  latest: { period: string } | undefined | null,
  at: Date = new Date(),
): boolean => Boolean(latest) && latest!.period < monthNow(at);

/**
 * May this month still be marked?
 *
 * Only the current one. A past month is set, whatever its sign-off state, because its marks are
 * what the board pack, the Ace streaks and the incentives are read from — and a number that can
 * move after the month it describes is not a record of anything.
 */
export const isMarkable = (
  period: { period: string; status: string } | null | undefined,
  at: Date = new Date(),
): boolean => Boolean(period) && period!.period === monthNow(at) && period!.status !== 'locked';

/**
 * The period to show. Returns null only when there is genuinely nothing to score yet — never
 * because of a billing state, which is a separate question and never a reason to hide a business's
 * own numbers from it.
 */
export async function currentPeriod(tenantId: string) {
  const existing = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  const thisMonth = monthNow();

  // The month that IS this month, whatever state it has reached.
  const current = existing.find(p => p.period === thisMonth);
  if (current) return current;

  const latest = [...existing].sort((a, b) => a.period.localeCompare(b.period)).at(-1);

  /*
    A month has rolled over. Open the new one, and leave the old one exactly as it is — it is still
    reviewed and signed off on its own timetable, and nothing about it is rewritten or deleted.
  */
  if (needsNewMonth(latest)) {
    await db.insert(schema.periods)
      .values({ id: randomUUID(), tenantId, period: thisMonth })
      .onConflictDoNothing();
    const after = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
    return after.find(p => p.period === thisMonth) ?? latest ?? null;
  }

  if (latest) return latest;

  if (!(await hasSomethingToScore(tenantId))) return null;

  await db.insert(schema.periods)
    .values({ id: randomUUID(), tenantId, period: thisMonth })
    .onConflictDoNothing();
  const created = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  return created[0] ?? null;
}
