'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { assertWritable } from '@/lib/plan';
import { getScope } from '@/lib/scope';
import { refuseTo } from '@/lib/refuse';
import {
  isReportKind, isSeverity, isCheckKind, looksNotifiable, stateCode, canSeeReport, anonymise,
} from '@/lib/safety';
import { ownerFor, viewerFor } from '@/lib/safety-data';

/**
 * Safety — every write on `/safety`.
 *
 * Reporting is open to everybody with a seat, read-only included: telling SPEC about an exposed
 * cable is not managing anybody, and a report box that only managers can use is a report box the
 * people on site never see. Everything after the report — owners, dates, closing it, the on-site
 * records, claims and tickets — is a manager's, and every id that arrives from a form is checked
 * against this business and against what this person may see before it is touched.
 */

const SCREEN = '/safety';
const today = () => new Date().toISOString().slice(0, 10);
const field = (fd: FormData, name: string, max = 200) => String(fd.get(name) ?? '').trim().slice(0, max);
const dateField = (fd: FormData, name: string) => {
  const v = field(fd, name, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
const countField = (fd: FormData, name: string) => {
  const raw = field(fd, name, 6);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 999) : null;
};

/** Anybody signed in to a business that can still write. */
async function member() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);
  return user;
}

/** A manager, in a business that can still write. */
async function manager() {
  const user = await member();
  if (!canManage(user.access)) refuseTo(SCREEN, 'Only a manager can change the register. Anybody can report.');
  return user;
}

/** A report in this business that this person may see — or a refusal, never a guess. */
async function reportFor(user: Awaited<ReturnType<typeof member>>, id: string) {
  if (!id) refuseTo(SCREEN, 'That report could not be found.');
  const [row] = await db.select().from(schema.safetyReports)
    .where(and(eq(schema.safetyReports.id, id), eq(schema.safetyReports.tenantId, user.tenantId)));
  if (!row) refuseTo(SCREEN, 'That report could not be found.');
  const scope = await getScope(user);
  if (!canSeeReport(row, viewerFor(user, scope))) refuseTo(SCREEN, 'That report is outside your part of the chart.');
  return row;
}

/**
 * One line from somebody on site.
 *
 * Whether it looks notifiable is decided HERE, at the moment of sending, and kept on the row — the
 * prompt the person saw is part of the record, whatever anybody decides about it later.
 *
 * An anonymous wellbeing report is written through `anonymise`, so there is no path by which the
 * reporter, their role, their job or the minute they sent it reaches the table.
 */
export async function sendReport(formData: FormData) {
  const user = await member();
  const kind = String(formData.get('kind') ?? '');
  const text = field(formData, 'text', 1000);
  if (!isReportKind(kind)) refuseTo(SCREEN, 'Pick what kind of report it is first.');
  if (!text) refuseTo(SCREEN, 'Write one line about what happened, then send it.');

  const scope = await getScope(user);
  const anonymous = kind === 'wellbeing' && formData.get('named') !== 'on';
  const now = new Date().toISOString();

  const named = {
    reportedBy: user.id,
    roleId: scope.myRoleId,
    jobRef: field(formData, 'jobRef', 80) || null,
    createdAt: now,
  };
  const who = anonymous ? anonymise(named) : named;

  const id = randomUUID();
  await db.insert(schema.safetyReports).values({
    id,
    tenantId: user.tenantId,
    kind,
    text,
    ...who,
    anonymous,
    notifiable: looksNotifiable(kind, text),
    state: stateCode(formData.get('state')),
    owner: ownerFor(scope, kind),
    status: 'open',
  });
  revalidatePath(SCREEN);
  redirect(`${SCREEN}?sent=${id}`);
}

/**
 * Which state the site is in — asked only when a report looks notifiable, and only once: the
 * register remembers it, and the next notifiable report names the regulator straight away.
 */
export async function setReportState(formData: FormData) {
  const user = await member();
  const report = await reportFor(user, field(formData, 'id', 64));
  const state = stateCode(formData.get('state'));
  if (!state) refuseTo(SCREEN, 'Pick the state or territory the site is in.');
  // The person who sent it, or a manager who can see it. Nobody else re-files somebody's report.
  if (report.reportedBy !== user.id && !canManage(user.access)) {
    refuseTo(SCREEN, 'Only the person who sent it or a manager can change where it happened.');
  }
  await db.update(schema.safetyReports).set({ state })
    .where(and(eq(schema.safetyReports.id, report.id), eq(schema.safetyReports.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
  redirect(`${SCREEN}?sent=${report.id}`);
}

/** Owner, fix-by date and — for an injury — how serious it was. SPEC proposed the owner; this edits it. */
export async function updateReport(formData: FormData) {
  const user = await manager();
  const report = await reportFor(user, field(formData, 'id', 64));
  const severity = String(formData.get('severity') ?? '');
  await db.update(schema.safetyReports).set({
    owner: field(formData, 'owner', 120) || null,
    dueAt: dateField(formData, 'dueAt'),
    ...(report.kind === 'injury' && isSeverity(severity) ? { severity } : {}),
  }).where(and(eq(schema.safetyReports.id, report.id), eq(schema.safetyReports.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
}

/** Fixed, or dealt with. Closing keeps the row: the register is the history. */
export async function closeReport(formData: FormData) {
  const user = await manager();
  const report = await reportFor(user, field(formData, 'id', 64));
  const reopen = formData.get('reopen') === 'on';
  await db.update(schema.safetyReports)
    .set(reopen ? { status: 'open', closedAt: null } : { status: 'closed', closedAt: new Date().toISOString() })
    .where(and(eq(schema.safetyReports.id, report.id), eq(schema.safetyReports.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
}

/** The regulator was told. A date and a name are the evidence; SPEC never contacts anybody itself. */
export async function markRegulatorTold(formData: FormData) {
  const user = await manager();
  const report = await reportFor(user, field(formData, 'id', 64));
  await db.update(schema.safetyReports)
    .set({ regulatorToldAt: dateField(formData, 'toldAt') ?? today(), notifiable: true })
    .where(and(eq(schema.safetyReports.id, report.id), eq(schema.safetyReports.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
}

// ── Corrective actions ───────────────────────────────────────────────────────────────────────────

export async function addAction(formData: FormData) {
  const user = await manager();
  const text = field(formData, 'text', 300);
  if (!text) refuseTo(SCREEN, 'Say what will stop it happening again.');
  const reportId = field(formData, 'reportId', 64);
  if (reportId) await reportFor(user, reportId);
  await db.insert(schema.safetyActions).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    reportId: reportId || null,
    text,
    owner: field(formData, 'owner', 120) || null,
    dueAt: dateField(formData, 'dueAt'),
    createdBy: user.name,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(SCREEN);
}

export async function completeAction(formData: FormData) {
  const user = await manager();
  const id = field(formData, 'id', 64);
  await db.update(schema.safetyActions).set({ doneAt: new Date().toISOString() })
    .where(and(eq(schema.safetyActions.id, id), eq(schema.safetyActions.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
}

// ── On site ──────────────────────────────────────────────────────────────────────────────────────

export async function addCheck(formData: FormData) {
  const user = await manager();
  const kind = String(formData.get('kind') ?? '');
  const title = field(formData, 'title', 160);
  if (!isCheckKind(kind)) refuseTo(SCREEN, 'That is not a kind of check SPEC keeps.');
  if (!title) refuseTo(SCREEN, 'Give it a name — the talk, the SWMS, the site or the vehicle.');
  const result = String(formData.get('result') ?? 'due');
  await db.insert(schema.safetyChecks).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    kind,
    title,
    place: field(formData, 'place', 120) || null,
    person: field(formData, 'person', 120) || null,
    onDate: dateField(formData, 'onDate'),
    result: ['due', 'done', 'passed', 'failed'].includes(result) ? result : 'due',
    signed: countField(formData, 'signed'),
    expected: countField(formData, 'expected'),
    createdBy: user.name,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(SCREEN);
}

/** A result or a sign-on count, recorded against a check already on the list. */
export async function updateCheck(formData: FormData) {
  const user = await manager();
  const id = field(formData, 'id', 64);
  const result = String(formData.get('result') ?? '');
  const signed = countField(formData, 'signed');
  await db.update(schema.safetyChecks).set({
    ...(['due', 'done', 'passed', 'failed'].includes(result) ? { result, onDate: today() } : {}),
    ...(signed !== null ? { signed } : {}),
  }).where(and(eq(schema.safetyChecks.id, id), eq(schema.safetyChecks.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
}

// ── Workers' comp and return to work ─────────────────────────────────────────────────────────────

export async function addClaim(formData: FormData) {
  const user = await manager();
  const worker = field(formData, 'worker', 120);
  if (!worker) refuseTo(SCREEN, 'Name the worker the claim is for.');
  const reportId = field(formData, 'reportId', 64);
  if (reportId) await reportFor(user, reportId);
  await db.insert(schema.safetyClaims).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    reportId: reportId || null,
    worker,
    caseOwner: field(formData, 'caseOwner', 120) || user.name,
    lodgedAt: dateField(formData, 'lodgedAt') ?? today(),
    insurerToldAt: dateField(formData, 'insurerToldAt'),
    dutiesWeek: countField(formData, 'dutiesWeek'),
    dutiesWeeks: countField(formData, 'dutiesWeeks'),
    status: 'open',
    createdAt: new Date().toISOString(),
  });
  revalidatePath(SCREEN);
}

export async function updateClaim(formData: FormData) {
  const user = await manager();
  const id = field(formData, 'id', 64);
  const close = formData.get('close') === 'on';
  const week = countField(formData, 'dutiesWeek');
  const weeks = countField(formData, 'dutiesWeeks');
  await db.update(schema.safetyClaims).set({
    ...(close ? { status: 'closed' } : {}),
    ...(week !== null ? { dutiesWeek: week } : {}),
    ...(weeks !== null ? { dutiesWeeks: weeks } : {}),
    ...(dateField(formData, 'insurerToldAt') ? { insurerToldAt: dateField(formData, 'insurerToldAt') } : {}),
  }).where(and(eq(schema.safetyClaims.id, id), eq(schema.safetyClaims.tenantId, user.tenantId)));
  revalidatePath(SCREEN);
}

// ── Clear to Work ────────────────────────────────────────────────────────────────────────────────

/**
 * A licence or ticket — into the same obligations table People keeps, so it is one record on two
 * screens and the Clear to Work gate reads it wherever it was entered. An empty expiry stays null:
 * SPEC never invents a date.
 */
export async function addTicket(formData: FormData) {
  const user = await manager();
  const what = field(formData, 'what', 120);
  if (!what) refuseTo(SCREEN, 'Name the licence or ticket.');
  const [kind, holderId] = String(formData.get('holder') ?? '').split(':');
  let holder: { userId?: string; staffId?: string } = {};
  if (kind === 'user' && holderId) {
    const [row] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.id, holderId), eq(schema.users.tenantId, user.tenantId)));
    if (!row) refuseTo(SCREEN, 'That person is not in this business.');
    holder = { userId: holderId };
  } else if (kind === 'staff' && holderId) {
    const [row] = await db.select({ id: schema.staff.id }).from(schema.staff)
      .where(and(eq(schema.staff.id, holderId), eq(schema.staff.tenantId, user.tenantId)));
    if (!row) refuseTo(SCREEN, 'That person is not in this business.');
    holder = { staffId: holderId };
  } else {
    refuseTo(SCREEN, 'Pick whose licence or ticket it is.');
  }
  await db.insert(schema.obligations).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    what,
    ...holder,
    expiresAt: dateField(formData, 'expiresAt'),
    evidence: field(formData, 'evidence', 200) || null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(SCREEN);
  revalidatePath('/people');
}
