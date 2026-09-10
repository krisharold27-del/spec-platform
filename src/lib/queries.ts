/** Read-side queries used by the pages. All scores are computed here from raw assessments — never stored. */
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { roleScore, teamScore, gates as gateCalc, PILLARS, type Pillar, type RoleScore, type Answer } from './scoring';
import { answerFor } from './status';

export async function getTenantById(id: string) {
  const rows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, id));
  return rows[0];
}

export async function getCurrentPeriod(tenantId: string) {
  const rows = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId)).orderBy(desc(schema.periods.period));
  return rows[0];
}

export interface RoleView {
  id: string; title: string; stream: string; level: string; reportsToRoleId: string | null;
  holder: { name: string; email: string; access: string } | null;
  /**
   * Someone pencilled into the role who has not been invited yet. They have no account and cost
   * nothing, but the chart should still show the business as the leader has drawn it — a role with
   * a name against it is not the same as an empty one.
   */
  pencilled: string | null;
}

export async function getRoles(tenantId: string): Promise<RoleView[]> {
  const rows = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)))
    .orderBy(schema.roles.sortOrder);
  const out: RoleView[] = [];
  for (const r of rows) {
    const a = await db.select({ name: schema.users.name, email: schema.users.email, access: schema.users.access })
      .from(schema.roleAssignments)
      .innerJoin(schema.users, eq(schema.users.id, schema.roleAssignments.userId))
      .where(and(eq(schema.roleAssignments.roleId, r.id), isNull(schema.roleAssignments.toDate)));
    let pencilled: string | null = null;
    if (!a[0]) {
      const p = await db.select({ name: schema.staff.name })
        .from(schema.roleAssignments)
        .innerJoin(schema.staff, eq(schema.staff.id, schema.roleAssignments.staffId))
        .where(and(eq(schema.roleAssignments.roleId, r.id), isNull(schema.roleAssignments.toDate)));
      pencilled = p[0]?.name ?? null;
    }
    out.push({ id: r.id, title: r.title, stream: r.stream, level: r.level, reportsToRoleId: r.reportsToRoleId, holder: a[0] ?? null, pencilled });
  }
  return out;
}

export interface ScorecardRow {
  criterionId: string; pillar: Pillar; text: string; weight: number; kpi: boolean; target: string | null;
  answer: Answer; note: string | null;
  /** The label the business uses — see lib/status. `answer` remains the scoring value. */
  status: string | null;
  /** The actual value as reported: "$827,172 (94.0%)", "40.24%", "16 invoices over 90 days". */
  result: string | null;
  /** Where the number came from: a connected system, or a person. */
  source: string | null;
}

export async function getScorecard(roleId: string, periodId: string): Promise<{ rows: ScorecardRow[]; score: RoleScore }> {
  const crit = await db.select().from(schema.criteria)
    .where(and(eq(schema.criteria.roleId, roleId), eq(schema.criteria.active, true)))
    .orderBy(schema.criteria.sortOrder);
  const ans = await db.select().from(schema.assessments)
    .where(and(eq(schema.assessments.roleId, roleId), eq(schema.assessments.periodId, periodId)));
  const byId = new Map(ans.map(a => [a.criterionId, a]));
  // A locked month keeps the answers it was locked with — nothing recalculates history (Watch was
  // stored as N before BUILD_SPEC §3.1 made it NA). An open month scores from the status itself.
  const [period] = await db.select({ status: schema.periods.status }).from(schema.periods).where(eq(schema.periods.id, periodId));
  const locked = period?.status === 'locked';
  const answerOf = (a: (typeof ans)[number] | undefined): Answer =>
    !a ? '' : !locked && a.status ? answerFor(a.status) : (a.answer as Answer);
  const rows: ScorecardRow[] = crit.map(c => ({
    criterionId: c.id, pillar: c.pillar as Pillar, text: c.text, weight: c.weight, kpi: c.kpi, target: c.target,
    answer: answerOf(byId.get(c.id)), note: byId.get(c.id)?.note ?? null,
    status: byId.get(c.id)?.status ?? null,
    result: byId.get(c.id)?.result ?? null,
    source: byId.get(c.id)?.source ?? null,
  }));
  const score = roleScore(
    crit.map(c => ({ id: c.id, pillar: c.pillar as Pillar, text: c.text, weight: c.weight })),
    rows.map(r => ({ criterionId: r.criterionId, answer: r.answer })),
  );
  return { rows, score };
}

/**
 * Roll up a specific set of roles. Callers pass the roles the viewer is allowed to see (see
 * lib/scope) — this never widens the set itself, so a caller cannot accidentally leak a role
 * the viewer has no business seeing.
 */
export async function getTeamRollupForRoles(roles: RoleView[], periodId: string) {
  const perRole = [];
  for (const r of roles) perRole.push({ role: r, ...(await getScorecard(r.id, periodId)) });
  // Team averages use scored roles only — an unscored role is missing data, not a zero.
  // teamScore drops unscored roles itself; scoredCount must agree with it.
  const team = teamScore(perRole.map(p => p.score));
  const scoredCount = perRole.filter(p => p.score.overall !== null).length;
  return { roles: perRole, team, scoredCount, roleCount: roles.length };
}

/**
 * Whole-tenant rollup. Only for genuinely business-wide outputs (the board pack), never for a page
 * a non-GM can open — those must scope the roles first and use getTeamRollupForRoles.
 */
export async function getTeamRollup(tenantId: string, periodId: string) {
  const roles = (await getRoles(tenantId)).filter(r => r.level !== 'staff');
  return getTeamRollupForRoles(roles, periodId);
}

export async function getGates(periodId: string) {
  const rows = await db.select().from(schema.gates).where(eq(schema.gates.periodId, periodId));
  const zh = rows.find(g => g.gate === 'zero_harm');
  const ctw = rows.find(g => g.gate === 'clear_to_work');
  const entered = !!(zh || ctw);
  const calc = gateCalc({
    lti: zh && !zh.pass ? 1 : 0, mti: 0, psychosocial: 0,
    trainingCompliance: ctw ? Number(ctw.value) : 0,
  });
  return { entered, zeroHarm: zh ? { pass: zh.pass, value: zh.value, reason: zh.reason } : null,
           clearToWork: ctw ? { pass: ctw.pass, value: ctw.value, reason: ctw.reason } : null, calc };
}

export { PILLARS };
