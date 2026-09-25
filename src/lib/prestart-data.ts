/**
 * Reading and writing one person's pre-start.
 *
 * Kept apart from `lib/prestart`, which is pure and holds the rules. The important thing here is
 * what happens when the database cannot be reached: the rest of Tech Day is written so that no
 * signal is a phone that still works, and this has to break the other way.
 *
 * A pre-start that cannot be read must NOT open the day. The whole point of the gate is that
 * nobody drives out on a ute nobody looked at, and "we could not check" is not a reason to let them
 * — it is the exact circumstance under which a gate has to hold. So a failure here returns null,
 * which `readDay` treats as not done, and the person is asked to do it again. Thirty seconds of
 * annoyance against the thing this exists to prevent.
 */
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import {
  CHECKS, emptyPreStart, readDay, tellSupervisor, type Mark, type PreStart, type DayReading,
} from './prestart';

export const todayIn = (now = new Date()): string => now.toISOString().slice(0, 10);

function parseMarks(raw: string): PreStart['marks'] {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PreStart['marks'] = {};
    for (const c of CHECKS) {
      const v = parsed[c.key];
      if (v === 'ok' || v === 'not_ok') out[c.key] = v as Mark;
    }
    return out;
  } catch {
    /* Unreadable marks are no marks. Half a pre-start is not a pre-start. */
    return {};
  }
}

export async function preStartFor(
  tenantId: string,
  personKey: string,
  personName: string,
  day = todayIn(),
): Promise<PreStart | null> {
  try {
    const [row] = await db.select()
      .from(schema.preStarts)
      .where(and(
        eq(schema.preStarts.tenantId, tenantId),
        eq(schema.preStarts.personKey, personKey),
        eq(schema.preStarts.day, day),
      ))
      .limit(1);
    if (!row) return emptyPreStart(day, personName);
    return {
      day: row.day,
      who: row.personName,
      marks: parseMarks(row.marks),
      note: row.note,
      doneAt: row.doneAt,
      clearedAt: row.clearedAt,
      clearedBy: row.clearedBy,
    };
  } catch {
    /* See the note at the top of this file: unreadable is closed, not open. */
    return null;
  }
}

export interface GateReading extends DayReading {
  preStart: PreStart | null;
  /** False for somebody who does not drive a company vehicle — no gate applies to them. */
  applies: boolean;
}

/**
 * Whether today's jobs may be shown to this person.
 *
 * `applies` is checked first and deliberately: a gate that stops an office person who never touches
 * a vehicle is a gate people learn to resent, and the moment somebody is doing a check that does
 * not apply to them they stop reading it — which is how the check stops working for the people it
 * does apply to.
 */
export async function gateFor(input: {
  tenantId: string;
  personKey: string;
  personName: string;
  drivesCompanyVehicle: boolean;
  day?: string;
}): Promise<GateReading> {
  if (!input.drivesCompanyVehicle) {
    return {
      applies: false, preStart: null, state: 'clear', mayWork: true,
      says: 'No pre-start today — you are not down as driving a company vehicle.',
    };
  }
  const preStart = await preStartFor(input.tenantId, input.personKey, input.personName, input.day);
  return { applies: true, preStart, ...readDay(preStart) };
}

/** Whether this person drives a company vehicle. Unknown reads as no — see `gateFor`. */
export async function drivesFor(tenantId: string, userId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ drives: schema.staff.drivesCompanyVehicle })
      .from(schema.staff)
      .where(and(eq(schema.staff.tenantId, tenantId), eq(schema.staff.userId, userId)))
      .limit(1);
    return Boolean(row?.drives);
  } catch {
    return false;
  }
}

/** Write a pre-start. One row per person per day, so a second submission corrects the first. */
export async function savePreStart(input: {
  tenantId: string;
  personKey: string;
  personName: string;
  day: string;
  marks: PreStart['marks'];
  note: string;
}): Promise<void> {
  await db.insert(schema.preStarts).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    day: input.day,
    personKey: input.personKey,
    personName: input.personName,
    marks: JSON.stringify(input.marks),
    note: input.note,
    doneAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: [schema.preStarts.tenantId, schema.preStarts.personKey, schema.preStarts.day],
    set: {
      marks: JSON.stringify(input.marks),
      note: input.note,
      doneAt: new Date().toISOString(),
      /*
        Re-submitting clears any previous clearance. A supervisor cleared the pre-start that was in
        front of them, not whatever it is changed to afterwards — carrying the clearance forward
        would let a cleared day quietly become a different, uncleared one.
      */
      clearedAt: null,
      clearedBy: null,
    },
  });
}

/**
 * Pre-starts that have a fault and nobody has cleared.
 *
 * The supervisor's side of the gate. Today only: a fault from last Tuesday is history, and mixing
 * it in with this morning's would bury the one somebody is standing next to a ute waiting on.
 */
export async function heldPreStarts(
  tenantId: string,
  day = todayIn(),
): Promise<{ personKey: string; personName: string; day: string; says: string }[]> {
  try {
    const rows = await db.select()
      .from(schema.preStarts)
      .where(and(eq(schema.preStarts.tenantId, tenantId), eq(schema.preStarts.day, day)));

    return rows
      .map(r => ({
        personKey: r.personKey,
        personName: r.personName,
        day: r.day,
        preStart: {
          day: r.day, who: r.personName, marks: parseMarks(r.marks), note: r.note,
          doneAt: r.doneAt, clearedAt: r.clearedAt, clearedBy: r.clearedBy,
        } as PreStart,
      }))
      .filter(r => readDay(r.preStart).state === 'held')
      .map(r => ({
        personKey: r.personKey,
        personName: r.personName,
        day: r.day,
        says: tellSupervisor(r.preStart) ?? '',
      }));
  } catch {
    return [];
  }
}

/** A supervisor says the day may go ahead. The fault stays on the record underneath it. */
export async function clearHeld(input: {
  tenantId: string; personKey: string; day: string; by: string;
}): Promise<void> {
  await db.update(schema.preStarts)
    .set({ clearedAt: new Date().toISOString(), clearedBy: input.by })
    .where(and(
      eq(schema.preStarts.tenantId, input.tenantId),
      eq(schema.preStarts.personKey, input.personKey),
      eq(schema.preStarts.day, input.day),
    ));
}
