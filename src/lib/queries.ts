/** Read-side queries used by the pages. All scores are computed here from raw assessments — never stored. */
import { eq, and, isNull, desc, inArray } from 'drizzle-orm';
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
  holder: {
    id: string; name: string; email: string; access: string;
    /** An administrator's stated override of this person's seat kind — see lib/chart-seats. */
    seatKindOverride: string | null;
  } | null;
  /**
   * Someone pencilled into the role who has not been invited yet. They have no account and cost
   * nothing, but the chart should still show the business as the leader has drawn it — a role with
   * a name against it is not the same as an empty one.
   */
  pencilled: string | null;
  /**
   * A team node rather than a seat — several people, pooled, one shared scorecard between them.
   * See `roles.isTeam` in db/schema and the team layer in design 15.
   */
  isTeam: boolean;
  /**
   * Everybody currently on the role, with the placement id.
   *
   * On every role, not only on teams. An ordinary role is meant to hold one person and the schema
   * has never enforced it, so a role carrying two open placements is a real state the chart has
   * already been bitten by — `placementShown` exists because of it. Listing them all is how a team
   * is drawn, and on an ordinary role it is how the page can show that something is wrong rather
   * than silently picking one.
   */
  members: { id: string; name: string; hasAccount: boolean }[];
}

/**
 * Which of a role's open placements is the one the chart is showing.
 *
 * ── Why this is a function rather than two lines in two files ────────────────────────────────────
 *
 * Kris, 19 September, on JBI: *"i am the GM but it wont let me change from anthony to my name"*.
 *
 * A role is meant to hold one person, and the schema does not enforce it. A role carrying TWO open
 * placements — an account holder and a pencilled-in name — is drawn from the ACCOUNT HOLDER, which
 * `getRoles` below does in SQL by looking for a user first and falling back to staff. The rename
 * action had the same rule written a second time, badly: it took whichever row the database handed
 * back first. Two placements, two different answers, and the rename landed on the row the card was
 * not reading. Press Save, nothing changes, no error, nothing to do.
 *
 * A database promises nothing about the order of rows without an `order by`, so that code was a
 * coin toss — which is also why the browser check for it could not be made to fail on demand. This
 * is the rule in one place, deterministic, and `tests/placement.test.ts` hands it the rows in both
 * orders. Reverting it to "the first row" fails that test every run.
 */
export const placementShown = <T extends { userId: string | null; staffId: string | null }>(
  open: readonly T[],
): T | null => open.find(a => a.userId) ?? open.find(a => a.staffId) ?? null;

/**
 * The chart: every role, with who holds it and everybody on it.
 *
 * ── The outage this was rewritten for (26 September) ─────────────────────────────────────────────
 *
 * `/my-page`, `/org` and `/people` were all returning 504 FUNCTION_INVOCATION_TIMEOUT in production
 * — eighteen of them, five minutes each. This function is what all three have in common: they call
 * `getScope`, and `getScope` calls this.
 *
 * It ran a loop over every role, and inside the loop FOUR joined queries — of which two were
 * character-for-character the same as the other two. The holder query and `withAccount` are one
 * query; the pencilled query and `pencilledIn` are one query. So a sixty-role chart made two
 * hundred and forty sequential round trips to Postgres, each waiting for the one before, to draw a
 * page — and that was before the scorecards, which added three more per role on top.
 *
 * Nothing here was slow. Every one of those queries is indexed and answers in a millisecond. What
 * killed it was doing hundreds of them in a row, across a network, inside one request that has five
 * minutes to live.
 *
 * This is the failure mode that does not announce itself: it is invisible on a demo business with
 * four roles, and it does not break when the code changes — it breaks when the CHART GETS BIGGER.
 * So it passed every test, worked all week, and stopped working the week JBI's chart filled up.
 *
 * Now: two queries, whatever the size of the chart.
 */
export async function getRoles(tenantId: string): Promise<RoleView[]> {
  const rows = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)))
    .orderBy(schema.roles.sortOrder);
  if (rows.length === 0) return [];
  const roleIds = rows.map(r => r.id);

  /*
    Both halves of every open placement on this business's roles, in one pass each.

    Two queries rather than one outer join, for the reason the old code gave and which still holds:
    the join would need a coalesce, and these read the way `holder` and `pencilled` are thought
    about. What has changed is that they are asked once for the whole chart instead of once per
    role — and asked together, since neither depends on the other.
  */
  const [seated, pencilledRows] = await Promise.all([
    db.select({
      assignmentId: schema.roleAssignments.id,
      roleId: schema.roleAssignments.roleId,
      id: schema.users.id, name: schema.users.name, email: schema.users.email, access: schema.users.access,
      seatKindOverride: schema.users.seatKindOverride,
    })
      .from(schema.roleAssignments)
      .innerJoin(schema.users, eq(schema.users.id, schema.roleAssignments.userId))
      .where(and(inArray(schema.roleAssignments.roleId, roleIds), isNull(schema.roleAssignments.toDate))),
    db.select({
      assignmentId: schema.roleAssignments.id,
      roleId: schema.roleAssignments.roleId,
      name: schema.staff.name,
    })
      .from(schema.roleAssignments)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.roleAssignments.staffId))
      .where(and(inArray(schema.roleAssignments.roleId, roleIds), isNull(schema.roleAssignments.toDate))),
  ]);

  const seatedBy = new Map<string, typeof seated>();
  for (const s of seated) seatedBy.set(s.roleId, [...(seatedBy.get(s.roleId) ?? []), s]);
  const pencilledBy = new Map<string, typeof pencilledRows>();
  for (const p of pencilledRows) pencilledBy.set(p.roleId, [...(pencilledBy.get(p.roleId) ?? []), p]);

  return rows.map(r => {
    const mine = seatedBy.get(r.id) ?? [];
    const theirs = pencilledBy.get(r.id) ?? [];
    const first = mine[0];
    return {
      id: r.id, title: r.title, stream: r.stream, level: r.level,
      reportsToRoleId: r.reportsToRoleId,
      holder: first
        ? {
            id: first.id, name: first.name, email: first.email, access: first.access,
            seatKindOverride: first.seatKindOverride,
          }
        : null,
      /* A pencilled name only shows where nobody holds the seat — the rule this always had. */
      pencilled: first ? null : theirs[0]?.name ?? null,
      isTeam: r.isTeam,
      /*
        Everybody on the role, not just the one the card shows. A team holds several and the chart
        has to draw all of them; an ordinary role is meant to hold one, and `placementShown` exists
        precisely because the schema does not enforce that.
      */
      members: [
        ...mine.map(m => ({ id: m.assignmentId, name: m.name, hasAccount: true })),
        ...theirs.map(m => ({ id: m.assignmentId, name: m.name, hasAccount: false })),
      ],
    };
  });
}

export interface ScorecardRow {
  criterionId: string; pillar: Pillar; text: string; weight: number; kpi: boolean; target: string | null;
  /**
   * What SPEC opened with, before anybody agreed it. Carried beside `target` rather than folded
   * into it: a number the business has not agreed must never read as one it signed up to.
   */
  proposedTarget: string | null;
  answer: Answer; note: string | null;
  /** The label the business uses — see lib/status. `answer` remains the scoring value. */
  status: string | null;
  /** The actual value as reported: "$827,172 (94.0%)", "40.24%", "16 invoices over 90 days". */
  result: string | null;
  /** Where the number came from: a connected system, or a person. */
  source: string | null;
}

export type Scorecard = { rows: ScorecardRow[]; score: RoleScore };

/**
 * Every role's scorecard for a month, in three queries rather than three PER ROLE.
 *
 * ── The outage this was written for (26 September) ───────────────────────────────────────────────
 *
 * `/org` and `/people` were timing out in production — eighteen `Vercel Runtime Timeout Error: Task
 * timed out after 300 seconds`, with Postgres also reporting `canceling statement due to statement
 * timeout`. Kris could not open either page.
 *
 * The cause was not a slow query. Every query here is indexed and answers in milliseconds:
 * `criteria_role_pillar` covers the criteria read and `assessments_unique` covers the answers. The
 * cause was HOW MANY of them, and that each waited for the last. `getScorecard` makes three round
 * trips, and both screens called it inside a loop over every role on the chart — so a business with
 * sixty roles made a hundred and eighty sequential round trips to draw one page, holding a
 * connection the whole way.
 *
 * That shape looks perfect on a demo business with four roles and falls over on a real one, which
 * is exactly what happened: it worked all week and stopped working the week the chart got big. It
 * degrades rather than breaks, so nothing caught it until it hit the ceiling.
 *
 * So the loop moved into the database. Three queries, whatever the size of the chart.
 */
export async function scorecardsFor(
  roleIds: readonly string[],
  periodId: string,
): Promise<Map<string, Scorecard>> {
  const out = new Map<string, Scorecard>();
  if (roleIds.length === 0) return out;

  /* Issued together rather than in sequence — none of the three depends on another. */
  const [crit, ans, periodRow] = await Promise.all([
    db.select().from(schema.criteria)
      .where(and(inArray(schema.criteria.roleId, [...roleIds]), eq(schema.criteria.active, true)))
      .orderBy(schema.criteria.sortOrder),
    db.select().from(schema.assessments)
      .where(and(inArray(schema.assessments.roleId, [...roleIds]), eq(schema.assessments.periodId, periodId))),
    db.select({ status: schema.periods.status }).from(schema.periods).where(eq(schema.periods.id, periodId)),
  ]);

  // A locked month keeps the answers it was locked with — nothing recalculates history (Watch was
  // stored as N before BUILD_SPEC §3.1 made it NA). An open month scores from the status itself.
  const locked = periodRow[0]?.status === 'locked';
  const answerOf = (a: (typeof ans)[number] | undefined): Answer =>
    !a ? '' : !locked && a.status ? answerFor(a.status) : (a.answer as Answer);

  const byId = new Map(ans.map(a => [a.criterionId, a]));
  const critByRole = new Map<string, typeof crit>();
  for (const c of crit) critByRole.set(c.roleId, [...(critByRole.get(c.roleId) ?? []), c]);

  /*
    Every role asked for gets an entry, including one with no criteria at all. A missing key and an
    empty scorecard are different things to a caller, and returning nothing for an unscored role is
    how a screen decides somebody is fine because it could not find them.
  */
  for (const roleId of roleIds) {
    const mine = critByRole.get(roleId) ?? [];
    const rows: ScorecardRow[] = mine.map(c => ({
      criterionId: c.id, pillar: c.pillar as Pillar, text: c.text, weight: c.weight, kpi: c.kpi, target: c.target,
      proposedTarget: c.proposedTarget,
      answer: answerOf(byId.get(c.id)), note: byId.get(c.id)?.note ?? null,
      status: byId.get(c.id)?.status ?? null,
      result: byId.get(c.id)?.result ?? null,
      source: byId.get(c.id)?.source ?? null,
    }));
    out.set(roleId, {
      rows,
      score: roleScore(
        mine.map(c => ({ id: c.id, pillar: c.pillar as Pillar, text: c.text, weight: c.weight })),
        rows.map(r => ({ criterionId: r.criterionId, answer: r.answer })),
      ),
    });
  }
  return out;
}

/** One role's scorecard — a wrapper on the batch, so there is one copy of the rules. */
export async function getScorecard(roleId: string, periodId: string): Promise<Scorecard> {
  const all = await scorecardsFor([roleId], periodId);
  return all.get(roleId) ?? { rows: [], score: roleScore([], []) };
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
