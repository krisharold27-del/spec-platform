import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { getScope } from './scope';
import { currentPeriod } from './period';
import { getScorecard } from './queries';
import { isScored } from './today-data';
import { dueDateFor, dueState } from './training';
import { blockingReasons } from './obligations';
import { clearToWork } from './people';

/**
 * The crew — the people a job can be booked with — and whether each of them is clear to work.
 *
 * ── One gate, one meaning ────────────────────────────────────────────────────────────────────────
 *
 * Clear to Work is worked out here by exactly the path the People screen uses: a compliance KPI
 * marked not met, an expired or missing ticket held against the person or their role, an overdue
 * training module. Then `clearToWork` in lib/people turns that into clear, not clear, or not
 * established. The schedule refuses anybody who is not clear, so the two screens can never disagree
 * about whether somebody may be sent to site.
 *
 * Only the part of the chart this person can see: a leader books their own crew, and a technician
 * sees themselves. Board roles are not crew.
 */
export interface CrewMember {
  /** `staff:<id>` or `user:<id>` — the key bookings and timesheets are held against. */
  key: string;
  name: string;
  roleTitle: string;
  clear: 'clear' | 'blocked' | 'unknown';
  label: string;
  /** Why, in the person's own terms, when they are not clear. */
  reason: string;
}

export async function crewFor(user: CurrentUser): Promise<CrewMember[]> {
  const scope = await getScope(user);
  const visible = scope.roles.filter(r => scope.canSee(r.id) && r.stream !== 'board');
  const roleIds = visible.map(r => r.id);
  if (!roleIds.length) return [];

  const [assignments, criteria, curriculum, modules, obligationRows, staffRows, seatRows, period] = await Promise.all([
    db.select().from(schema.roleAssignments)
      .where(and(inArray(schema.roleAssignments.roleId, roleIds), isNull(schema.roleAssignments.toDate))),
    db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, roleIds)),
    db.select().from(schema.roleCurriculum).where(inArray(schema.roleCurriculum.roleId, roleIds)),
    db.select().from(schema.trainingModules).where(eq(schema.trainingModules.tenantId, user.tenantId)),
    db.select().from(schema.obligations).where(eq(schema.obligations.tenantId, user.tenantId)),
    db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId)),
    db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId)),
    currentPeriod(user.tenantId),
  ]);
  const userIds = assignments.map(a => a.userId).filter((id): id is string => !!id);
  const records = userIds.length
    ? await db.select().from(schema.trainingRecords)
        .where(and(eq(schema.trainingRecords.tenantId, user.tenantId), inArray(schema.trainingRecords.userId, userIds)))
    : [];

  const now = new Date();
  const out: CrewMember[] = [];
  const seen = new Set<string>();
  for (const r of visible) {
    for (const a of assignments.filter(x => x.roleId === r.id)) {
      const key = a.userId ? `user:${a.userId}` : a.staffId ? `staff:${a.staffId}` : null;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const name = (a.userId ? seatRows.find(u => u.id === a.userId)?.name : undefined)
        ?? (a.staffId ? staffRows.find(s => s.id === a.staffId)?.name : undefined)
        ?? r.title;

      const own = criteria.filter(c => c.roleId === r.id && c.active);
      const scored = isScored(r.level, own.length, r.isTeam);
      let blocking: string[] = [];
      if (period && scored) {
        const { rows } = await getScorecard(r.id, period.id);
        blocking = rows.filter(x => x.pillar === 'compliance' && x.answer === 'N').map(x => x.text);
      }
      const theirs = obligationRows.filter(o =>
        o.roleId === r.id
        || (a.userId && o.userId === a.userId)
        || (a.staffId && o.staffId === a.staffId));
      blocking = [...blocking, ...blockingReasons(theirs.map(o => ({ what: o.what, expiresAt: o.expiresAt, who: name })), now)];

      const done = new Set(records.filter(x => x.userId === a.userId && x.progress >= 100).map(x => x.moduleId));
      const overdue = curriculum
        .filter(c => c.roleId === r.id)
        .filter(c => dueState(dueDateFor(a.fromDate ?? null, c.dueDays), done.has(c.moduleId), now) === 'overdue')
        .map(c => modules.find(m => m.id === c.moduleId)?.title ?? 'A module');

      const ctw = clearToWork({
        roleId: r.id, roleTitle: r.title, name,
        placement: a.userId ? 'held' : 'pencilled',
        seated: !!a.userId,
        blocking, overdue,
      });
      out.push({
        key, name, roleTitle: r.title, clear: ctw.state, label: ctw.label,
        reason: ctw.state === 'blocked' ? [...blocking, ...overdue].join('; ') : ctw.state === 'unknown' ? ctw.note : '',
      });
    }
  }
  return out;
}

/** The business's standard labour cost rate — its first labour rate — or null when it has none. */
export async function standardRate(tenantId: string) {
  const rates = await db.select().from(schema.labourRates)
    .where(eq(schema.labourRates.tenantId, tenantId))
    .orderBy(schema.labourRates.position, schema.labourRates.createdAt);
  return rates[0] ?? null;
}
