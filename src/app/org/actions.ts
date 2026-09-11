'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { getRoles } from '@/lib/queries';
import { installTraining } from '@/lib/provision';
import { canMove, parseRoles, parseCsv, resolveImport, type ChartRole } from '@/lib/orgchart';

/**
 * Changing the shape of the business.
 *
 * Roles report to roles: moving a role takes everybody under it, and moving a PERSON leaves the
 * role exactly as it was. Those are two different actions on this page and two different actions
 * here, because conflating them is how a business loses a job description.
 */

async function editor() {
  const user = await getCurrentUser();
  if (!user || !canManage(user.access)) redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

/** The chart as the move rules need to see it. Titles and links only — no scores. */
async function chartOf(tenantId: string): Promise<ChartRole[]> {
  const roles = await getRoles(tenantId);
  return roles.map(r => ({
    id: r.id, title: r.title, person: r.holder?.name ?? r.pencilled ?? null,
    pencilled: !r.holder && !!r.pencilled, parentId: r.reportsToRoleId,
    level: r.level, stream: r.stream, pillars: null, scored: r.level !== 'staff', hasKpis: true,
  }));
}

/** Drag a card onto another: the role, and everybody under it, now reports there. */
export async function moveRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const ontoId = String(formData.get('ontoId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) throw new Error('That role is outside your part of the chart.');

  const chart = await chartOf(user.tenantId);
  const check = canMove(roleId, ontoId, chart);
  if (!check.ok) throw new Error(check.reason ?? 'That move is not allowed.');

  // Entities are sealed branches: no reporting line may cross one.
  const [role] = await db.select().from(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  const [onto] = await db.select().from(schema.roles).where(and(eq(schema.roles.id, ontoId), eq(schema.roles.tenantId, user.tenantId)));
  if (!role || !onto) throw new Error('That role is not in this business.');

  await db.update(schema.roles).set({ reportsToRoleId: ontoId }).where(eq(schema.roles.id, roleId));
  revalidatePath('/org');
}

/**
 * Break a link: the role, and everybody under it, comes off the chart.
 *
 * The branch is not deleted and nothing is lost — it goes to the tray, is counted, and drops out of
 * every average until it is dragged back. Excluding it quietly would be the dishonest option.
 */
export async function breakLink(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) throw new Error('That role is outside your part of the chart.');
  await db.update(schema.roles).set({ reportsToRoleId: null })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  revalidatePath('/org');
}

/**
 * Drag a name pill onto another card: the PERSON moves, the roles stay put.
 *
 * If the destination already has somebody, the two swap. That is almost always what was meant — and
 * the alternative, silently vacating one of them, loses a placement nobody asked to lose.
 */
export async function movePerson(formData: FormData) {
  const user = await editor();
  const fromRoleId = String(formData.get('fromRoleId') ?? '');
  const toRoleId = String(formData.get('toRoleId') ?? '');
  if (!fromRoleId || !toRoleId || fromRoleId === toRoleId) return;

  const scope = await getScope(user);
  if (!scope.canEdit(fromRoleId) || !scope.canEdit(toRoleId)) {
    throw new Error('Both roles have to be inside your part of the chart.');
  }

  const open = await db.select().from(schema.roleAssignments).where(isNull(schema.roleAssignments.toDate));
  const from = open.find(a => a.roleId === fromRoleId);
  const to = open.find(a => a.roleId === toRoleId);
  if (!from) return;

  // Assignments are opened and closed, never deleted, so the chart can always answer who held a
  // role in March.
  const today = new Date().toISOString().slice(0, 10);
  await db.update(schema.roleAssignments).set({ toDate: today }).where(eq(schema.roleAssignments.id, from.id));
  if (to) await db.update(schema.roleAssignments).set({ toDate: today }).where(eq(schema.roleAssignments.id, to.id));

  await db.insert(schema.roleAssignments).values({
    id: randomUUID(), roleId: toRoleId, userId: from.userId, staffId: from.staffId, fromDate: today,
  });
  if (to) {
    await db.insert(schema.roleAssignments).values({
      id: randomUUID(), roleId: fromRoleId, userId: to.userId, staffId: to.staffId, fromDate: today,
    });
  }
  revalidatePath('/org');
}

/** Add a role under another. It starts vacant, because roles exist before people. */
export async function addRole(formData: FormData) {
  const user = await editor();
  const title = String(formData.get('title') ?? '').trim();
  const parentId = String(formData.get('parentId') ?? '') || null;
  if (!title) return;

  const scope = await getScope(user);
  if (parentId && !scope.canEdit(parentId)) throw new Error('That role is outside your part of the chart.');

  let stream = 'operations';
  let level = 'manager';
  if (parentId) {
    const [parent] = await db.select().from(schema.roles)
      .where(and(eq(schema.roles.id, parentId), eq(schema.roles.tenantId, user.tenantId)));
    if (!parent) throw new Error('That role is not in this business.');
    stream = parent.stream;
    level = parent.level === 'gm' ? 'manager' : parent.level === 'manager' ? 'supervisor' : 'staff';
  }

  const id = randomUUID();
  await db.insert(schema.roles).values({
    id, tenantId: user.tenantId, title, stream, level,
    defaultAccess: level === 'staff' ? 'readonly' : 'full',
    reportsToRoleId: parentId, sortOrder: 99,
  });
  // A new role inherits the path its level starts with, so nobody meets a blank curriculum.
  await installTraining(user.tenantId, [{ roleId: id, level }]);
  revalidatePath('/org');
}

/** Take a role off the chart for good. Never used on a role with anybody in it. */
export async function removeRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) throw new Error('That role is outside your part of the chart.');

  const open = await db.select().from(schema.roleAssignments)
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  if (open.length) throw new Error('Move the person out of that role first — removing it would lose their placement.');

  const children = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.reportsToRoleId, roleId), eq(schema.roles.tenantId, user.tenantId)));
  if (children.length) throw new Error(`${children.length} role(s) report to that one. Move them first.`);

  // Deactivated, not deleted: a locked month keeps the structure it had.
  await db.update(schema.roles).set({ active: false })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
  revalidatePath('/org');
}

/** Make a role vacant: the person leaves, the role and its KPIs stay exactly as they are. */
export async function vacateRole(formData: FormData) {
  const user = await editor();
  const roleId = String(formData.get('roleId') ?? '');
  const scope = await getScope(user);
  if (!scope.canEdit(roleId)) throw new Error('That role is outside your part of the chart.');
  await db.update(schema.roleAssignments).set({ toDate: new Date().toISOString().slice(0, 10) })
    .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
  revalidatePath('/org');
}

/**
 * Start from what the business already has: a paste, or a CSV.
 *
 * Anything whose manager cannot be matched is still created — it lands unlinked, where a person can
 * see the problem and drag it in. Refusing the whole import over one bad line would be worse.
 */
export async function importChart(formData: FormData) {
  const user = await editor();
  const text = String(formData.get('text') ?? '');
  const csv = String(formData.get('csv') ?? '');
  const parsed = csv.trim() ? parseCsv(csv) : parseRoles(text);
  if (!parsed.length) return;

  const { rows } = resolveImport(parsed);
  const existing = await getRoles(user.tenantId);
  const byTitle = new Map(existing.map(r => [r.title.toLowerCase(), r.id]));

  // Two passes: every role exists before any reporting line is drawn.
  const created: { title: string; id: string; level: string }[] = [];
  for (const r of rows) {
    if (byTitle.has(r.title.toLowerCase())) continue;
    const id = randomUUID();
    const level = r.parentTitle ? 'manager' : 'gm';
    await db.insert(schema.roles).values({
      id, tenantId: user.tenantId, title: r.title, stream: 'operations', level,
      defaultAccess: 'full', reportsToRoleId: null, sortOrder: 50,
    });
    byTitle.set(r.title.toLowerCase(), id);
    created.push({ title: r.title, id, level });
  }

  for (const r of rows) {
    const id = byTitle.get(r.title.toLowerCase());
    const parentId = r.parentTitle ? byTitle.get(r.parentTitle.toLowerCase()) ?? null : null;
    if (!id || !parentId || id === parentId) continue;
    await db.update(schema.roles).set({ reportsToRoleId: parentId }).where(eq(schema.roles.id, id));
  }

  // A name in the paste is a staff row: free, silent, and nobody is emailed.
  for (const r of rows) {
    if (!r.person) continue;
    const roleId = byTitle.get(r.title.toLowerCase());
    if (!roleId) continue;
    const held = await db.select().from(schema.roleAssignments)
      .where(and(eq(schema.roleAssignments.roleId, roleId), isNull(schema.roleAssignments.toDate)));
    if (held.length) continue;
    const staffId = randomUUID();
    await db.insert(schema.staff).values({
      id: staffId, tenantId: user.tenantId, name: r.person, createdAt: new Date().toISOString(),
    });
    await db.insert(schema.roleAssignments).values({
      id: randomUUID(), roleId, staffId, fromDate: new Date().toISOString().slice(0, 10),
    });
  }

  if (created.length) await installTraining(user.tenantId, created.map(c => ({ roleId: c.id, level: c.level })));
  revalidatePath('/org');
}
