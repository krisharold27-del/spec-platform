/**
 * Who may see whose scorecard.
 *
 * The rule the business is sold on: a person sees their own SPEC board and everyone below them in
 * the org chart — never above, never sideways. That is enforced here, on the server, and every page
 * or action that touches scorecard data must go through it. Hiding a link in the UI is not access
 * control; the role id is in the URL.
 *
 * Default is deny: a signed-in user with no role assignment sees nothing.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { getRoles, type RoleView } from './queries';
import type { CurrentUser } from './auth';

export interface Scope {
  /** Every role in the tenant — the org chart's structure is not itself a secret. */
  roles: RoleView[];
  /** The role this user currently holds, if any. */
  myRoleId: string | null;
  /** Role ids this user may read scorecard data for: their own plus everything beneath it. */
  visible: Set<string>;
  canSee(roleId: string): boolean;
  canEdit(roleId: string): boolean;
  /**
   * Administration, not management: seats, grants, region/currency/financial year, entities,
   * chart confirmation, the recovery contact. Deliberately separate from canEdit — being an
   * administrator never widens what you can SEE, and scope still limits what you can manage.
   */
  canAdminister: boolean;
  /**
   * May this person draw the chart — move, rename, add and place roles?
   *
   * ── Why this is NOT canEdit ──────────────────────────────────────────────────────────────────
   *
   * Kris, 19 September: *"I still cant change my name in the org chart"*, then *"i should be the
   * admin as i started the system"*. He is right, and both were the same fault.
   *
   * SPEC works out what somebody may touch by walking DOWN from their own role. That is the rule
   * the product is sold on and it is correct — except that it quietly assumes everybody IS on the
   * chart. An administrator who holds no role has nothing to walk down from, so their scope is
   * EMPTY: they cannot change a single card, including the one they should be sitting in, and the
   * only way to fix it is the thing they are locked out of. The founder of the business, on day
   * one, is exactly that person.
   *
   * So: an administrator with no placement may shape the chart. Nothing else widens. `canEdit`
   * still governs scorecards, KPIs and training, because those carry other people's numbers and
   * "I am an administrator" was never meant to be a key to them — that separation is the whole
   * point of keeping this as its own question rather than loosening the one next to it.
   *
   * The moment they place themselves, this collapses back to the ordinary rule.
   */
  canShapeChart(roleId: string): boolean;
}

/**
 * The chart-shaping rule itself, with nothing around it.
 *
 * Pulled out of `getScope` so it can be tested. A permission rule that only exists inside a
 * database call is a permission rule nobody checks, and this one has exactly the shape that goes
 * wrong quietly: three conditions, each of which looks optional until it is removed.
 *
 * `tests/scope.test.ts` takes each clause away in turn.
 */
export function mayShapeChart(
  access: string,
  myRoleId: string | null,
  visible: Set<string>,
  inThisBusiness: (roleId: string) => boolean,
  roleId: string,
): boolean {
  // The ordinary rule: your own role and everything beneath it, if you can write at all.
  if ((access === 'full' || access === 'administrator') && visible.has(roleId)) return true;
  // The founder's case: an administrator with nowhere to walk down from, so they can draw the
  // chart that will place them. Never anybody else, and never a role outside this business.
  return access === 'administrator' && !myRoleId && inThisBusiness(roleId);
}

/**
 * Everything reachable by walking DOWN from a set of starting roles.
 *
 * Pure, and exported so it can be tested. This is the function that decides who can see whose
 * scorecard, which makes it the last place in SPEC that should only exist inside a database call.
 *
 * `seen` doubles as the visited set, so a chart that somehow reports to itself cannot spin here —
 * a cycle is a bug in the data, and the right behaviour is to stop, not to hang the page.
 */
export function reachDown(
  startIds: readonly string[],
  roles: readonly { id: string; reportsToRoleId: string | null }[],
): Set<string> {
  const seen = new Set<string>();
  const known = new Set(roles.map(r => r.id));
  const queue = startIds.filter(id => known.has(id));
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const r of roles) if (r.reportsToRoleId === id) queue.push(r.id);
  }
  return seen;
}

export async function getScope(user: CurrentUser): Promise<Scope> {
  const roles = await getRoles(user.tenantId);

  const assignments = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.userId, user.id), isNull(schema.roleAssignments.toDate)));
  const myRoleId = assignments[0]?.roleId ?? null;

  /*
    ── Where somebody's sight of the business starts ────────────────────────────────────────────

    Their own role, and any branch an administrator has GRANTED them. Kris's rule, 19 September:
    *"managers only have rights to their staff - if rights are needed then the admin must approve
    this"*. The first half is the walk; the second half is this join.

    A grant is read live rather than baked into the account, so taking one back takes effect on the
    next page load rather than whenever somebody next signs in. Revoked grants are excluded here and
    kept in the table, because "who could see the Cobram scorecards in March" is a question a
    business eventually has to answer.
  */
  const grants = await db.select({ roleId: schema.roleGrants.roleId }).from(schema.roleGrants)
    .where(and(
      eq(schema.roleGrants.userId, user.id),
      eq(schema.roleGrants.tenantId, user.tenantId),
      isNull(schema.roleGrants.revokedAt),
    ));

  const starts = [...(myRoleId ? [myRoleId] : []), ...grants.map(g => g.roleId)];
  const visible = reachDown(starts, roles);

  return {
    roles,
    myRoleId,
    visible,
    canSee: (roleId: string) => visible.has(roleId),
    // Read scope plus write permission. Both are required; neither implies the other.
    // An administrator manages within their own scope like anyone else — the level grants
    // administration on top, never sight of, or authority over, anybody outside their chain.
    canEdit: (roleId: string) => (user.access === 'full' || user.access === 'administrator') && visible.has(roleId),
    canAdminister: user.access === 'administrator',
    /*
      Narrow on purpose, and every clause is load-bearing: an ADMINISTRATOR, with NO placement at
      all, and only for a role that really is in THIS business. Somebody who is on the chart gets
      the ordinary rule, so this can never be a way around it.
    */
    canShapeChart: (roleId: string) =>
      mayShapeChart(user.access, myRoleId, visible, id => roles.some(r => r.id === id), roleId),
  };
}

/** Roles this user may see, minus read-only staff rows — the set the team rollup averages over. */
export function scoredRolesInScope(scope: Scope): RoleView[] {
  return scope.roles.filter(r => scope.visible.has(r.id) && r.level !== 'staff');
}

/**
 * Business-wide actions — locking a period, generating the board pack — belong to the top of the
 * chart, not to everyone holding 'full' access. At a 40-person client that is ten people.
 */
export function isTopOfChart(scope: Scope): boolean {
  if (!scope.myRoleId) return false;
  const mine = scope.roles.find(r => r.id === scope.myRoleId);
  if (!mine) return false;
  return mine.level === 'gm' || mine.reportsToRoleId === null;
}

/**
 * Guard for anything only an administrator may do. Throws rather than returning false: these are
 * write paths, and a silent no-op is how a permission bug becomes a data bug.
 */
export function assertAdministrator(scope: Scope): void {
  if (!scope.canAdminister) throw new Error('That action needs an administrator.');
}
