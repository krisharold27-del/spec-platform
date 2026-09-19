import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { answerFor } from './status';
import { powerReading, type Measure, type PowerReading } from './power-meter';

/**
 * The Power Meter, against the database.
 *
 * One read of the business's own criteria and how they were marked in the month being looked at —
 * and then `lib/power-meter` decides everything else, without a connection. The split is the same
 * one the rest of this codebase keeps: the judgement is pure and testable, the query is thin.
 *
 * ── Scope is applied in the QUERY ───────────────────────────────────────────────────────────────
 *
 * The roles come from the viewer's own scope, so the reading is of their branch and nothing above
 * it. Doing that here rather than in the page means there is no render that briefly holds numbers
 * somebody may not see, and no second code path where a future screen forgets.
 *
 * A manager's meter is therefore genuinely a different number from the Managing Director's, and
 * that is correct: it answers "how is MY part of this business tracking", which is the question
 * somebody can actually do something about.
 */

export interface PowerMeterInput {
  tenantId: string;
  /** The month being read. Null when the business has no period yet. */
  periodId: string | null;
  /** The roles this viewer may see — their own and everything beneath it. */
  visible: ReadonlySet<string>;
}

export async function powerMeterFor(input: PowerMeterInput): Promise<PowerReading> {
  const roleIds = [...input.visible];
  if (!roleIds.length || !input.periodId) return powerReading([]);

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
  if (!criteria.length) return powerReading([]);

  const marks = await db.select({
    criterionId: schema.assessments.criterionId,
    roleId: schema.assessments.roleId,
    answer: schema.assessments.answer,
    status: schema.assessments.status,
    result: schema.assessments.result,
  })
    .from(schema.assessments)
    .where(and(
      eq(schema.assessments.periodId, input.periodId),
      inArray(schema.assessments.roleId, roleIds),
    ));

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

        They can disagree on older rows — `status` arrived after `answer` — and status is the one a
        person actually picked. Reading the raw answer first would score a month by a column nobody
        has looked at since, which is the shape of every stale-number fault in this product.
      */
      answer: mark ? (answerFor(mark.status) || (mark.answer as Measure['answer'])) : '',
      result: mark?.result ?? null,
      target: c.target,
    };
  });

  return powerReading(measures);
}
