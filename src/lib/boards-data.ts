/**
 * What the conversation boards and the J curve read.
 *
 * The rule enforced here, and only here, is the one that keeps a conversation board a mirror: **a
 * board is only ever built about the person asking for it.** There is no roleId parameter and no
 * way to pass one. The moment a board can be pointed at somebody it stops being a mirror and
 * becomes surveillance, and everyone starts managing the board instead of the business.
 *
 * That also means these reads are narrower than they look: the signals are counted across the
 * roles this person already manages, which they can already see, and the answer is shown to nobody
 * else.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { getScope } from './scope';
import { getTeamRollup } from './queries';
import { currentPeriod } from './period';
import { tierOf } from './plan';
import { actionsOf, decisionsOf, attendeesOf, mondayOf, recentMondays, weeksBetween } from './meeting';
import { whoDecides, inTheRoom, whereItWaits, type Board } from './boards';
import { daysBetween, type CurveInput } from './jcurve';
import type { CurrentUser } from './auth';

/** Every board, built about this person and nobody else. */
export async function getBoards(user: CurrentUser, at: Date = new Date()): Promise<Board[]> {
  const scope = await getScope(user);
  const me = user.name;

  // The roles this person manages. Their own is excluded: marking your own card is not
  // concentration, it is the job.
  const managed = scope.roles.filter(r => scope.canEdit(r.id) && r.id !== scope.myRoleId);
  const managedIds = managed.map(r => r.id);

  const meetings = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog')
    .sort((a, b) => a.date.localeCompare(b.date));

  const allDecisions = meetings.flatMap(decisionsOf);
  const allActions = meetings.flatMap(actionsOf);
  const openActions = allActions.filter(a => !a.done);

  // Targets on the roles below: one that was proposed and agreed at the same number never moved.
  const criteria = managedIds.length
    ? (await db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, managedIds)))
        .filter(c => c.active && c.proposedTarget && c.target)
    : [];
  const unchanged = criteria.filter(c => c.proposedTarget === c.target).length;

  // Who marked whose card, and who did the talking on it.
  const period = await currentPeriod(user.tenantId);
  const marks = period && managedIds.length
    ? (await db.select().from(schema.assessments).where(eq(schema.assessments.periodId, period.id)))
        .filter(a => managedIds.includes(a.roleId) && a.enteredBy)
    : [];
  const holderEmails = new Map(managed.map(r => [r.id, r.holder?.email ?? null]));
  const markedByMe = marks.filter(a => a.enteredBy === user.email && holderEmails.get(a.roleId) !== user.email).length;

  const comments = managedIds.length
    ? (await db.select().from(schema.scorecardComments)
        .where(eq(schema.scorecardComments.tenantId, user.tenantId)))
        .filter(c => managedIds.includes(c.roleId))
    : [];

  const board1 = whoDecides({
    me,
    decisions: { total: allDecisions.length, mine: allDecisions.filter(d => d.who === me).length },
    actions: { total: openActions.length, mine: openActions.filter(a => a.owner === me).length },
    targets: { total: criteria.length, unchanged },
    marks: { total: marks.length, mine: markedByMe },
    comments: { total: comments.length, mine: comments.filter(c => c.author === me).length },
  });

  // Attendance across the last six weeks, against the people who run something.
  const roster = 1 + managed.filter(r => r.holder || r.pencilled).length;
  const byWeek = new Map(meetings.map(m => [mondayOf(m.date), m]));
  const weeks = recentMondays(at, 6).map(weekOf => {
    const m = byWeek.get(weekOf);
    return {
      weekOf,
      present: m ? attendeesOf(m).length : 0,
      roster,
      logged: !!m,
    };
  });
  const board2 = inTheRoom({ me, weeks });

  const newest = meetings.length ? meetings[meetings.length - 1].date : null;
  const carried = meetings.flatMap(m =>
    actionsOf(m).filter(a => !a.done).map(a => ({
      weeks: newest ? weeksBetween(m.date, newest) + 1 : 1,
      owner: a.owner,
    })));

  const approvals = (await db.select().from(schema.approvals).where(eq(schema.approvals.tenantId, user.tenantId)))
    .filter(a => a.state === 'waiting')
    .map(a => ({ days: daysBetween(a.requestedAt, at.toISOString()) ?? 0 }));

  const board3 = whereItWaits({
    me,
    carried,
    waitingOnMe: approvals,
    vacancies: managed.filter(r => !r.holder && !r.pencilled).length,
  });

  return [board1, board2, board3];
}

/**
 * The business's own J curve.
 *
 * Roles and criteria carry no created-at of their own, so the picture's date is taken from the
 * earliest thing that could only exist once it was drawn — the first assignment or the first mark.
 * Where nothing dates it, the milestone reports as unrecorded rather than being estimated, because
 * an estimated date on this page would turn a measurement into a brochure.
 */
export async function getCurve(user: CurrentUser): Promise<CurveInput> {
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));

  const periods = (await db.select().from(schema.periods).where(eq(schema.periods.tenantId, user.tenantId)))
    .sort((a, b) => a.period.localeCompare(b.period));
  const locked = periods.filter(p => p.status === 'locked');

  const closedMonths = [];
  for (const p of locked) {
    const rollup = await getTeamRollup(user.tenantId, p.id);
    closedMonths.push({ period: p.period, overall: rollup.scoredCount ? rollup.team.overall : null });
  }

  // The chart: the earliest placement anybody made.
  const assignments = await db.select().from(schema.roleAssignments).orderBy(asc(schema.roleAssignments.fromDate));
  const staff = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  const staffIds = new Set(staff.map(s => s.id));
  const ours = assignments.filter(a => (a.staffId && staffIds.has(a.staffId)) || a.userId);
  const chartDrawnAt = ours.length ? ours[0].fromDate : null;

  // The picture: the first time anything was actually marked against a KPI. Roles and criteria are
  // undated, and a mark is the earliest event that proves the KPIs existed.
  const marks = periods.length
    ? (await db.select().from(schema.assessments)
        .where(inArray(schema.assessments.periodId, periods.map(p => p.id))))
        .sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
    : [];
  const kpisSetAt = marks.length ? marks[0].enteredAt : null;

  const connections = await db.select().from(schema.systemConnections)
    .where(eq(schema.systemConnections.tenantId, user.tenantId));
  const fed = connections.filter(c => c.status === 'live' && c.lastSyncAt)
    .sort((a, b) => (a.lastSyncAt ?? '').localeCompare(b.lastSyncAt ?? ''));
  const firstFeedAt = fed.length ? fed[0].lastSyncAt : null;

  return {
    startDate: tenant?.startDate ?? new Date().toISOString(),
    chartDrawnAt,
    kpisSetAt,
    firstFeedAt,
    firstLockedAt: locked.length ? (locked[0].signedAt ?? locked[0].submittedAt ?? null) : null,
    closedMonths,
    tier: tierOf(tenant?.tier),
  };
}

export { isNull, and };
