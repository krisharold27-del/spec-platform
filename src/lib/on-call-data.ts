/**
 * The on-call roster, key roles and who used siteVIP this week — from what SPEC already holds.
 *
 * Nothing here has its own store yet except the roster. Key roles are read from the chart, and
 * "using siteVIP" is read from pre-starts, timesheets and sign-offs, which is the point: the thing
 * being measured is doing the work, not opening the app, so it cannot be gamed by opening the app.
 */
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import type { OnCallWeek, KeyRole } from './on-call';
import type { PersonWeek, Using } from './round3';

export interface OnCallView {
  weeks: OnCallWeek[];
  keyRoles: KeyRole[];
  week: PersonWeek[];
}

/** Monday of the week a date falls in. */
export function mondayOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

export async function onCallFor(tenantId: string, now: Date = new Date()): Promise<OnCallView> {
  const monday = mondayOf(now);
  const sunday = new Date(Date.parse(monday) + 6 * 86_400_000).toISOString().slice(0, 10);

  const [roles, placements, staff, bookings, preStarts, entries, records] = await Promise.all([
    db.select({ id: schema.roles.id, title: schema.roles.title })
      .from(schema.roles).where(eq(schema.roles.tenantId, tenantId)),
    db.select({ roleId: schema.roleAssignments.roleId, staffId: schema.roleAssignments.staffId, userId: schema.roleAssignments.userId, toDate: schema.roleAssignments.toDate })
      .from(schema.roleAssignments),
    db.select({ id: schema.staff.id, name: schema.staff.name, userId: schema.staff.userId, phone: schema.staff.phone })
      .from(schema.staff).where(eq(schema.staff.tenantId, tenantId)),
    db.select({ personKey: schema.scheduleBookings.personKey, personName: schema.scheduleBookings.personName, day: schema.scheduleBookings.day })
      .from(schema.scheduleBookings)
      .where(and(
        eq(schema.scheduleBookings.tenantId, tenantId),
        gte(schema.scheduleBookings.day, monday),
        lte(schema.scheduleBookings.day, sunday),
      )),
    db.select({ personKey: schema.preStarts.personKey, day: schema.preStarts.day, doneAt: schema.preStarts.doneAt })
      .from(schema.preStarts)
      .where(and(
        eq(schema.preStarts.tenantId, tenantId),
        gte(schema.preStarts.day, monday),
        lte(schema.preStarts.day, sunday),
      )),
    db.select({ personKey: schema.timesheetEntries.personKey, day: schema.timesheetEntries.day })
      .from(schema.timesheetEntries)
      .where(and(
        eq(schema.timesheetEntries.tenantId, tenantId),
        gte(schema.timesheetEntries.day, monday),
        lte(schema.timesheetEntries.day, sunday),
      )),
    db.select({ who: schema.jobRecords.who, kind: schema.jobRecords.kind, atTime: schema.jobRecords.atTime })
      .from(schema.jobRecords).where(eq(schema.jobRecords.tenantId, tenantId)),
  ]);

  /*
    Scoped to this business's roles. role_assignments has no tenant_id of its own — the same trap
    tests/tenant-isolation.test.ts caught in lib/chain-data.
  */
  const roleIds = new Set(roles.map(r => r.id));
  const mine = placements.filter(p => roleIds.has(p.roleId));
  const nameOfStaff = new Map(staff.map(s => [s.id, s.name]));

  /*
    Key roles: every seat on the chart, with whoever holds it and whoever else has ever held it as
    the nearest thing SPEC has to a backup. Null when nobody else ever has, which is exactly the
    state the section exists to surface.
  */
  const keyRoles: KeyRole[] = roles.map(r => {
    const open = mine.find(p => p.roleId === r.id && p.toDate === null);
    const past = mine.filter(p => p.roleId === r.id && p.toDate !== null);
    const holder = open?.staffId ? nameOfStaff.get(open.staffId) ?? null : null;
    const previous = past.map(p => (p.staffId ? nameOfStaff.get(p.staffId) : null)).find(Boolean) ?? null;
    return {
      roleId: r.id,
      title: r.title,
      holder,
      backupName: previous && previous !== holder ? previous : null,
      /* Nothing records a written how-to per role yet, so this is honestly false everywhere. */
      hasHowTo: false,
      resignedAt: null,
    };
  });

  /* Who worked this week, and which of the three things they did. */
  const byPerson = new Map<string, PersonWeek>();
  for (const b of bookings) {
    const found = byPerson.get(b.personKey) ?? { personKey: b.personKey, name: b.personName, did: [] as Using[], daysBooked: 0 };
    found.daysBooked += 1;
    byPerson.set(b.personKey, found);
  }
  const add = (key: string, what: Using) => {
    const found = byPerson.get(key);
    if (found && !found.did.includes(what)) found.did = [...found.did, what];
  };
  for (const p of preStarts) if (p.doneAt) add(p.personKey, 'prestart');
  for (const e of entries) add(e.personKey, 'timesheet');
  for (const r of records) {
    if (r.kind !== 'sign') continue;
    /* Job records are keyed by NAME rather than by person key, so match on the name. */
    for (const [key, person] of byPerson) if (person.name === r.who) add(key, 'signoff');
  }

  return {
    weeks: await rosterFor(tenantId, monday),
    keyRoles,
    week: [...byPerson.values()],
  };
}

/**
 * The on-call roster for this week and the next few.
 *
 * Nothing stores it yet, so this returns the coming weeks as EMPTY rather than as nothing at all —
 * an empty week is the state the whole section exists to make visible, and returning no rows would
 * make a roster nobody has filled in look like a roster that does not apply.
 */
async function rosterFor(tenantId: string, monday: string): Promise<OnCallWeek[]> {
  void tenantId;
  return Array.from({ length: 4 }, (_, i) => ({
    weekStart: new Date(Date.parse(monday) + i * 7 * 86_400_000).toISOString().slice(0, 10),
    personKey: null,
    personName: null,
    phone: null,
  }));
}

export { inArray };
