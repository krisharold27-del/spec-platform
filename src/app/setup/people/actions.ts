'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { sendInviteEmail } from '@/lib/email';
import { roleChangeFor, type AssignmentRow, type RoleRow, type StaffRow } from '@/lib/staff';

const now = () => new Date().toISOString();

async function requireLeader() {
  const user = await getCurrentUser();
  if (!user || user.access !== 'full') redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

async function chartFor(tenantId: string) {
  const roles = await db.select().from(schema.roles).where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roles.active, true)));
  const staff = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, tenantId));
  const assignments = await db.select().from(schema.roleAssignments);
  const roleIds = new Set(roles.map(r => r.id));
  return {
    roles: roles as unknown as RoleRow[],
    staff: staff as unknown as StaffRow[],
    assignments: assignments.filter(a => roleIds.has(a.roleId)) as unknown as AssignmentRow[],
  };
}

function done(paths = ['/setup/business', '/org', '/journey']) {
  for (const p of paths) revalidatePath(p);
}

/**
 * Write a name straight onto a role — the one action the org chart page needs.
 *
 * Adding to the directory and then placing from a dropdown is two steps for what is one thought:
 * "Anthony runs operations." This does both, and reuses an existing directory entry when the name
 * already exists so the same person in two roles still raises the move-or-merge question.
 */
export async function nameRole(formData: FormData) {
  const user = await requireLeader();
  const roleId = String(formData.get('roleId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!roleId || !name) redirect('/setup/business');

  const chart = await chartFor(user.tenantId);
  if (!chart.roles.some(r => r.id === roleId)) redirect('/setup/business');

  const existing = chart.staff.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const change = roleChangeFor(existing.id, roleId, chart.roles, chart.assignments, chart.staff);
    if (change) redirect(`/setup/business?change=${existing.id}&to=${roleId}`);
    await openAssignment(roleId, existing.id);
  } else {
    const staffId = randomUUID();
    await db.insert(schema.staff).values({ id: staffId, tenantId: user.tenantId, name, userId: null, createdAt: now() });
    await openAssignment(roleId, staffId);
  }
  done();
  redirect('/setup/business');
}

/** Add a name to the directory. No email, no account, no charge — just a name on the chart. */
export async function addStaff(formData: FormData) {
  const user = await requireLeader();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) redirect('/setup/business?error=name');
  await db.insert(schema.staff).values({ id: randomUUID(), tenantId: user.tenantId, name, userId: null, createdAt: now() });
  done();
  redirect('/setup/business');
}

/**
 * Pencil someone into a role.
 *
 * If they already hold another role this does nothing yet — it hands back a prompt asking whether
 * this is a move or a merge, because guessing would either strand a role the business still needs
 * or quietly take one away from someone.
 */
export async function placeStaff(formData: FormData) {
  const user = await requireLeader();
  const staffId = String(formData.get('staffId') ?? '');
  const roleId = String(formData.get('roleId') ?? '');
  if (!staffId || !roleId) redirect('/setup/business');

  const chart = await chartFor(user.tenantId);
  if (!chart.staff.some(s => s.id === staffId) || !chart.roles.some(r => r.id === roleId)) redirect('/setup/business');

  const change = roleChangeFor(staffId, roleId, chart.roles, chart.assignments, chart.staff);
  if (change) redirect(`/setup/business?change=${staffId}&to=${roleId}`);

  await openAssignment(roleId, staffId);
  done();
  redirect('/setup/business');
}

/** The leader's answer to the move-or-merge question. */
export async function resolveRoleChange(formData: FormData) {
  const user = await requireLeader();
  const staffId = String(formData.get('staffId') ?? '');
  const toRoleId = String(formData.get('toRoleId') ?? '');
  const fromRoleId = String(formData.get('fromRoleId') ?? '');
  const decision = String(formData.get('decision') ?? '');

  const chart = await chartFor(user.tenantId);
  if (!chart.staff.some(s => s.id === staffId)) redirect('/setup/business');

  if (decision === 'move') {
    // The old role is vacated and goes back on the board as open, keeping its KPIs for whoever is next.
    await db.update(schema.roleAssignments).set({ toDate: now() })
      .where(and(eq(schema.roleAssignments.roleId, fromRoleId), isNull(schema.roleAssignments.toDate)));
  }
  // On a merge the existing assignment is simply left open — they hold both.
  await openAssignment(toRoleId, staffId);
  done();
  redirect('/setup/business');
}

/** Close whoever is on this role and open a new assignment. History is kept, never overwritten. */
async function openAssignment(roleId: string, staffId: string) {
  await db.update(schema.roleAssignments).set({ toDate: now() })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  await db.insert(schema.roleAssignments).values({ id: randomUUID(), roleId, staffId, userId: null, fromDate: now() });
}

/** Take someone off a role. They stay in the directory — removing a name is not a decision to lose it. */
export async function unplaceStaff(formData: FormData) {
  const user = await requireLeader();
  const roleId = String(formData.get('roleId') ?? '');
  const chart = await chartFor(user.tenantId);
  if (!chart.roles.some(r => r.id === roleId)) redirect('/setup/business');
  await db.update(schema.roleAssignments).set({ toDate: now() })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  done();
  redirect('/setup/business');
}

/**
 * The invite — the only action here that emails anyone or costs anything.
 *
 * Everything above this point is free and private to the leader. This creates the account, sends
 * the login link, and starts that seat's monthly charge, so it is a separate button with the price
 * written next to it rather than a side effect of typing a name.
 */
export async function invite(formData: FormData) {
  const user = await requireLeader();
  const staffId = String(formData.get('staffId') ?? '');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!staffId || !email) redirect('/setup/business?error=email');

  const chart = await chartFor(user.tenantId);
  const person = chart.staff.find(s => s.id === staffId);
  const assignment = chart.assignments.find(a => !a.toDate && a.staffId === staffId);
  if (!person || !assignment) redirect('/setup/business');
  if (person.userId) redirect('/setup/business');   // already has an account; nothing to do

  const role = chart.roles.find(r => r.id === assignment.roleId)!;
  const roleRow = (await db.select().from(schema.roles).where(eq(schema.roles.id, role.id)))[0]!;

  // Reuse an existing account for this email rather than creating a second one for the same person.
  const existing = (await db.select().from(schema.users)
    .where(and(eq(schema.users.tenantId, user.tenantId), eq(schema.users.email, email))))[0];

  const userId = existing?.id ?? randomUUID();
  if (!existing) {
    await db.insert(schema.users).values({
      id: userId, tenantId: user.tenantId, email, name: person.name,
      access: roleRow.defaultAccess, authUserId: null, invitedAt: now(), acceptedAt: null,
    });
  } else if (!existing.invitedAt) {
    await db.update(schema.users).set({ invitedAt: now() }).where(eq(schema.users.id, userId));
  }

  await db.update(schema.staff).set({ userId }).where(eq(schema.staff.id, staffId));

  // Every open assignment for this person becomes a live one — a merged role holder is invited once.
  await db.update(schema.roleAssignments).set({ userId })
    .where(and(eq(schema.roleAssignments.staffId, staffId), isNull(schema.roleAssignments.toDate)));

  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0];
  if (tenant && !existing?.invitedAt) {
    await sendInviteEmail({ to: email, name: person.name, businessName: tenant.name, roleTitle: roleRow.title });
  }

  done(['/setup/business', '/org', '/journey', '/team']);
  redirect('/setup/business?invited=1');
}
