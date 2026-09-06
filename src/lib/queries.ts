/** Read-side queries used by the pages. All scores are computed here from raw assessments — never stored. */
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { roleScore, teamScore, gates as gateCalc, PILLARS, type Pillar, type RoleScore, type Answer } from './scoring';

export function getTenantById(id: string) {
  return db.select().from(schema.tenants).where(eq(schema.tenants.id, id)).get();
}

export function getCurrentPeriod(tenantId: string) {
  return db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId)).orderBy(desc(schema.periods.period)).get();
}

export interface RoleView {
  id: string; title: string; stream: string; level: string; reportsToRoleId: string | null;
  holder: { name: string; email: string; access: string } | null;
}

export function getRoles(tenantId: string): RoleView[] {
  const rows = db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)))
    .orderBy(schema.roles.sortOrder).all();
  return rows.map(r => {
    const a = db.select({ name: schema.users.name, email: schema.users.email, access: schema.users.access })
      .from(schema.roleAssignments)
      .innerJoin(schema.users, eq(schema.users.id, schema.roleAssignments.userId))
      .where(and(eq(schema.roleAssignments.roleId, r.id), isNull(schema.roleAssignments.toDate))).get();
    return { id: r.id, title: r.title, stream: r.stream, level: r.level, reportsToRoleId: r.reportsToRoleId, holder: a ?? null };
  });
}

export interface ScorecardRow {
  criterionId: string; pillar: Pillar; text: string; weight: number; kpi: boolean; target: string | null;
  answer: Answer; note: string | null;
}

export function getScorecard(roleId: string, periodId: string): { rows: ScorecardRow[]; score: RoleScore } {
  const crit = db.select().from(schema.criteria)
    .where(and(eq(schema.criteria.roleId, roleId), eq(schema.criteria.active, true)))
    .orderBy(schema.criteria.sortOrder).all();
  const ans = db.select().from(schema.assessments)
    .where(and(eq(schema.assessments.roleId, roleId), eq(schema.assessments.periodId, periodId))).all();
  const byId = new Map(ans.map(a => [a.criterionId, a]));
  const rows: ScorecardRow[] = crit.map(c => ({
    criterionId: c.id, pillar: c.pillar as Pillar, text: c.text, weight: c.weight, kpi: c.kpi, target: c.target,
    answer: (byId.get(c.id)?.answer ?? '') as Answer, note: byId.get(c.id)?.note ?? null,
  }));
  const score = roleScore(
    crit.map(c => ({ id: c.id, pillar: c.pillar as Pillar, text: c.text, weight: c.weight })),
    rows.map(r => ({ criterionId: r.criterionId, answer: r.answer })),
  );
  return { rows, score };
}

export function getTeamRollup(tenantId: string, periodId: string) {
  const roles = getRoles(tenantId).filter(r => r.level !== 'staff');
  const perRole = roles.map(r => ({ role: r, ...getScorecard(r.id, periodId) }));
  // Team averages use scored roles only — an unscored role is missing data, not a zero.
  const answered = perRole.filter(p => p.rows.some(r => r.answer !== ''));
  const team = teamScore(answered.map(p => p.score));
  return { roles: perRole, team, scoredCount: answered.length, roleCount: roles.length };
}

export function getGates(periodId: string) {
  const rows = db.select().from(schema.gates).where(eq(schema.gates.periodId, periodId)).all();
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
