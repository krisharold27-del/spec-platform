/**
 * Everything the weekly meeting reads. Scope is resolved once, as it is on Today.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { getScorecard, getGates } from './queries';
import { currentPeriod } from './period';
import { getScope } from './scope';
import { canManage, type CurrentUser } from './auth';
import { dueState, dueDateFor } from './training';
import { isScored } from './today-data';
import type { RoleScore } from './scoring';
import {
  agendaFor, belowTheCut, carriedActions, history, mondayOf, recentMondays, readOnTheWeek,
  actionsOf, decisionsOf, attendeesOf,
  type AgendaItem, type Action, type Decision, type HistoryWeek, type MeetingRole,
} from './meeting';

export interface MeetingData {
  weekOf: string;
  period: { id: string; period: string } | null;
  /** This week's meeting row, once anything has been written against it. */
  logged: boolean;
  agenda: AgendaItem[];
  /** Items that did not fit the three. Counted, never silently dropped. */
  more: number;
  carried: (Action & { from: string; weeks: number })[];
  actions: Action[];
  decisions: Decision[];
  attendees: string[];
  /** Everyone who could be in the room: this person and the roles reporting to them. */
  roster: { roleId: string; title: string; person: string | null }[];
  team: MeetingRole[];
  teamScore: RoleScore | null;
  read: { kicker: string; body: string }[];
  history: HistoryWeek[];
  canManage: boolean;
}

export async function getMeeting(user: CurrentUser, at: Date = new Date()): Promise<MeetingData> {
  const manage = canManage(user.access);
  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const weekOf = mondayOf(at.toISOString());

  const meetings = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog')
    .sort((a, b) => a.date.localeCompare(b.date));
  const thisWeek = meetings.find(m => mondayOf(m.date) === weekOf) ?? null;
  const previous = meetings.filter(m => mondayOf(m.date) < weekOf);

  const empty: MeetingData = {
    weekOf, period: null, logged: false, agenda: [], more: 0,
    carried: carriedActions(previous),
    actions: thisWeek ? actionsOf(thisWeek) : [],
    decisions: thisWeek ? decisionsOf(thisWeek) : [],
    attendees: thisWeek ? attendeesOf(thisWeek) : [],
    roster: [], team: [], teamScore: null, read: [],
    history: history(meetings, recentMondays(at, 5)).reverse(),
    canManage: manage,
  };
  if (!period || !scope.myRoleId) return empty;

  // This person's own role and the roles reporting to it — the membership of the meeting.
  const mine = scope.roles.find(r => r.id === scope.myRoleId)!;
  const directs = scope.roles.filter(r => r.reportsToRoleId === mine.id && scope.canSee(r.id));

  // The previous closed month, for "it moved down".
  const allPeriods = (await db.select().from(schema.periods).where(eq(schema.periods.tenantId, user.tenantId)))
    .sort((a, b) => a.period.localeCompare(b.period));
  const lastClosed = [...allPeriods].reverse().find(p => p.status === 'locked' && p.id !== period.id) ?? null;

  const team: MeetingRole[] = [];
  for (const r of [mine, ...directs]) {
    const { rows, score } = await getScorecard(r.id, period.id);
    const previousScore = lastClosed ? (await getScorecard(r.id, lastClosed.id)).score : null;
    team.push({
      roleId: r.id, title: r.title, holder: r.holder?.name ?? r.pencilled ?? null,
      score, previous: previousScore, rows, scored: isScored(r.level, rows.length),
    });
  }

  const gates = await getGates(period.id);
  const failingGates = [
    gates.zeroHarm && !gates.zeroHarm.pass ? { gate: 'zero_harm', reason: gates.zeroHarm.reason } : null,
    gates.clearToWork && !gates.clearToWork.pass ? { gate: 'clear_to_work', reason: gates.clearToWork.reason } : null,
  ].filter((g): g is { gate: string; reason: string | null } => g !== null);

  const inputs = {
    roles: team,
    vacancies: directs.filter(r => !r.holder && !r.pencilled).map(r => ({ roleId: r.id, title: r.title })),
    overdueTraining: await overdueTrainingFor(user.tenantId, [mine, ...directs].map(r => r.id), at),
    failingGates,
  };

  const agenda = agendaFor(inputs);
  const all = agendaFor({ ...inputs, limit: 99 });

  // The roll-up the read is written against: the scored roles reporting in, this person included.
  const scored = team.filter(t => t.scored && t.score.overall !== null);
  const teamScore: RoleScore | null = scored.length
    ? {
        pillars: {
          safety: meanOf(scored.map(s => s.score.pillars.safety)),
          people: meanOf(scored.map(s => s.score.pillars.people)),
          earnings: meanOf(scored.map(s => s.score.pillars.earnings)),
          compliance: meanOf(scored.map(s => s.score.pillars.compliance)),
        },
        overall: meanOf(scored.map(s => s.score.overall)),
      }
    : null;

  return {
    ...empty,
    period: { id: period.id, period: period.period },
    logged: !!thisWeek,
    agenda,
    more: belowTheCut(all, agenda),
    roster: [mine, ...directs].map(r => ({ roleId: r.id, title: r.title, person: r.holder?.name ?? r.pencilled ?? null })),
    team,
    teamScore,
    read: readOnTheWeek(inputs, teamScore),
  };
}

const meanOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

/** Overdue modules across these roles, resolved to the person holding each one. */
async function overdueTrainingFor(tenantId: string, roleIds: string[], at: Date) {
  if (!roleIds.length) return [];
  const curriculum = await db.select().from(schema.roleCurriculum)
    .where(inArray(schema.roleCurriculum.roleId, roleIds));
  if (!curriculum.length) return [];

  const modules = await db.select().from(schema.trainingModules)
    .where(and(eq(schema.trainingModules.tenantId, tenantId), inArray(schema.trainingModules.id, curriculum.map(c => c.moduleId))));
  const titleOf = new Map(modules.filter(m => m.active).map(m => [m.id, m.title]));

  const assignments = await db.select().from(schema.roleAssignments)
    .where(and(inArray(schema.roleAssignments.roleId, roleIds), isNull(schema.roleAssignments.toDate)));
  const users = assignments.map(a => a.userId).filter((id): id is string => !!id);
  const records = users.length
    ? await db.select().from(schema.trainingRecords)
        .where(and(eq(schema.trainingRecords.tenantId, tenantId), inArray(schema.trainingRecords.userId, users)))
    : [];
  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId));
  const userRows = await db.select().from(schema.users).where(eq(schema.users.tenantId, tenantId));

  const out: { person: string; title: string }[] = [];
  for (const a of assignments) {
    const person = a.userId
      ? userRows.find(u => u.id === a.userId)?.name
      : staffRows.find(s => s.id === a.staffId)?.name;
    if (!person) continue;
    for (const c of curriculum.filter(c => c.roleId === a.roleId)) {
      const title = titleOf.get(c.moduleId);
      if (!title) continue;
      const record = records.find(r => r.userId === a.userId && r.moduleId === c.moduleId);
      const complete = (record?.progress ?? 0) >= 100;
      if (dueState(dueDateFor(a.fromDate, c.dueDays), complete, at) === 'overdue') out.push({ person, title });
    }
  }
  return out;
}
