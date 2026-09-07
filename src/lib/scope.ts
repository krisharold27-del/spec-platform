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
}

export async function getScope(user: CurrentUser): Promise<Scope> {
  const roles = await getRoles(user.tenantId);

  const assignments = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.userId, user.id), isNull(schema.roleAssignments.toDate)));
  const myRoleId = assignments[0]?.roleId ?? null;

  const visible = new Set<string>();
  if (myRoleId && roles.some(r => r.id === myRoleId)) {
    // Walk down the reporting tree. `visible` doubles as the seen-set so a bad
    // reportsTo cycle can never spin here.
    const queue: string[] = [myRoleId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visible.has(id)) continue;
      visible.add(id);
      for (const r of roles) if (r.reportsToRoleId === id) queue.push(r.id);
    }
  }

  return {
    roles,
    myRoleId,
    visible,
    canSee: (roleId: string) => visible.has(roleId),
    // Read scope plus write permission. Both are required; neither implies the other.
    canEdit: (roleId: string) => user.access === 'full' && visible.has(roleId),
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
