/**
 * The seats, loaded — what `lib/ioc` needs to answer LINK's three questions.
 *
 * ── One set of rules, read twice ─────────────────────────────────────────────────────────────────
 *
 * The People screen already worked all of this out inline: who holds a role, whether an expired
 * ticket or an overdue module stops them, whether the role is scored at all. That loop is what the
 * org chart needed, and it was locked inside a page.
 *
 * So the RULES stay in one place — `blockingReasons`, `dueState`, `clearToWork`, `isScored` are
 * imported here exactly as People imports them — and this reads them for the chart. Two queries
 * over one set of rules cannot disagree; two copies of the rules would, and the day they did
 * nobody could say which screen was right.
 */
import { eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getScope, type Scope } from './scope';
import { getScorecard } from './queries';
import { currentPeriod } from './period';
import { blockingReasons } from './obligations';
import { dueState, dueDateFor } from './training';
import { clearToWork } from './people';
import { isScored } from './today-data';
import type { Seat } from './ioc';
import type { CurrentUser } from './auth';

export async function seatsFor(user: CurrentUser, scope?: Scope): Promise<Seat[]> {
  const s = scope ?? await getScope(user);
  const visible = s.roles.filter(r => s.visible.has(r.id));
  const now = new Date();

  const [criteria, assignments, obligationRows, curriculum, records, modules, period] = await Promise.all([
    /* Criteria hang off a role, not a tenant — scoped by the visible roles below. */
    db.select().from(schema.criteria),
    db.select().from(schema.roleAssignments).where(isNull(schema.roleAssignments.toDate)),
    db.select().from(schema.obligations).where(eq(schema.obligations.tenantId, user.tenantId)),
    db.select().from(schema.roleCurriculum),
    db.select().from(schema.trainingRecords).where(eq(schema.trainingRecords.tenantId, user.tenantId)),
    db.select().from(schema.trainingModules).where(eq(schema.trainingModules.tenantId, user.tenantId)),
    currentPeriod(user.tenantId),
  ]);

  const out: Seat[] = [];
  for (const r of visible) {
    const own = criteria.filter(c => c.roleId === r.id && c.active);
    const scored = isScored(r.level, own.length, r.isTeam);
    const assignment = assignments.find(a => a.roleId === r.id);
    const name = r.holder?.name ?? r.pencilled ?? null;

    let blocking: string[] = [];
    if (period && scored) {
      const { rows } = await getScorecard(r.id, period.id);
      blocking = rows.filter(x => x.pillar === 'compliance' && x.answer === 'N').map(x => x.text);
    }
    const theirs = obligationRows.filter(o =>
      o.roleId === r.id
      || (assignment?.userId && o.userId === assignment.userId)
      || (assignment?.staffId && o.staffId === assignment.staffId));
    blocking = [...blocking, ...blockingReasons(
      theirs.map(o => ({ what: o.what, expiresAt: o.expiresAt, who: name ?? r.title })), now)];

    const path = curriculum.filter(c => c.roleId === r.id);
    const done = new Set(records.filter(x => x.userId === assignment?.userId && x.progress >= 100).map(x => x.moduleId));
    const overdue = path
      .filter(c => dueState(dueDateFor(assignment?.fromDate ?? null, c.dueDays), done.has(c.moduleId), now) === 'overdue')
      .map(c => modules.find(m => m.id === c.moduleId)?.title ?? 'A module');

    const ctw = clearToWork({
      roleId: r.id, roleTitle: r.title, name,
      placement: r.holder ? 'held' : r.pencilled ? 'pencilled' : 'vacant',
      seated: !!assignment?.userId,
      blocking, overdue,
    });

    out.push({
      id: r.id,
      title: r.title,
      person: name,
      pencilled: !r.holder && !!r.pencilled,
      scored,
      hasKpis: own.length > 0,
      clear: ctw.state,
      overdue,
      blocking,
    });
  }
  return out;
}
