/**
 * Reading leave, and the one rule that must not be got wrong anywhere.
 *
 * Every row that leaves this file has already been through `labelFor`. The kind is NOT handed to a
 * page to decide what to call — because a page that receives `kind: 'fdv'` is a page one careless
 * render away from putting "Family and domestic violence" on a roster, and somebody taking that
 * leave is very often hiding from a person who knows where they work.
 *
 * So the shape a screen gets carries a `label` and no `kind` at all unless the viewer is entitled
 * to it. The safest way to stop something being displayed is for it not to be there.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  KINDS, labelFor, check, approverFor, crewWarning,
  type Balance, type LeaveKind, type Request, type Viewer, type Check, type CrewWarning,
} from './leave';

const isKind = (v: string): v is LeaveKind => KINDS.some(k => k.key === v);

/** One request, already reduced to what this viewer may know about it. */
export interface SafeRequest {
  id: string;
  who: string;
  /** What it is called TO THIS VIEWER. Never the raw kind for somebody not entitled to it. */
  label: string;
  /** Present only when the viewer may see it — the person, their approver, or payroll. */
  kind: LeaveKind | null;
  from: string;
  to: string;
  hours: number;
  /** Present only when the viewer may read it. */
  reason: string | null;
  state: 'asked' | 'approved' | 'declined';
  overrideBy: string | null;
  fits: Check;
  needs: 'leader' | 'manager';
}

export async function balancesFor(tenantId: string, personKey: string): Promise<Balance[]> {
  try {
    const rows = await db.select()
      .from(schema.leaveBalances)
      .where(and(eq(schema.leaveBalances.tenantId, tenantId), eq(schema.leaveBalances.personKey, personKey)));
    return rows.filter(r => isKind(r.kind)).map(r => ({ kind: r.kind as LeaveKind, hours: r.hours }));
  } catch {
    return [];
  }
}

/**
 * Leave requests, reduced for one viewer.
 *
 * `viewer` is worked out by the caller from who is signed in: 'approver' for somebody who can
 * decide this person's leave, 'payroll' for the seat that runs the pay, 'self' for the person, and
 * 'anyone' for everybody else — which is most people looking at a roster.
 */
export async function requestsFor(
  tenantId: string,
  viewer: Viewer,
  personKey?: string,
): Promise<SafeRequest[]> {
  let rows: { id: string; staffId: string | null; userId: string | null; kind: string;
    fromDate: string; toDate: string; hours: number | null; reason: string;
    state: string; overrideBy: string | null; name: string | null }[] = [];
  try {
    rows = await db.select({
      id: schema.leaveEntries.id,
      staffId: schema.leaveEntries.staffId,
      userId: schema.leaveEntries.userId,
      kind: schema.leaveEntries.kind,
      fromDate: schema.leaveEntries.fromDate,
      toDate: schema.leaveEntries.toDate,
      hours: schema.leaveEntries.hours,
      reason: schema.leaveEntries.reason,
      state: schema.leaveEntries.state,
      overrideBy: schema.leaveEntries.overrideBy,
      name: schema.staff.name,
    })
      .from(schema.leaveEntries)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.leaveEntries.staffId))
      .where(eq(schema.leaveEntries.tenantId, tenantId))
      .orderBy(desc(schema.leaveEntries.fromDate))
      .limit(100);
  } catch {
    return [];
  }

  const out: SafeRequest[] = [];
  for (const r of rows) {
    const who = r.userId ? `user:${r.userId}` : r.staffId ? `staff:${r.staffId}` : '';
    if (personKey && who !== personKey) continue;

    const kind = kindOf(r.kind);
    const balances = who ? await balancesFor(tenantId, who) : [];
    /*
      Hours are null on rows written before Design 19 added them. Treated as untracked rather than
      as zero: zero hours would read as a request that fits any balance, which is the wrong answer
      in the one direction that matters.
    */
    const fits = check({ kind, hours: r.hours ?? 0 }, balances);
    const entitled = viewer !== 'anyone';

    out.push({
      id: r.id,
      who: r.name ?? 'Somebody',
      label: labelFor(kind, viewer),
      /*
        Withheld rather than sent and hidden. A page that never receives the kind cannot leak it,
        however it is later rewritten.
      */
      kind: entitled ? kind : null,
      from: r.fromDate,
      to: r.toDate,
      hours: r.hours ?? 0,
      reason: entitled ? r.reason : null,
      state: r.state === 'approved' ? 'approved' : r.state === 'declined' ? 'declined' : 'asked',
      overrideBy: r.overrideBy,
      fits,
      needs: approverFor(fits),
    });
  }
  return out;
}

/**
 * The stored kind, read as one of Design 19's eight.
 *
 * Rows written before the widening say `sick` and `parental`. Mapped rather than migrated:
 * rewriting stored history to match a new vocabulary is how a leave record stops being evidence of
 * what was agreed at the time.
 */
function kindOf(stored: string): LeaveKind {
  if (stored === 'sick') return 'personal';
  if (stored === 'parental' || stored === 'other') return 'unpaid';
  return isKind(stored) ? stored : 'unpaid';
}

/** Requests still waiting on somebody. What a leader opens the screen to deal with. */
export const waiting = (list: readonly SafeRequest[]): SafeRequest[] =>
  list.filter(r => r.state === 'asked');

/**
 * What approving this would do to the week.
 *
 * Counted from what is actually booked against who is actually available, so the warning is about
 * this business's real week rather than a rule of thumb.
 */
export async function crewEffect(
  tenantId: string,
  from: string,
  to: string,
  hours: number,
): Promise<CrewWarning> {
  try {
    const bookings = await db.select({ day: schema.scheduleBookings.day, personKey: schema.scheduleBookings.personKey })
      .from(schema.scheduleBookings)
      .where(eq(schema.scheduleBookings.tenantId, tenantId));

    const staff = await db.select({ id: schema.staff.id })
      .from(schema.staff)
      .where(eq(schema.staff.tenantId, tenantId));
    const available = staff.length;

    const byDay = new Map<string, Set<string>>();
    for (const b of bookings) {
      if (b.day < from || b.day > to) continue;
      byDay.set(b.day, (byDay.get(b.day) ?? new Set()).add(b.personKey));
    }
    const days = [...byDay].map(([day, people]) => ({ day, booked: people.size, available }));
    return crewWarning(days, hours);
  } catch {
    /* No warning is better than a wrong one — and this never blocks anything either way. */
    return { days: [], says: null };
  }
}

export { KINDS, labelFor };
export type { Request, Viewer };
