'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { getScope } from '@/lib/scope';
import { refuseTo } from '@/lib/refuse';
import { coverageFor, setCoverage } from '@/lib/coverage-data';
import { switchReading, logDecision } from '@/lib/recommends-data';
import {
  areaOf, mayRunSideBySide, mayUseSwitch, mayUndo, stillChecking, switchChoices, parsePrevious,
  productName, isFrictionKind, monthOf, topicOf, type SwitchArea,
} from '@/lib/switch';

/**
 * The switch itself. Moving a business's systems is an administrator's decision — the same people
 * who hold seats and billing — so every change here needs one. Reporting friction needs only a seat.
 */
async function forArea(formData: FormData, administer: boolean) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  const area = areaOf(String(formData.get('area') ?? ''));
  if (!area) refuseTo('/virtual-gm', 'SPEC has no area by that name.');
  const screen = `/switch?area=${area.key}`;
  if (administer && !(await getScope(user)).canAdminister) {
    refuseTo(screen, 'Switching a system is for an administrator of this business.');
  }
  const reading = await switchReading(user.tenantId, area);
  return { user, area, screen, reading };
}

const done = (screen: string): never => {
  revalidatePath('/switch');
  revalidatePath('/virtual-gm');
  redirect(screen);
};

const stamp = (tenantId: string, area: SwitchArea, set: Partial<typeof schema.systemSwitches.$inferInsert>) =>
  db.update(schema.systemSwitches)
    .set({ ...set, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.systemSwitches.tenantId, tenantId), eq(schema.systemSwitches.area, area.key)));

/** Side by side, or Shadow for accounting. Changes nothing anywhere — both keep running. */
export async function runSideBySide(formData: FormData) {
  const { user, area, screen, reading } = await forArea(formData, true);
  if (!mayRunSideBySide(area, reading.row)) refuseTo(screen, 'That step is not open yet.');
  await stamp(user.tenantId, area, { state: 'side_by_side', sideBySideAt: new Date().toISOString() });
  done(screen);
}

/** The owner's half of the gate: "I'm ready to switch". */
export async function sayReady(formData: FormData) {
  const { user, area, screen, reading } = await forArea(formData, true);
  if (!reading.row || reading.row.state === 'spec') refuseTo(screen, 'There is no switch plan to be ready for.');
  await stamp(user.tenantId, area, { ownerReadyAt: new Date().toISOString() });
  done(screen);
}

/**
 * The switch. Only when both halves hold — the owner said ready, and SPEC's check confirmed. Moves
 * the area's Coverage choices to SPEC and keeps what they were, so Undo puts them back exactly. The
 * business's other system is never touched.
 */
export async function switchNow(formData: FormData) {
  const { user, area, screen, reading } = await forArea(formData, true);
  if (!mayUseSwitch(area, reading.row, reading.checks)) {
    const still = stillChecking(area, reading.row, reading.checks);
    refuseTo(screen, `Not available yet. Still being checked: ${still.join('; ') || 'your go-ahead'}.`);
  }
  const { clear, previous } = switchChoices(area, await coverageFor(user.tenantId));
  if (clear.length) await setCoverage(user.tenantId, clear, 'spec', user.name);
  const at = new Date().toISOString();
  await stamp(user.tenantId, area, { state: 'spec', switchedAt: at, switchedBy: user.name, previous: JSON.stringify(previous) });
  await logDecision({
    tenantId: user.tenantId, userName: user.name, answer: 'yes', outcome: 'done',
    action: { type: 'start_switch', area: area.key },
    rec: { kind: 'hold', topic: topicOf(area.key), headline: `Switched ${area.noun} to ${productName(area)}.`, reason: '', facts: reading.rec.facts },
  });
  done(screen);
}

/** Undo — back to the business's own system, with the Coverage choices it had before. */
export async function undoSwitch(formData: FormData) {
  const { user, area, screen, reading } = await forArea(formData, true);
  if (!mayUndo(reading.row)) refuseTo(screen, 'There is nothing to undo.');
  const [row] = await db.select({ previous: schema.systemSwitches.previous }).from(schema.systemSwitches)
    .where(and(eq(schema.systemSwitches.tenantId, user.tenantId), eq(schema.systemSwitches.area, area.key)));
  const restore = parsePrevious(row?.previous ?? '{}', area);
  if (restore.length) await setCoverage(user.tenantId, restore, 'own', user.name);
  await stamp(user.tenantId, area, { state: 'requested', sideBySideAt: null, switchedAt: null, switchedBy: null, ownerReadyAt: null, previous: '{}' });
  await logDecision({
    tenantId: user.tenantId, userName: user.name, answer: 'yes', outcome: 'done',
    rec: { kind: 'hold', topic: topicOf(area.key), headline: `Undid the ${area.noun} switch — back to your own system.`, reason: '', facts: reading.rec.facts },
  });
  done(screen);
}

/**
 * Something was not easy. Logged, and it is the business's Simple Guarantee claim for this month —
 * the kind is counted across every business so SPEC can fix it; the note stays in the business.
 */
export async function reportFriction(formData: FormData) {
  const { user, area, screen } = await forArea(formData, false);
  const kind = String(formData.get('kind') ?? '');
  if (!isFrictionKind(kind)) refuseTo(screen, 'Choose what was not easy.');
  const note = String(formData.get('note') ?? '').trim().slice(0, 1000) || null;
  await db.insert(schema.switchFriction).values({
    id: randomUUID(), tenantId: user.tenantId, area: area.key, kind, note,
    month: monthOf(), reportedBy: user.name, createdAt: new Date().toISOString(),
  });
  done(`${screen}&told=1`);
}
