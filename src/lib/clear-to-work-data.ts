/**
 * Clear to Work, loaded once for a whole business.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────────
 *
 * The rule lives in `clearToWork` in lib/people and always did. What did not live anywhere was the
 * LOADING of it: the People screen assembled the facts inline, the org chart assembled them again in
 * lib/ioc-data, the crew picker a third time in lib/jobs-data, and the month-ahead scheduler — with
 * no role data to hand — settled for "has an induction date" and said so on screen.
 *
 * Four assemblies of one rule is four chances to disagree, and they did. The schedule would refuse
 * somebody the People screen called clear, and neither screen could say which was right.
 *
 * So the facts are assembled HERE, once, and everything that asks whether a person may be sent to
 * work asks this. Two screens reading one loader cannot disagree.
 *
 * ── What "the facts" are ─────────────────────────────────────────────────────────────────────────
 *
 * Two halves, and both are required — that is the join.
 *
 *   The ROLE half: a compliance measure on their scorecard answered N, a ticket held against their
 *   role that has expired, a module on their role's training path that is overdue.
 *
 *   The PERSON half: the business's own induction mark, and the tickets recorded against them.
 *
 * Before this, each half was read by a different function on a different screen. A person could be
 * clear on one and stopped on the other, which is not a gate — it is two opinions.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { currentPeriod } from './period';
import { getScorecard } from './queries';
import { isScored } from './today-data';
import { blockingReasons } from './obligations';
import { dueDateFor, dueState } from './training';
import { clearToWork, personalReasons, type ClearState, type Personal } from './people';

export interface ClearFacts {
  /** `user:<id>` or `staff:<id>` — the key bookings and timesheets are held against. */
  key: string;
  staffId: string | null;
  userId: string | null;
  name: string;
  roleId: string | null;
  roleTitle: string;
  state: ClearState;
  label: string;
  /** Why, in the business's own words. Empty when they are clear. */
  reason: string;
  /** The role half, itemised. */
  blocking: string[];
  overdue: string[];
  /** The person half, itemised — no induction mark, a ticket run out. */
  stops: string[];
  /**
   * What they currently hold: tickets, inductions and site access that have not expired.
   *
   * The other half of the gate's job. Refusing somebody who is not clear keeps them off site;
   * knowing what they hold is what lets a scheduler tell a mine job from a domestic one instead of
   * treating every available body as interchangeable.
   */
  holds: string[];
}

/**
 * Everybody the business could send to work, and whether it may.
 *
 * Covers the staff list AND the chart, unioned by person key. Both, because they are not the same
 * set: a business pencils names onto the staff list before anybody has a role, and a founder holds a
 * role before anybody puts them on the staff list. Reading either alone would silently lose people —
 * and a scheduler that loses people produces a thin plan that looks like a real one.
 */
export async function clearAcross(
  tenantId: string,
  opts: { roleIds?: string[]; now?: Date } = {},
): Promise<ClearFacts[]> {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const roleRows = await db.select({ id: schema.roles.id, title: schema.roles.title, level: schema.roles.level, isTeam: schema.roles.isTeam })
    .from(schema.roles).where(eq(schema.roles.tenantId, tenantId));
  const roles = opts.roleIds ? roleRows.filter(r => opts.roleIds!.includes(r.id)) : roleRows;
  const roleIds = roles.map(r => r.id);

  const [assignments, criteria, curriculum, modules, obligationRows, staffRows, seatRows, records, period] =
    await Promise.all([
      /*
        Scoped through the tenant's own roles. `role_assignments` carries no tenant column, so a
        bare read of it returns every business's placements — the leak lib/chain-data had, caught by
        tests/tenant-isolation. One query shape, made deliberately, in one place.
      */
      roleIds.length
        ? db.select().from(schema.roleAssignments)
            .where(and(inArray(schema.roleAssignments.roleId, roleIds), isNull(schema.roleAssignments.toDate)))
        : Promise.resolve([] as (typeof schema.roleAssignments.$inferSelect)[]),
      roleIds.length
        ? db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, roleIds))
        : Promise.resolve([] as (typeof schema.criteria.$inferSelect)[]),
      roleIds.length
        ? db.select().from(schema.roleCurriculum).where(inArray(schema.roleCurriculum.roleId, roleIds))
        : Promise.resolve([] as (typeof schema.roleCurriculum.$inferSelect)[]),
      db.select().from(schema.trainingModules).where(eq(schema.trainingModules.tenantId, tenantId)),
      db.select().from(schema.obligations).where(eq(schema.obligations.tenantId, tenantId)),
      db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId)),
      db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId)),
      db.select().from(schema.trainingRecords).where(eq(schema.trainingRecords.tenantId, tenantId)),
      currentPeriod(tenantId),
    ]);

  /*
    Compliance measures answered N, per role. Read once per scored role rather than once per person:
    two people in one role share the role's scorecard, and asking twice is two queries for one
    answer.
  */
  const roleBlocking = new Map<string, string[]>();
  if (period) {
    for (const r of roles) {
      const own = criteria.filter(c => c.roleId === r.id && c.active);
      if (!isScored(r.level, own.length, r.isTeam)) continue;
      const { rows } = await getScorecard(r.id, period.id);
      roleBlocking.set(r.id, rows.filter(x => x.pillar === 'compliance' && x.answer === 'N').map(x => x.text));
    }
  }

  const staffByUser = new Map(staffRows.filter(s => s.userId).map(s => [s.userId!, s]));

  /* Every person the business knows about, keyed the way bookings and timesheets key them. */
  type Who = { key: string; staffId: string | null; userId: string | null; name: string };
  const people = new Map<string, Who>();
  for (const s of staffRows) {
    const key = s.userId ? `user:${s.userId}` : `staff:${s.id}`;
    people.set(key, { key, staffId: s.id, userId: s.userId ?? null, name: s.name });
  }
  for (const a of assignments) {
    const key = a.userId ? `user:${a.userId}` : a.staffId ? `staff:${a.staffId}` : null;
    if (!key || people.has(key)) continue;
    const name = (a.userId ? seatRows.find(u => u.id === a.userId)?.name : undefined)
      ?? (a.staffId ? staffRows.find(s => s.id === a.staffId)?.name : undefined)
      ?? roles.find(r => r.id === a.roleId)?.title
      ?? 'Somebody';
    people.set(key, { key, staffId: a.staffId ?? null, userId: a.userId ?? null, name });
  }

  const out: ClearFacts[] = [];
  for (const who of people.values()) {
    const assignment = assignments.find(a =>
      (who.userId && a.userId === who.userId) || (who.staffId && a.staffId === who.staffId)) ?? null;
    const role = assignment ? roles.find(r => r.id === assignment.roleId) ?? null : null;

    /* Theirs by name, by seat, or by the role they hold — all three are held against this person. */
    const theirs = obligationRows.filter(o =>
      (who.staffId && o.staffId === who.staffId)
      || (who.userId && o.userId === who.userId)
      || (role && o.roleId === role.id));

    const blocking = [
      ...(role ? roleBlocking.get(role.id) ?? [] : []),
      ...blockingReasons(theirs.map(o => ({ what: o.what, expiresAt: o.expiresAt, who: who.name })), now),
    ];

    const done = new Set(records.filter(x => who.userId && x.userId === who.userId && x.progress >= 100).map(x => x.moduleId));
    const overdue = role
      ? curriculum
          .filter(c => c.roleId === role.id)
          .filter(c => dueState(dueDateFor(assignment?.fromDate ?? null, c.dueDays), done.has(c.moduleId), now) === 'overdue')
          .map(c => modules.find(m => m.id === c.moduleId)?.title ?? 'A module')
      : [];

    /*
      The person half. `null` — never an empty shape — where the business has no staff row for them,
      because a seat with nobody on the staff list has no induction recorded ANYWHERE, and an empty
      shape would read as "inducted: no" and accuse somebody the business never entered.
    */
    const staff = who.staffId ? staffRows.find(s => s.id === who.staffId) ?? null
      : who.userId ? staffByUser.get(who.userId) ?? null : null;
    const personal: Personal | null = staff
      ? {
          inductedAt: staff.inductedAt,
          licences: theirs.map(o => ({ what: o.what, expiresAt: o.expiresAt })),
          today,
        }
      : null;

    const ctw = clearToWork({
      roleId: role?.id ?? '',
      roleTitle: role?.title ?? 'No role on the chart',
      name: who.name,
      /* On the staff list is being in the business. The chart says which job, not whether they exist. */
      placement: 'held',
      seated: Boolean(who.userId),
      blocking,
      overdue,
      personal,
    });

    /* The same function the gate itself ran. Not a second reading of the same facts. */
    const stops = personal ? personalReasons(personal) : [];

    out.push({
      key: who.key,
      staffId: who.staffId,
      userId: who.userId,
      name: who.name,
      roleId: role?.id ?? null,
      roleTitle: role?.title ?? 'No role on the chart',
      state: ctw.state,
      label: ctw.label,
      reason: ctw.state === 'blocked' ? [...new Set([...blocking, ...overdue, ...stops])].join('; ')
        : ctw.state === 'unknown' ? ctw.note : '',
      blocking,
      overdue,
      stops,
      holds: theirs.filter(o => !o.expiresAt || o.expiresAt >= today).map(o => o.what),
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}
