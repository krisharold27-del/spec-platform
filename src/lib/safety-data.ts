import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { isTopOfChart, type Scope } from './scope';
import { canSeeReport, likelyState, type Viewer } from './safety';

/**
 * Everything `/safety` reads, for one business, once.
 *
 * Every query names the business. The visibility rule — hazards for everybody, harm to a person up
 * the chart, anonymous wellbeing to the top only — is applied AFTER the business is fixed, and is a
 * different question from which business the rows belong to (the same distinction lib/register-data
 * draws). The rule itself is lib/safety's `canSeeReport`, so the page and the actions cannot
 * disagree about it.
 */

export type ReportRow = typeof schema.safetyReports.$inferSelect;
export type ActionRow = typeof schema.safetyActions.$inferSelect;
export type CheckRow = typeof schema.safetyChecks.$inferSelect;
export type ClaimRow = typeof schema.safetyClaims.$inferSelect;

export interface TicketRow {
  id: string;
  what: string;
  expiresAt: string | null;
  who: string;
  evidence: string | null;
}

export function viewerFor(user: CurrentUser, scope: Scope): Viewer {
  return {
    userId: user.id,
    seesRole: id => scope.canSee(id),
    // An administrator who has not placed themselves yet is the business on day one; nobody else
    // could receive a report routed to the top.
    isTop: isTopOfChart(scope) || (scope.canAdminister && !scope.myRoleId),
  };
}

/**
 * Who a new report goes to, proposed from the chart.
 *
 * Harm and hazards go to the person the reporter reports to. Wellbeing goes to the top of the
 * chart, because "my supervisor is the pressure" is a common enough sentence that routing it to the
 * supervisor would stop it being written.
 */
export function ownerFor(scope: Scope, kind: string): string | null {
  const nameOf = (r: Scope['roles'][number] | undefined) => r?.holder?.name ?? r?.pencilled ?? null;
  const gm = scope.roles.find(r => r.level === 'gm');
  if (kind === 'wellbeing') return nameOf(gm);
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  const above = mine?.reportsToRoleId ? scope.roles.find(r => r.id === mine.reportsToRoleId) : undefined;
  return nameOf(above) ?? nameOf(gm);
}

export async function loadSafety(user: CurrentUser, scope: Scope) {
  const tenantId = user.tenantId;
  const viewer = viewerFor(user, scope);

  const allReports = await db.select().from(schema.safetyReports)
    .where(eq(schema.safetyReports.tenantId, tenantId));
  const reports = allReports.filter(r => canSeeReport(r, viewer));

  const actions = await db.select().from(schema.safetyActions)
    .where(eq(schema.safetyActions.tenantId, tenantId));
  const checks = await db.select().from(schema.safetyChecks)
    .where(eq(schema.safetyChecks.tenantId, tenantId));
  // A claim is about a person's injury, so it is seen by whoever can see the injury it follows.
  const claimRows = await db.select().from(schema.safetyClaims)
    .where(eq(schema.safetyClaims.tenantId, tenantId));
  const seenReports = new Set(reports.map(r => r.id));
  const claims = claimRows.filter(c => viewer.isTop || (c.reportId !== null && seenReports.has(c.reportId)));

  const people = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
    .where(eq(schema.users.tenantId, tenantId));
  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId));
  const nameOfUser = (id: string | null) => (id ? people.find(p => p.id === id)?.name ?? null : null);

  /*
    Licences and tickets, from the same obligations table People keeps — one record, two screens.

    A ticket held by a ROLE is shown when that role is in the viewer's part of the chart. A ticket
    held by a PERSON is shown when that person's role is, or when it is the viewer's own. Somebody on
    the staff list who holds no role yet is shown to managers, who are the people who would book them.
  */
  const obligationRows = await db.select().from(schema.obligations)
    .where(eq(schema.obligations.tenantId, tenantId));
  const assignments = await db.select({
    roleId: schema.roleAssignments.roleId,
    userId: schema.roleAssignments.userId,
    staffId: schema.roleAssignments.staffId,
  }).from(schema.roleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.roleAssignments.roleId))
    .where(and(eq(schema.roles.tenantId, tenantId), isNull(schema.roleAssignments.toDate)));
  const manages = user.access === 'full' || user.access === 'administrator';

  const tickets: TicketRow[] = [];
  for (const o of obligationRows) {
    let who: string;
    let visible: boolean;
    if (o.roleId) {
      visible = scope.canSee(o.roleId);
      who = `The role: ${scope.roles.find(r => r.id === o.roleId)?.title ?? 'a role'}`;
    } else {
      const held = assignments.find(a => (o.userId && a.userId === o.userId) || (o.staffId && a.staffId === o.staffId));
      visible = o.userId === user.id || (held ? scope.canSee(held.roleId) : manages);
      const role = held ? scope.roles.find(r => r.id === held.roleId)?.title : null;
      const name = nameOfUser(o.userId) ?? staffRows.find(s => s.id === o.staffId)?.name ?? 'Somebody';
      who = role ? `${name} · ${role}` : name;
    }
    if (visible) tickets.push({ id: o.id, what: o.what, expiresAt: o.expiresAt, who, evidence: o.evidence });
  }

  /*
    Is a job system connected? Only the CATEGORY is asked — the page names it "your job system",
    never the product, and manual is a complete mode whether one is connected or not.
  */
  const [jobSystem] = await db.select({ id: schema.systemConnections.id }).from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, tenantId),
      eq(schema.systemConnections.category, 'job_management'),
      eq(schema.systemConnections.status, 'live'),
      // A personal mailbox is never the business's job system.
      isNull(schema.systemConnections.personalFor),
    ));

  // The job this person last reported against, so the next report is tagged without asking again.
  const mine = allReports
    .filter(r => r.reportedBy === user.id && r.jobRef)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    viewer,
    reports,
    /** Every injury's date — a count for "days without harm", never the rows themselves. */
    injuryDates: allReports.filter(r => r.kind === 'injury').map(r => ({ createdAt: r.createdAt })),
    actions,
    checks,
    claims,
    tickets,
    people,
    staff: staffRows,
    nameOfUser,
    jobSystemLinked: Boolean(jobSystem),
    lastJobRef: mine[0]?.jobRef ?? null,
    likelyState: likelyState(allReports),
  };
}
