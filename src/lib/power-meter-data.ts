import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { answerFor } from './status';
import { powerReading, type Measure, type PowerReading } from './power-meter';

/**
 * The Power Meter, against the database.
 *
 * One read of the business's own criteria and how they were marked — and then `lib/power-meter`
 * decides everything else, without a connection. The judgement is pure and testable; the query is
 * thin.
 *
 * ── Which month it reads, and why that is the whole feature ─────────────────────────────────────
 *
 * The first version read whatever the newest period was. On JBI that is September, which opened a
 * few days ago and **has not one mark in it** — so the meter Kris asked for said *"Not enough to
 * read"* on his own business, on the day he opened it. Kris, 19 September: *"fix this problem - it
 * makes this really frustrating"*.
 *
 * It was not wrong, it was useless. A month is scored at its end, so a meter tied to the open month
 * is blank for most of every month — blank on the first, blank on the tenth, and worth looking at
 * for about three days. Nobody would ever see a number.
 *
 * So it reads **the most recent month that anybody has actually marked**, and says which one. That
 * is what a power meter is: the last reading taken, not an empty gauge because the next one is due.
 * The month is returned so the screen can name it — a number with no date on it is an argument
 * waiting to happen, which is the rule `lib/mirror-kpis` already follows.
 *
 * ── Scope is applied in the QUERY ───────────────────────────────────────────────────────────────
 *
 * The roles come from the viewer's own scope, so the reading is their branch and nothing above it.
 * Doing that here rather than in the page means no render ever briefly holds numbers somebody may
 * not see, and no second code path where a future screen forgets.
 */

export interface PowerMeterInput {
  tenantId: string;
  /** The roles this viewer may see — their own and everything beneath it. */
  visible: ReadonlySet<string>;
}

export interface PowerMeterResult {
  reading: PowerReading;
  /** The month the reading is OF — "2026-08". Null when no month has ever been marked. */
  period: string | null;
  /** True when that is not the month the business is currently in. */
  stale: boolean;
}

export async function powerMeterFor(input: PowerMeterInput): Promise<PowerMeterResult> {
  const roleIds = [...input.visible];
  const empty = { reading: powerReading([]), period: null, stale: false };
  if (!roleIds.length) return empty;

  /*
    KPIs only.

    A criterion that is not a KPI is a standard the role is held to — worth marking, not worth
    rolling into a number the board reads. Including them would let a business move the meter by
    adding standards rather than by running better.
  */
  const criteria = await db.select({
    id: schema.criteria.id,
    roleId: schema.criteria.roleId,
    text: schema.criteria.text,
    target: schema.criteria.target,
    title: schema.roles.title,
  })
    .from(schema.criteria)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.criteria.roleId))
    .where(and(
      eq(schema.roles.tenantId, input.tenantId),
      inArray(schema.criteria.roleId, roleIds),
      eq(schema.criteria.active, true),
      eq(schema.criteria.kpi, true),
    ));
  if (!criteria.length) return empty;

  const periods = await db.select({ id: schema.periods.id, period: schema.periods.period })
    .from(schema.periods)
    .where(eq(schema.periods.tenantId, input.tenantId))
    .orderBy(desc(schema.periods.period));
  if (!periods.length) return empty;

  /*
    Newest first, and stop at the first month somebody has marked.

    Capped at a year. A reading from eighteen months ago is not a power meter, it is an anecdote —
    and quietly dressing one up as the current state of a business is exactly the stale-number
    fault this product keeps finding.
  */
  const WINDOW = 12;
  for (const candidate of periods.slice(0, WINDOW)) {
    const marks = await db.select({
      criterionId: schema.assessments.criterionId,
      roleId: schema.assessments.roleId,
      answer: schema.assessments.answer,
      status: schema.assessments.status,
      result: schema.assessments.result,
    })
      .from(schema.assessments)
      .where(and(
        eq(schema.assessments.periodId, candidate.id),
        inArray(schema.assessments.roleId, roleIds),
      ));
    if (!marks.length) continue;

    const markOf = new Map(marks.map(m => [`${m.roleId}:${m.criterionId}`, m]));
    const measures: Measure[] = criteria.map(c => {
      const mark = markOf.get(`${c.roleId}:${c.id}`);
      return {
        criterionId: c.id,
        text: c.text,
        roleId: c.roleId,
        roleTitle: c.title,
        /*
          The STATUS decides, with the stored answer as the fallback.

          They can disagree on older rows — `status` arrived after `answer` — and status is the one
          a person actually picked. Reading the raw answer first would score a month by a column
          nobody has looked at since, which is the shape of every stale-number fault here.
        */
        answer: mark ? (answerFor(mark.status) || (mark.answer as Measure['answer'])) : '',
        result: mark?.result ?? null,
        target: c.target,
      };
    });

    return {
      reading: powerReading(measures),
      period: candidate.period,
      stale: candidate.period !== periods[0].period,
    };
  }

  return empty;
}
