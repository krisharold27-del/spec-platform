import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { CurrentUser } from './auth';
import { getScope, type Scope } from './scope';
import { crewFor } from './jobs-data';
import { buildDirectory, type DirPerson } from './directory';
export { mayEditContact } from './directory';

/**
 * The staff list, read for one viewer. Every decision is in lib/directory; this only fetches.
 *
 * Clear to Work comes from `crewFor` — the very function the schedule refuses a booking with — so
 * the list shows exactly what the schedule would do, for exactly the people the viewer may see.
 */
export async function loadDirectory(user: CurrentUser): Promise<{ people: DirPerson[]; scope: Scope; selfKey: string }> {
  const scope = await getScope(user);
  const roleIds = scope.roles.map(r => r.id);
  const [assignments, staff, users, obligations, crew] = await Promise.all([
    roleIds.length
      ? db.select().from(schema.roleAssignments).where(inArray(schema.roleAssignments.roleId, roleIds))
      : Promise.resolve([]),
    db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId)),
    db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId)),
    db.select().from(schema.obligations).where(eq(schema.obligations.tenantId, user.tenantId)),
    crewFor(user),
  ]);
  const selfKey = `user:${user.id}`;
  const people = buildDirectory({
    roles: scope.roles,
    assignments,
    staff,
    users,
    obligations,
    clearByKey: new Map(crew.map(c => [c.key, { clear: c.clear, label: c.label, reason: c.reason }])),
    canSee: id => scope.canSee(id),
    selfKey,
    ownRoleId: scope.myRoleId,
    now: new Date(),
  });
  return { people, scope, selfKey };
}

/** One person by key, as this viewer sees them — or null when the key is not this business's. */
export async function directoryPerson(user: CurrentUser, key: string) {
  const { people, scope, selfKey } = await loadDirectory(user);
  const p = people.find(x => x.key === key) ?? null;
  return { person: p, scope, selfKey };
}

/** The staff row a user was invited from, if they had one — where a pencilled name's details were kept. */
export async function staffOfUser(tenantId: string, userId: string) {
  const [row] = await db.select().from(schema.staff)
    .where(and(eq(schema.staff.tenantId, tenantId), eq(schema.staff.userId, userId)));
  return row ?? null;
}
