/**
 * Everything Today reads, gathered in one place.
 *
 * The page itself does no querying: it asks for this and renders it. That keeps the authorisation
 * in one readable block — the scope is resolved once, at the top, and nothing below it can widen
 * what comes back — and it keeps the page a layout rather than a data layer.
 */
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  pathFor, pathProgress, signoffFor, aceSteps, monthsAtStandard, holdsAce,
  type AceStep, type PathLine, type PathProgress, type Signoff, type TrainingModule,
} from './training';
import { getScorecard, getRoles, type RoleView, type ScorecardRow } from './queries';
import { currentPeriod } from './period';
import { getScope } from './scope';
import { categoryName, STATUS_LABEL } from './systems';
import { canManage, type CurrentUser } from './auth';
import { tierOf, type Tier } from './plan';
import { roleScore, PILLARS, type RoleScore } from './scoring';
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
  /** False for a checklist role: no individual scorecard, so no lights and no Ace. */
  scored: boolean;
}

/**
 * Does this role carry an individual KPI scorecard?
 *
 * A checklist role — an apprentice, most people on the tools — is measured through the role above
 * it. It is not behind, and it is never shown as though it were: no lights, no Ace, no score.
 */
export const isScored = (level: string, criteriaCount: number): boolean =>
  level !== 'staff' && criteriaCount > 0;

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

export interface TrainingView {
  path: PathLine[];
  progress: PathProgress;
  signoff: Signoff;
}

export interface AceView {
  steps: AceStep[];
  holds: boolean;
  /** The closed months behind the run, oldest first, for the Jul ✓ / Aug ✓ / Sep — strip. */
  run: { period: string; held: boolean }[];
  months: number;
  required: number;
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
  training: TrainingView;
  ace: AceView;
  /** basic or advanced: whether this business has connectors and the assistant at all. */
  tier: Tier;
  /**
   * Whether this role carries an individual KPI scorecard. A checklist role is not behind — it is
   * simply not scored, and the page says so rather than drawing four empty lights.
   */
  scored: boolean;
  canManage: boolean;
}

/** Every pillar that has a score sits at or above the standard, and at least one of them does. */
const heldTheStandard = (score: RoleScore, threshold = 0.9): boolean => {
  const scored = PILLARS.map(p => score.pillars[p]).filter((v): v is number => v !== null);
  return scored.length === PILLARS.length && scored.every(v => v >= threshold);
};

/**
 * The Ace run: the closed months behind this role, oldest first, and how many in a row held every
 * pillar at the standard. Only closed months count — an open month is not a result yet.
 */
async function aceFor(
  tenantId: string,
  roleId: string,
  training: TrainingView,
  scored: boolean,
): Promise<AceView> {
  const required = 3;
  if (!scored) {
    return { steps: aceSteps(training.progress, training.signoff, 0, required, false), holds: false, run: [], months: 0, required };
  }

  const closed = (await db.select().from(schema.periods).where(eq(schema.periods.tenantId, tenantId)))
    .filter(p => p.status === 'locked')
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-required);

  const run: { period: string; held: boolean }[] = [];
  for (const p of closed) {
    const { score } = await getScorecard(roleId, p.id);
    run.push({ period: p.period, held: heldTheStandard(score) });
  }

  const months = monthsAtStandard(run.map(m => ({ allPillarsAtStandard: m.held })));
  const steps = aceSteps(training.progress, training.signoff, months, required, true);
  return { steps, holds: holdsAce(steps), run, months, required };
}

const NO_TRAINING: TrainingView = {
  path: [],
  progress: { total: 0, complete: 0, pct: null, pathComplete: false, overdue: 0 },
  signoff: { state: 'no_path', label: 'No path set', note: 'Nothing is assigned to this role yet.', trainedAt: null, trainedBy: null },
};

const NO_ACE: AceView = { steps: [], holds: false, run: [], months: 0, required: 3 };

/**
 * The training path for the role this person holds, and how far through it they are.
 *
 * The path is the role's, the progress is the person's, and the sign-off sits on the placement —
 * so somebody moving to a new job inherits that job's path and starts its sign-off fresh.
 */
async function trainingFor(
  tenantId: string,
  roleId: string,
  userId: string,
  managerTitle: string | null,
): Promise<TrainingView> {
  const curriculum = await db.select().from(schema.roleCurriculum)
    .where(eq(schema.roleCurriculum.roleId, roleId))
    .orderBy(schema.roleCurriculum.sortOrder);
  if (!curriculum.length) return NO_TRAINING;

  const moduleRows = await db.select().from(schema.trainingModules)
    .where(and(
      eq(schema.trainingModules.tenantId, tenantId),
      inArray(schema.trainingModules.id, curriculum.map(c => c.moduleId)),
    ));
  const modules: TrainingModule[] = moduleRows
    .filter(m => m.active)
    .map(m => ({ id: m.id, title: m.title, summary: m.summary, pillar: m.pillar as TrainingModule['pillar'], minutes: m.minutes, core: m.core }));

  const records = await db.select().from(schema.trainingRecords)
    .where(and(eq(schema.trainingRecords.tenantId, tenantId), eq(schema.trainingRecords.userId, userId)));

  const [assignment] = await db.select().from(schema.roleAssignments)
    .where(and(
      eq(schema.roleAssignments.roleId, roleId),
      eq(schema.roleAssignments.userId, userId),
      isNull(schema.roleAssignments.toDate),
    ));

  const path = pathFor(
    curriculum.map(c => ({ moduleId: c.moduleId, dueDays: c.dueDays, sortOrder: c.sortOrder })),
    modules,
    records.map(r => ({ moduleId: r.moduleId, progress: r.progress, resultPct: r.resultPct, completedAt: r.completedAt })),
    assignment?.fromDate ?? null,
  );
  const progress = pathProgress(path);
  return {
    path,
    progress,
    signoff: signoffFor(progress, { trainedAt: assignment?.trainedAt ?? null, trainedBy: assignment?.trainedBy ?? null }, managerTitle),
  };
}

export async function getToday(user: CurrentUser): Promise<TodayData> {
  const manage = canManage(user.access);
  // One scope resolution for the whole page. Everything below reads from it, so nothing on Today
  // can reach a role this person is not entitled to see.
  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const roles = scope.roles;
  const [tenant] = await db.select({ tier: schema.tenants.tier }).from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const tier = tierOf(tenant?.tier);

  const myRole = scope.myRoleId ? roles.find(r => r.id === scope.myRoleId) ?? null : null;
  const reportsTo = myRole?.reportsToRoleId ? roles.find(r => r.id === myRole.reportsToRoleId) ?? null : null;

  const empty = roleScore([], []);
  if (!period || !myRole) {
    return {
      period: period ?? null, myRole, myRows: [], myScore: empty, team: [], reportsTo,
      feeds: [], todos: [], changes: [], meetingLogged: false, training: NO_TRAINING,
      ace: NO_ACE, tier, scored: false, canManage: manage,
    };
  }

  const mine = await getScorecard(myRole.id, period.id);

  // Direct reports only. The chart beneath them is visible on the org chart and the team rollup;
  // Today is about the people this person actually holds a one-to-one with.
  //
  // Checklist roles are included: a supervisor's crew is mostly apprentices and tradespeople, and
  // leaving them off would be drawing somebody a team they do not have. They carry no lights,
  // because they carry no scorecard — which the row says rather than showing four empty dots.
  const directs = roles.filter(r => r.reportsToRoleId === myRole.id && scope.canSee(r.id));
  const team: TeamMember[] = [];
  for (const r of directs) {
    const { rows, score } = await getScorecard(r.id, period.id);
    team.push({
      roleId: r.id, title: r.title, holder: r.holder?.name ?? null, pencilled: r.pencilled,
      rows, score, scored: isScored(r.level, rows.length),
    });
  }

  // Feeds are the business's systems. A person's mailbox has its own block and is not a feed.
  const connections = await db.select().from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));

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

  const training = await trainingFor(user.tenantId, myRole.id, user.id, reportsTo?.title ?? null);

  const todos = whatNeedsMe({
    myRoleId: myRole.id,
    myRows: mine.rows,
    reports: team.map(t => ({ roleId: t.roleId, title: t.title, holder: t.holder ?? t.pencilled, rows: t.rows, score: t.score })),
    meetingLogged,
    brokenConnections: connections.filter(c => c.status === 'broken').map(c => ({ id: c.id, category: categoryName(c.category) })),
    overdueTraining: training.path
      .filter(m => m.due === 'overdue')
      .map(m => ({ moduleId: m.moduleId, title: m.title, minutes: m.minutes })),
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

  const scored = isScored(myRole.level, mine.rows.length);
  const ace = await aceFor(user.tenantId, myRole.id, training, scored);

  return {
    period, myRole, myRows: mine.rows, myScore: mine.score, team, reportsTo,
    feeds, todos, changes, meetingLogged, training, ace, tier, scored, canManage: manage,
  };
}

export { getRoles };
