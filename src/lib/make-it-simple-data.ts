import { and, desc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '../db';
import { actionsOf, mondayOf, weeksBetween } from './meeting';
import {
  buildReport, frictionAdvice, meetingDateFor, isDue, scheduleLine, parseReport, NO_SIGNALS,
  type Signals, type SimpleReport,
} from './make-it-simple';
import type { Recommendation } from './recommends';
import { relevantAreas, switchReading, businessCounts } from './recommends-data';
import { productName } from './switch';
import { isLookTenant } from './look';

/**
 * Make it simple, against the database. Every count is the business's own rows, tenant in every
 * query; every judgement is in lib/make-it-simple.
 *
 * ── How "automatically, before the meeting" works, and why this way ─────────────────────────────
 *
 * The report is written the first time anybody in the business opens SPEC from the day before the
 * meeting (My Page and the Virtual GM ask for it after the page has gone, so nobody waits), and the
 * meeting page writes it on the spot if nobody has. Nobody presses anything.
 *
 * It is deliberately NOT a nightly job that walks every business. That job would be a read path
 * across every tenant, and CLAUDE.md's never list has no exception for a good reason. Written from
 * inside the business, by the business's own visit, it never needs one.
 */

const DAY = 86_400_000;
const daysBetween = (from: string, now: Date) => Math.max(0, Math.floor((now.getTime() - Date.parse(from)) / DAY));
const isoDaysAgo = (days: number, now: Date) => new Date(now.getTime() - days * DAY).toISOString();

export async function signalsFor(tenantId: string, now: Date = new Date()): Promise<Signals> {
  const [sheets, bills, callbacks, runs, jobs, meetings] = await Promise.all([
    db.select({ day: schema.timesheetEntries.day }).from(schema.timesheetEntries)
      .where(and(eq(schema.timesheetEntries.tenantId, tenantId), isNull(schema.timesheetEntries.approvedAt))),
    db.select({ kind: schema.jobBills.kind, sentAt: schema.jobBills.sentAt, amountCents: schema.jobBills.amountCents })
      .from(schema.jobBills).where(and(eq(schema.jobBills.tenantId, tenantId), eq(schema.jobBills.state, 'sent'))),
    db.select({ costCents: schema.callbacks.costCents }).from(schema.callbacks)
      .where(and(eq(schema.callbacks.tenantId, tenantId), eq(schema.callbacks.status, 'open'))),
    db.select({ fromDate: schema.payRuns.fromDate, exportedAt: schema.payRuns.exportedAt }).from(schema.payRuns)
      .where(eq(schema.payRuns.tenantId, tenantId)),
    db.select({ createdAt: schema.jobs.createdAt }).from(schema.jobs)
      .where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.stage, 'enquiry'))),
    db.select({ date: schema.meetings.date, actions: schema.meetings.actions, type: schema.meetings.type })
      .from(schema.meetings).where(eq(schema.meetings.tenantId, tenantId)),
  ]);

  const overdue = bills.filter(b => b.kind === 'invoice' && b.sentAt && daysBetween(b.sentAt, now) > 30);
  const stale = jobs.filter(j => daysBetween(j.createdAt, now) > 2);
  /*
    Finished pay weeks (Monday to Sunday) in the last four with approved hours and no run sent. The
    timesheet query above is only the unapproved ones, so the approved days are read here.
  */
  const thisMonday = mondayOf(now.toISOString());
  const fourWeeksAgo = new Date(Date.parse(`${thisMonday}T00:00:00Z`) - 28 * DAY).toISOString().slice(0, 10);
  const approvedDays = await db.select({ day: schema.timesheetEntries.day }).from(schema.timesheetEntries)
    .where(and(
      eq(schema.timesheetEntries.tenantId, tenantId),
      gte(schema.timesheetEntries.day, fourWeeksAgo),
      lt(schema.timesheetEntries.day, thisMonday),
      isNotNull(schema.timesheetEntries.approvedAt),
    ));
  const sentWeeks = new Set(runs.filter(r => r.exportedAt).map(r => r.fromDate));
  const unsent = new Set(approvedDays.map(d => mondayOf(d.day)).filter(m => !sentWeeks.has(m)));
  const today = now.toISOString().slice(0, 10);
  const carried = meetings.filter(m => m.type === 'sog')
    .flatMap(m => actionsOf({ id: '', date: m.date, minutes: null, actions: m.actions, attendees: null, decisions: null })
      .filter(a => !a.done && weeksBetween(m.date, today) >= 3));

  return {
    timesheetsWaiting: sheets.length,
    oldestTimesheetDays: sheets.length ? Math.max(...sheets.map(s => daysBetween(s.day, now))) : 0,
    overdueInvoices: overdue.length,
    overdueCents: overdue.reduce((n, b) => n + b.amountCents, 0),
    carriedActions: carried.length,
    openCallbacks: callbacks.length,
    callbackCostCents: callbacks.reduce((n, c) => n + c.costCents, 0),
    unsentWeeks: unsent.size,
    staleEnquiries: stale.length,
    oldestEnquiryDays: stale.length ? Math.max(...stale.map(j => daysBetween(j.createdAt, now))) : 0,
  };
}

/** One friction's live card, by key — what the engine re-derives before a Yes is carried out. */
export async function simpleRecommendation(tenantId: string, key: string): Promise<Recommendation | null> {
  return frictionAdvice(key, await signalsFor(tenantId));
}

export async function scheduleFor(tenantId: string): Promise<{ day: number | null; time: string | null }> {
  const [t] = await db.select({ day: schema.tenants.meetingDay, time: schema.tenants.meetingTime })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  return { day: t?.day ?? null, time: t?.time ?? null };
}

export async function latestReport(tenantId: string): Promise<SimpleReport | null> {
  const [row] = await db.select({ body: schema.simpleReports.body }).from(schema.simpleReports)
    .where(eq(schema.simpleReports.tenantId, tenantId))
    .orderBy(desc(schema.simpleReports.meetingDate))
    .limit(1);
  return row ? parseReport(row.body) : null;
}

/**
 * Write this week's report if it is due and not written yet. Safe to call from anywhere, as often as
 * anybody likes: the unique index on (business, meeting) means two visits at once write one report.
 */
export async function ensureReport(tenantId: string, now: Date = new Date()): Promise<void> {
  // A visitor looking around never writes — not even a report.
  if (await isLookTenant(tenantId)) return;
  const { day, time } = await scheduleFor(tenantId);
  const meetingDate = meetingDateFor(now, day);
  if (!isDue(now, meetingDate, day)) return;
  const [existing] = await db.select({ id: schema.simpleReports.id }).from(schema.simpleReports)
    .where(and(eq(schema.simpleReports.tenantId, tenantId), eq(schema.simpleReports.meetingDate, meetingDate)));
  if (existing) return;

  const weekAgo = isoDaysAgo(7, now);
  const [signals, prevRow, done, meetings, friction, areas, counts] = await Promise.all([
    signalsFor(tenantId, now),
    db.select({ body: schema.simpleReports.body }).from(schema.simpleReports)
      .where(and(eq(schema.simpleReports.tenantId, tenantId), lt(schema.simpleReports.meetingDate, meetingDate)))
      .orderBy(desc(schema.simpleReports.meetingDate)).limit(1),
    db.select({ headline: schema.decisions.headline, answer: schema.decisions.answer, outcome: schema.decisions.outcome })
      .from(schema.decisions)
      .where(and(eq(schema.decisions.tenantId, tenantId), gte(schema.decisions.decidedAt, weekAgo))),
    db.select({ date: schema.meetings.date, actions: schema.meetings.actions, type: schema.meetings.type })
      .from(schema.meetings).where(eq(schema.meetings.tenantId, tenantId)),
    db.select({ kind: schema.switchFriction.kind, note: schema.switchFriction.note, month: schema.switchFriction.month })
      .from(schema.switchFriction)
      .where(and(eq(schema.switchFriction.tenantId, tenantId), gte(schema.switchFriction.createdAt, weekAgo))),
    relevantAreas(tenantId),
    businessCounts(tenantId),
  ]);
  const previous = prevRow[0] ? parseReport(prevRow[0].body) : null;

  // Last report's accepted fixes — actions SPEC raised, on meetings since that report.
  const since = previous ? mondayOf(previous.meetingDate) : mondayOf(weekAgo);
  const tracked = meetings.filter(m => m.type === 'sog' && m.date >= since)
    .flatMap(m => actionsOf({ id: '', date: m.date, minutes: null, actions: m.actions, attendees: null, decisions: null }))
    .filter(a => a.source?.startsWith('simple:'))
    .map(a => ({ text: a.text, owner: a.owner, done: a.done }));

  // What is ready to switch, or under way — the Switch when ready cards' own readings.
  const readings = await Promise.all(areas.map(a => switchReading(tenantId, a, counts)));
  const ready: { area: string; line: string; href: string }[] = readings
    .filter(r => r.rec.kind === 'recommend' || r.row)
    .map(r => ({
      area: r.area.key,
      line: r.rec.kind === 'recommend' ? `Ready: ${r.rec.headline}` : r.rec.headline,
      href: `/switch?area=${r.area.key}`,
    }));
  const waiting = readings.filter(r => !r.row && r.rec.kind === 'missing').map(r => `${productName(r.area)} for your ${r.area.noun}`);
  if (waiting.length && !ready.length) {
    ready.push({ area: 'none', line: `Not ready to switch yet: ${waiting.join(', ')}. We’ll tell you when.`, href: '/switch' });
  }

  const report = buildReport({
    meetingDate, now, schedule: scheduleLine(day, time), signals,
    previous,
    done: done.filter(d => d.answer === 'yes' && d.outcome === 'done' && !d.headline.startsWith('Sorted')),
    tracked, ready, friction,
  });
  await db.insert(schema.simpleReports).values({
    id: randomUUID(), tenantId, meetingDate, body: JSON.stringify(report), createdAt: now.toISOString(),
  }).onConflictDoNothing();
}

/**
 * A fix accepted in the meeting: an action with its owner on this week's meeting, marked as raised
 * by Make it simple so next week's report can track it to done.
 */
export async function addMeetingAction(tenantId: string, text: string, owner: string, source: string): Promise<void> {
  const weekOf = mondayOf(new Date().toISOString());
  const rows = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, tenantId)))
    .filter(m => m.type === 'sog' && mondayOf(m.date) === weekOf);
  let row = rows[0];
  if (!row) {
    const id = randomUUID();
    await db.insert(schema.meetings).values({ id, tenantId, type: 'sog', date: new Date().toISOString().slice(0, 10) });
    row = (await db.select().from(schema.meetings).where(and(eq(schema.meetings.id, id), eq(schema.meetings.tenantId, tenantId))))[0];
  }
  const due = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
  const next = [...actionsOf(row), { id: randomUUID(), text, owner, due, done: false, pillar: null, source }];
  await db.update(schema.meetings).set({ actions: JSON.stringify(next) })
    .where(and(eq(schema.meetings.id, row.id), eq(schema.meetings.tenantId, tenantId)));
}

export { NO_SIGNALS };
