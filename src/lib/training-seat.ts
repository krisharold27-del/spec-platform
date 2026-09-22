import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { eligibleForTrainingSeat } from './pricing';
import { LIBRARY, libraryOrder } from './training-library';

/**
 * Turning SPEC's training material on for one person — the leadership seat's training upgrade.
 *
 * Three things have to be true at once and they are easy to let drift apart:
 *
 *   the PERSON is on a training seat        (users.trainingSeat — what is billed)
 *   the MATERIAL exists in this business    (training_modules, source 'spec')
 *   the ROLE'S PATH includes it             (role_curriculum — what they are actually asked to do)
 *
 * Turning the seat on without the last two would charge somebody the training price for a page that
 * looks exactly like the plain one, which is the fault this whole mechanism exists to fix. So it is
 * one operation.
 */

/**
 * The roles this person holds, with enough of the chart to say whether each one is a leadership
 * seat — `eligibleForTrainingSeat` (lib/pricing) needs the title AND whether anybody reports to it,
 * the same two facts `seatKindFor` decides billing from, so eligibility here can never disagree
 * with what the person is actually billed as.
 */
async function heldRoles(tenantId: string, userId: string) {
  const rows = await db
    .select({ roleId: schema.roles.id, title: schema.roles.title })
    .from(schema.roleAssignments)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.roleAssignments.roleId))
    .where(and(eq(schema.roles.tenantId, tenantId), eq(schema.roleAssignments.userId, userId)));
  if (!rows.length) return [];

  const reportsIn = await db
    .select({ reportsTo: schema.roles.reportsToRoleId })
    .from(schema.roles)
    .where(and(eq(schema.roles.tenantId, tenantId), inArray(schema.roles.reportsToRoleId, rows.map(r => r.roleId))));
  const leads = new Set(reportsIn.map(r => r.reportsTo).filter((x): x is string => Boolean(x)));

  return rows.map(r => ({ roleId: r.roleId, title: r.title, hasDirectReports: leads.has(r.roleId) }));
}

/** Leadership seats only — see `eligibleForTrainingSeat` in lib/pricing for what decides that. */
export async function eligibleForTraining(tenantId: string, userId: string): Promise<boolean> {
  const roles = await heldRoles(tenantId, userId);
  return roles.some(r => eligibleForTrainingSeat(r));
}

/**
 * Put SPEC's material into this business, once.
 *
 * Idempotent on `libraryId`, so running it for the second supervisor adds nothing, and improving a
 * module later updates the wording in every business without touching anybody's progress — the
 * records point at the module row, and the module row keeps its id.
 */
export async function installLibrary(tenantId: string): Promise<Map<string, string>> {
  const existing = await db
    .select({ id: schema.trainingModules.id, libraryId: schema.trainingModules.libraryId })
    .from(schema.trainingModules)
    .where(and(eq(schema.trainingModules.tenantId, tenantId), eq(schema.trainingModules.source, 'spec')));

  const byLibraryId = new Map(existing.filter(r => r.libraryId).map(r => [r.libraryId as string, r.id]));
  const ordered = libraryOrder();

  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i];
    const known = byLibraryId.get(m.libraryId);
    if (known) {
      // Keep the wording current. Never the id, and never `active` — a business may retire one.
      await db.update(schema.trainingModules)
        .set({ title: m.title, summary: m.summary, pillar: m.pillar, minutes: m.minutes, core: m.core, sortOrder: i, content: m.content })
        .where(eq(schema.trainingModules.id, known));
      continue;
    }
    const id = randomUUID();
    await db.insert(schema.trainingModules).values({
      id, tenantId, title: m.title, summary: m.summary, pillar: m.pillar,
      minutes: m.minutes, core: m.core, sortOrder: i, active: true,
      source: 'spec', libraryId: m.libraryId, content: m.content,
    });
    byLibraryId.set(m.libraryId, id);
  }
  return byLibraryId;
}

/**
 * Put the material on this role's path.
 *
 * The path belongs to the ROLE, which is the rule everywhere else in training and is why a second
 * supervisor in the same role inherits it without anybody doing anything. No due dates: a deadline
 * on material somebody has just been given is a way of making it an obligation before it has been
 * any use. The business can set them afterwards like any other module.
 */
export async function addLibraryToPath(roleId: string, moduleIds: string[]): Promise<void> {
  if (!moduleIds.length) return;
  const already = await db
    .select({ moduleId: schema.roleCurriculum.moduleId })
    .from(schema.roleCurriculum)
    .where(and(eq(schema.roleCurriculum.roleId, roleId), inArray(schema.roleCurriculum.moduleId, moduleIds)));
  const have = new Set(already.map(r => r.moduleId));

  for (let i = 0; i < moduleIds.length; i++) {
    if (have.has(moduleIds[i])) continue;
    await db.insert(schema.roleCurriculum).values({
      id: randomUUID(), roleId, moduleId: moduleIds[i], dueDays: null, sortOrder: i,
    });
  }
}

/**
 * The whole operation: bill the person, install the material, put it on their role's path.
 *
 * Returns false when the person does not hold a leadership seat, rather than throwing — the caller
 * is a form on a page, and a refusal it can explain is worth more than an exception it cannot.
 */
export async function giveTrainingSeat(tenantId: string, userId: string): Promise<boolean> {
  const roles = await heldRoles(tenantId, userId);
  const eligible = roles.filter(r => eligibleForTrainingSeat(r));
  if (!eligible.length) return false;

  const modules = await installLibrary(tenantId);
  const ids = libraryOrder().map(m => modules.get(m.libraryId)).filter((x): x is string => Boolean(x));

  for (const r of eligible) await addLibraryToPath(r.roleId, ids);

  await db.update(schema.users).set({ trainingSeat: true })
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, userId)));
  return true;
}

/**
 * Take the seat off the bill.
 *
 * The material stays where it is, and so does everything the person has learned. Somebody who has
 * done eight modules and then comes off the seat has still done eight modules, and deleting that to
 * make a billing change tidy would be destroying a record of training because of an invoice.
 */
export async function removeTrainingSeat(tenantId: string, userId: string): Promise<void> {
  await db.update(schema.users).set({ trainingSeat: false })
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, userId)));
}

/**
 * How many people are actually billed at the training price lives in `lib/plan` now —
 * `countTrainingSeats` there, alongside `countLeadershipSeats` — because billing has to read the
 * SAME walk of the chart both counts come from, rather than this file's column-only version
 * disagreeing with it the day somebody moves off a leadership role without anybody touching the
 * `trainingSeat` column.
 */

/** Is this person on a training seat? What the training page shows SPEC's material on. */
export async function hasTrainingSeat(tenantId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ trainingSeat: schema.users.trainingSeat })
    .from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, userId)));
  return Boolean(rows[0]?.trainingSeat);
}
