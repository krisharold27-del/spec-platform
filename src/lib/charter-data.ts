/**
 * Reading the Board Charter, and the soundness of what sits underneath it, out of a business's
 * own record. Every rule this uses is pure and lives in lib/charter, lib/targets and lib/jcurve.
 */
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { PILLARS, type Pillar } from './scoring';
import { GATE_KEY, CHARTER, charterStanding, type CharterLine } from './charter';
import {
  readNumber, inferDirection, soundness, rollingActual,
  FULL_HISTORY_MONTHS, MIN_MONTHS_TO_JUDGE, type Soundness,
} from './targets';
import { drag, type Drag, type DragInput } from './jcurve';
import { getScope } from './scope';

export interface CharterView {
  lines: CharterLine[];
  /** The month this reading is taken from. */
  period: string | null;
  /**
   * What the business's own record says its gross profit runs at, and the target it has agreed.
   * The one charter figure SPEC cannot supply.
   */
  earnings: { actual: number | null; months: number; target: number | null; soundness: Soundness | null };
}

/** Closed months, oldest first. History is what makes any of this mean anything. */
async function closedPeriods(tenantId: string) {
  const periods = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId));
  return periods
    .filter(p => p.status === 'locked')
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Everything marked against the roles a viewer is entitled to see, across the closed months.
 *
 * Scope is resolved here rather than filtered afterwards: the charter reads the same rule as every
 * other page — only me and above, never sideways.
 */
async function markedHistory(user: CurrentUser) {
  const scope = await getScope(user);
  const roleIds = scope.roles.map(r => r.id);
  const closed = await closedPeriods(user.tenantId);
  if (!roleIds.length || !closed.length) return { closed, rows: [], criteria: [], scope };

  const criteria = (await db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, roleIds)))
    .filter(c => c.active);
  const rows = await db.select().from(schema.assessments)
    .where(inArray(schema.assessments.periodId, closed.map(p => p.id)));
  return { closed, rows: rows.filter(r => roleIds.includes(r.roleId)), criteria, scope };
}

/**
 * The charter as it stands this month.
 *
 * A commitment with no gate entered reads as unmeasured, never as broken — a business that has not
 * recorded whether it hurt anybody has not thereby had a clean month, and it has not failed either.
 */
export async function getCharter(user: CurrentUser): Promise<CharterView> {
  const periods = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, user.tenantId));
  const sorted = periods.sort((a, b) => a.period.localeCompare(b.period));
  const current = sorted.filter(p => p.status !== 'locked').at(0) ?? sorted.at(-1) ?? null;

  const gateRows = current
    ? await db.select().from(schema.gates).where(eq(schema.gates.periodId, current.id))
    : [];

  const readings = PILLARS.map(pillar => {
    const row = gateRows.find(g => g.gate === GATE_KEY[pillar]);
    return { pillar, reading: row?.value ?? null, breached: row ? !row.pass : null };
  });

  // Gross profit, read out of the business's own closed months rather than proposed from anywhere.
  const { closed, rows, criteria } = await markedHistory(user);
  const gp = criteria.filter(c => c.pillar === 'earnings' && /gross profit|\bgp\b/i.test(c.text));
  const gpIds = new Set(gp.map(c => c.id));
  const byPeriod = new Map<string, number>();
  for (const r of rows) {
    if (!gpIds.has(r.criterionId)) continue;
    const value = readNumber(r.result);
    if (value !== null) byPeriod.set(r.periodId, value);
  }
  const actuals = closed.slice(-FULL_HISTORY_MONTHS)
    .map(p => byPeriod.get(p.id))
    .filter((v): v is number => v !== undefined);

  const agreed = gp.map(c => readNumber(c.target)).find(v => v !== null) ?? null;

  return {
    lines: charterStanding(readings),
    period: current?.period ?? null,
    earnings: {
      actual: rollingActual(actuals),
      months: actuals.length,
      target: agreed,
      soundness: actuals.length || agreed !== null
        ? soundness({ target: agreed, actuals, direction: 'higher', unit: '%' })
        : null,
    },
  };
}

/**
 * What is holding this business's dip open, from its own record.
 *
 * Counts how often each measure was actually met across the closed months, and reads every target
 * against the rolling actual behind it. Nothing here is an opinion about the business — every
 * figure is something it wrote down itself.
 */
export async function getDrag(user: CurrentUser): Promise<{ drags: Drag[]; closedMonths: number }> {
  const { closed, rows, criteria, scope } = await markedHistory(user);
  if (!closed.length) return { drags: [], closedMonths: 0 };

  const measures: DragInput['measures'] = [];
  for (const c of criteria) {
    if (!c.kpi) continue;
    const marks = rows.filter(r => r.criterionId === c.id);
    if (!marks.length) continue;

    // Only months that were actually scored count. A pending or not-tracked row is excluded from
    // both sides here for the same reason it is excluded from the pillar fraction: it is a gap in
    // the record, and counting it as a miss would invent a failure nobody had.
    const scored = marks.filter(m => m.answer === 'Y' || m.answer === 'N');
    if (!scored.length) continue;

    const actuals = scored.map(m => readNumber(m.result)).filter((v): v is number => v !== null);
    const s = soundness({
      target: readNumber(c.target),
      actuals,
      direction: inferDirection(c.text, c.target),
    });

    const role = scope.roles.find(r => r.id === c.roleId);
    measures.push({
      label: role ? `${role.title}: ${c.text}` : c.text,
      months: scored.length,
      met: scored.filter(m => m.answer === 'Y').length,
      outOfReach: s.verdict === 'out_of_reach',
      // A target nobody has agreed is unproven in the sense that matters: nothing is behind it.
      unproven: c.target === null || (s.verdict === 'unproven' && s.months >= 1 && s.months < MIN_MONTHS_TO_JUDGE),
    });
  }

  const roles: DragInput['roles'] = scope.roles.map(r => ({
    title: r.title,
    vacant: !r.holder && !r.pencilled,
    measures: criteria.filter(c => c.roleId === r.id && c.kpi).length,
    scored: criteria.some(c => c.roleId === r.id && c.kpi),
  }));

  return { drags: drag({ measures, roles, closedMonths: closed.length }), closedMonths: closed.length };
}

export { CHARTER };
export type { Pillar };
