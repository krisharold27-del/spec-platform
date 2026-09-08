/**
 * The staff directory, and the two-stage way a person enters the business.
 *
 * Stage one is a name. Writing down who sits where is how a leader thinks about their business, and
 * it has to be free, silent and reversible — nobody is emailed, nothing is billed, and getting it
 * wrong costs nothing. Stage two is the invite, which is a deliberate, separate act: it creates the
 * account, sends the email, and starts that seat's charge. Holding the email field back until the
 * structure is settled is what stops a leader accidentally telling their whole company about a
 * reporting line they were still thinking about.
 */

export interface StaffRow { id: string; name: string; userId: string | null }
export interface AssignmentRow { roleId: string; staffId: string | null; userId: string | null; toDate: string | null }
export interface RoleRow { id: string; title: string; level: string; reportsTo: string | null }

export type Placement = 'empty' | 'pencilled' | 'invited';

export function placementOf(roleId: string, assignments: AssignmentRow[]): Placement {
  const a = assignments.find(x => x.roleId === roleId && !x.toDate);
  if (!a) return 'empty';
  return a.userId ? 'invited' : 'pencilled';
}

/** Everyone currently pencilled into a role but not yet invited — the queue the invite step works from. */
export function pencilled(assignments: AssignmentRow[], staff: StaffRow[]) {
  return assignments
    .filter(a => !a.toDate && a.staffId && !a.userId)
    .map(a => ({ roleId: a.roleId, person: staff.find(s => s.id === a.staffId)! }))
    .filter(x => x.person);
}

/**
 * Whether the structure looks settled enough to start inviting.
 *
 * Not a lock — a leader can invite whenever they like. It decides whether the email fields are
 * shown by default or kept folded away, which is the difference between a screen that says "fill
 * this in now" and one that says "when you're ready".
 */
export function structureLooksReady(roles: RoleRow[], assignments: AssignmentRow[]): boolean {
  const fillable = roles.filter(r => r.level !== 'gm');
  if (!fillable.length) return false;
  return fillable.every(r => placementOf(r.id, assignments) !== 'empty');
}

/**
 * The same person appearing in a second role is never an accident to be silently accepted — it is
 * one of two quite different business decisions, and only the leader knows which.
 *
 *  move  — the business changed their job. The old role is vacated and goes back on the board as
 *          open, keeping its KPIs for whoever comes next.
 *  merge — the two jobs are now one person's. They keep the old role and take the new one as well,
 *          carrying oversight of both.
 */
export type RoleChange = 'move' | 'merge';

export interface RoleChangePrompt {
  staffId: string;
  personName: string;
  fromRoleId: string;
  fromRoleTitle: string;
  toRoleId: string;
  toRoleTitle: string;
}

export function roleChangeFor(
  staffId: string,
  toRoleId: string,
  roles: RoleRow[],
  assignments: AssignmentRow[],
  staff: StaffRow[],
): RoleChangePrompt | null {
  const existing = assignments.find(a => !a.toDate && a.staffId === staffId && a.roleId !== toRoleId);
  if (!existing) return null;
  const person = staff.find(s => s.id === staffId);
  const from = roles.find(r => r.id === existing.roleId);
  const to = roles.find(r => r.id === toRoleId);
  if (!person || !from || !to) return null;
  return {
    staffId,
    personName: person.name,
    fromRoleId: from.id,
    fromRoleTitle: from.title,
    toRoleId: to.id,
    toRoleTitle: to.title,
  };
}
