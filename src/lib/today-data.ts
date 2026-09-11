/**
 * Everything Today reads, gathered in one place.
 *
 * The page itself does no querying: it asks for this and renders it. That keeps the authorisation
 * in one readable block — the scope is resolved once, at the top, and nothing below it can widen
 * what comes back — and it keeps the page a layout rather than a data layer.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { getScorecard, getRoles, type RoleView, type ScorecardRow } from './queries';
import { currentPeriod } from './period';
import { getScope } from './scope';
import { categoryName, STATUS_LABEL } from './systems';
import { canManage, type CurrentUser } from './auth';
import { roleScore, type RoleScore } from './scoring';
import { whatNeedsMe, changesToKnowAbout, type TodoItem, type ChangeItem } from './today';

/** Monday of the week containing `at`, as YYYY-MM-DD. The week a meeting is logged against. */
export function weekStart(at: Date): string {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // getUTCDay is 0 on Sunday, which belongs to the week that started six days earlier.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface TeamMember {
  roleId: string;
  title: string;
  holder: string | null;
  /** Set when somebody is pencilled into the role but has not been invited — a name, not an account. */
  pencilled: string | null;
  rows: ScorecardRow[];
  score: RoleScore;
}

export interface FeedLine {
  id: string;
  /** The category, which is what SPEC reasons about. The vendor is whatever the client called it. */
  category: string;
  /** The client's own name for the system. Never a name SPEC chose. */
  name: string;
  status: string;
  statusLabel: string;
  lastSyncAt: string | null;
  /** KPIs on this person's card that say they came from this system. */
  feeds: string[];
}

export interface TodayData {
  period: { id: string; period: string; status: string } | null;
  myRole: RoleView | null;
  myRows: ScorecardRow[];
  myScore: RoleScore;
  team: TeamMember[];
  reportsTo: RoleView | null;
  feeds: FeedLine[];
  todos: TodoItem[];
  changes: ChangeItem[];
  meetingLogged: boolean;
  canManage: boolean;
}

export async function getToday(user: CurrentUser): Promise<TodayData> {
  const manage = canManage(user.access);
  // One scope resolution for the whole page. Everything below reads from it, so nothing on Today
  // can reach a role this person is not entitled to see.
  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const roles = scope.roles;

  const myRole = scope.myRoleId ? roles.find(r => r.id === scope.myRoleId) ?? null : null;
  const reportsTo = myRole?.reportsToRoleId ? roles.find(r => r.id === myRole.reportsToRoleId) ?? null : null;

  const empty = roleScore([], []);
  if (!period || !myRole) {
    return {
      period: period ?? null, myRole, myRows: [], myScore: empty, team: [], reportsTo,
      feeds: [], todos: [], changes: [], meetingLogged: false, canManage: manage,
    };
  }

  const mine = await getScorecard(myRole.id, period.id);

  // Direct reports only. The chart beneath them is visible on the org chart and the team rollup;
  // Today is about the people this person actually holds a one-to-one with.
  const directs = roles.filter(r => r.reportsToRoleId === myRole.id && r.level !== 'staff' && scope.canSee(r.id));
  const team: TeamMember[] = [];
  for (const r of directs) {
    const { rows, score } = await getScorecard(r.id, period.id);
    team.push({ roleId: r.id, title: r.title, holder: r.holder?.name ?? null, pencilled: r.pencilled, rows, score });
  }

  const connections = await db.select().from(schema.systemConnections)
    .where(eq(schema.systemConnections.tenantId, user.tenantId));

  const feeds: FeedLine[] = connections.map(c => ({
    id: c.id,
    category: categoryName(c.category),
    name: c.name,
    status: c.status,
    statusLabel: STATUS_LABEL[c.status] ?? c.status,
    lastSyncAt: c.lastSyncAt,
    // A KPI names its source as free text, so match on the client's own name for the system.
    feeds: mine.rows.filter(r => r.source && r.source.toLowerCase().includes(c.name.toLowerCase())).map(r => r.text),
  }));

  const meetings = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'sog');
  const meetingLogged = meetings.some(m => m.date >= weekStart(new Date()));

  const todos = whatNeedsMe({
    myRoleId: myRole.id,
    myRows: mine.rows,
    reports: team.map(t => ({ roleId: t.roleId, title: t.title, holder: t.holder ?? t.pencilled, rows: t.rows, score: t.score })),
    meetingLogged,
    brokenConnections: connections.filter(c => c.status === 'broken').map(c => ({ id: c.id, category: categoryName(c.category) })),
    canManage: manage,
  });

  // A target that was proposed and then agreed differently is a change this person should not have
  // to go looking for.
  const criteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, myRole.id));
  const changes = changesToKnowAbout({
    myRoleId: myRole.id,
    renegotiated: criteria
      .filter(c => c.active && c.proposedTarget && c.target && c.proposedTarget !== c.target)
      .map(c => ({ criterionId: c.id, text: c.text, proposedTarget: c.proposedTarget, target: c.target })),
    vacantReports: directs.filter(r => !r.holder && !r.pencilled).map(r => ({ roleId: r.id, title: r.title })),
    complianceMisses: mine.rows.filter(r => r.pillar === 'compliance' && r.answer === 'N'),
    pendingConnections: connections
      .filter(c => c.status === 'requested' || c.status === 'invited')
      .map(c => ({ id: c.id, category: categoryName(c.category), status: c.status })),
  });

  return {
    period, myRole, myRows: mine.rows, myScore: mine.score, team, reportsTo,
    feeds, todos, changes, meetingLogged, canManage: manage,
  };
}

export { getRoles };
