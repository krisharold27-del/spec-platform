'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { LAST_DAY } from '@/lib/last-day';
import { getScope } from '@/lib/scope';
import { assertWritable } from '@/lib/plan';
import { PILLARS } from '@/lib/scoring';
import { STAGES } from '@/lib/people';
import { refuseTo, backTo } from '@/lib/refuse';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { isCheckKind, mayBook } from '@/lib/subbies';
import { isSeatKind } from '@/lib/onboarding';
import { draftContract, mayTake, lastPayWeek, FAIR_PROCESS } from '@/lib/hr';
import { isRecordKind, parseSteps, checkHours, mayExport } from '@/lib/hr-records';
import type { Pillar } from '@/lib/scoring';
import { directoryPerson, mayEditContact, staffOfUser } from '@/lib/directory-data';
import { contactField, isoDay } from '@/lib/directory';

/**
 * Hiring against a role.
 *
 * Everything here hangs off a role on the chart, which is the point: a vacancy is a hole in the
 * structure before it is a job ad, and a candidate is somebody being considered for a defined job
 * rather than a CV in a pile.
 */
async function manager(roleId?: string) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  if (roleId) {
    const scope = await getScope(user);
    if (!scope.canEdit(roleId)) refuseTo('/people', 'That role is outside your part of the chart.');
  }
  return user;
}

export async function addCandidate(formData: FormData) {
  const roleId = String(formData.get('roleId') ?? '');
  const user = await manager(roleId);
  const name = String(formData.get('name') ?? '').trim();
  if (!name || !roleId) return;

  await db.insert(schema.candidates).values({
    id: randomUUID(), tenantId: user.tenantId, roleId, name,
    stage: 'applied', createdAt: new Date().toISOString(),
  });
  revalidatePath('/people');
}

/** Move somebody along. The stage list is fixed — a business cannot invent a seventh. */
export async function setStage(formData: FormData) {
  const user = await manager();
  const id = String(formData.get('candidateId') ?? '');
  const stage = String(formData.get('stage') ?? '');
  if (!id || !STAGES.some(s => s.key === stage)) return;

  // The id comes from a form anybody can edit: it has to be this business's own candidate, for a
  // role inside this person's scope.
  const [candidate] = await db.select().from(schema.candidates)
    .where(and(eq(schema.candidates.id, id), eq(schema.candidates.tenantId, user.tenantId)));
  if (!candidate) return;
  const scope = await getScope(user);
  if (!scope.canEdit(candidate.roleId)) refuseTo('/people', 'That role is outside your part of the chart.');

  await db.update(schema.candidates).set({ stage }).where(eq(schema.candidates.id, id));
  revalidatePath('/people');
}

/**
 * Rate somebody against the four pillars the role is scored on.
 *
 * A blank stays blank rather than becoming a zero: an unrated pillar is an absence, exactly as an
 * unmarked KPI is, and a candidate rated on one pillar is not a bad candidate.
 */
export async function rateCandidate(formData: FormData) {
  const user = await manager();
  const id = String(formData.get('candidateId') ?? '');
  if (!id) return;

  const [candidate] = await db.select().from(schema.candidates)
    .where(and(eq(schema.candidates.id, id), eq(schema.candidates.tenantId, user.tenantId)));
  if (!candidate) return;
  const scope = await getScope(user);
  if (!scope.canEdit(candidate.roleId)) refuseTo('/people', 'That role is outside your part of the chart.');

  const ratings: Record<string, number> = {};
  for (const p of PILLARS) {
    const raw = String(formData.get(`rating:${p}`) ?? '').trim();
    if (!raw) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 5) ratings[p] = Math.round(n);
  }

  await db.update(schema.candidates)
    .set({ ratings: Object.keys(ratings).length ? JSON.stringify(ratings) : null })
    .where(eq(schema.candidates.id, id));
  revalidatePath('/people');
}

/**
 * Who a record belongs to, from one form field.
 *
 * The dropdown offers people and roles in the same list, because that is how somebody thinks about
 * it — "Tom's white card" and "the site supervisor's insurance" are the same kind of sentence. The
 * prefix keeps them apart without a second question.
 *
 * Anything unrecognised returns nothing rather than guessing, so a tampered form writes a row
 * belonging to nobody instead of quietly attaching it to the wrong person.
 */
function holderFrom(raw: string): { staffId?: string; userId?: string; roleId?: string } {
  const [kind, id] = raw.split(':');
  if (!id) return {};
  if (kind === 'staff') return { staffId: id };
  if (kind === 'user') return { userId: id };
  if (kind === 'role') return { roleId: id };
  return {};
}

/**
 * Record a document or obligation.
 *
 * An empty expiry is kept as null on purpose: plenty of things do not expire, and a date SPEC
 * invented would either block somebody who is fine or clear somebody who is not. Both are worse
 * than an honest "does not expire".
 */
export async function addObligation(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const what = String(formData.get('what') ?? '').trim().slice(0, 120);
  if (!what) return;
  const holder = holderFrom(String(formData.get('holder') ?? ''));

  // A role must be one this person can actually see; a person must belong to this business. The
  // ids arrive from the client, so neither is taken on trust.
  if (holder.roleId) {
    const scope = await getScope(user);
    if (!scope.canSee(holder.roleId)) refuseTo('/people', 'That role is not yours to hold a record against.');
  }
  if (holder.userId) {
    const [row] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.id, holder.userId), eq(schema.users.tenantId, user.tenantId)));
    if (!row) refuseTo('/people', 'That person is not in this business.');
  }
  if (holder.staffId) {
    const [row] = await db.select({ id: schema.staff.id }).from(schema.staff)
      .where(and(eq(schema.staff.id, holder.staffId), eq(schema.staff.tenantId, user.tenantId)));
    if (!row) refuseTo('/people', 'That person is not in this business.');
  }

  await db.insert(schema.obligations).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    what,
    ...holder,
    expiresAt: String(formData.get('expiresAt') ?? '').trim() || null,
    evidence: String(formData.get('evidence') ?? '').trim().slice(0, 200) || null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/people');
}

/**
 * Book somebody away.
 *
 * Entered as `requested` even when a manager types it, so the approval is a real act with a name
 * against it rather than something that happened because of who was at the keyboard. A date pair
 * the wrong way round is silently corrected — a person who typed the end first meant the range they
 * typed, and refusing it teaches nothing.
 */
export async function bookLeave(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const holder = holderFrom(String(formData.get('person') ?? ''));
  if (!holder.staffId && !holder.userId) return;
  const a = String(formData.get('fromDate') ?? '').slice(0, 10);
  const b = String(formData.get('toDate') ?? '').slice(0, 10);
  if (!a || !b) return;
  const [fromDate, toDate] = a <= b ? [a, b] : [b, a];

  const kind = String(formData.get('kind') ?? 'annual');
  await db.insert(schema.leaveEntries).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    staffId: holder.staffId ?? null,
    userId: holder.userId ?? null,
    kind: ['annual', 'sick', 'unpaid', 'parental', 'other'].includes(kind) ? kind : 'other',
    fromDate, toDate,
    state: 'requested',
    coveredBy: String(formData.get('coveredBy') ?? '').trim().slice(0, 120) || null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/people');
}

/**
 * Approve or decline a booking.
 *
 * A decline is a real outcome, not a request left open: it keeps the name and the date exactly as
 * an approval does, and the row stays visible so nobody has to remember the conversation.
 */
export async function decideLeave(formData: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);

  const id = String(formData.get('id') ?? '');
  const state = String(formData.get('state') ?? '');
  if (!id || !['approved', 'declined'].includes(state)) return;

  await db.update(schema.leaveEntries)
    .set({ state, decidedBy: user.name, decidedAt: new Date().toISOString() })
    .where(and(eq(schema.leaveEntries.id, id), eq(schema.leaveEntries.tenantId, user.tenantId)));
  revalidatePath('/people');
}

/* ── The staff list ────────────────────────────────────────────────────────────────────────────── */

/**
 * A person's phone, email and start date, from the staff list.
 *
 * Not `requireManager`: anybody may keep their own number right. Who may change whose is decided in
 * one place — `mayEditContact` in lib/directory-data — and re-checked here against the list as the
 * server reads it, never against anything the form says about the person.
 *
 * A login's email is its sign-in address and is never changed from here; an email is only kept
 * for somebody without a login yet, where it is also the address their invitation will offer.
 */
export async function saveStaffContact(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  await assertWritable(user.tenantId);

  const key = String(formData.get('key') ?? '').slice(0, 80);
  const q = String(formData.get('q') ?? '').slice(0, 80);
  const back: (cannot?: string) => never = cannot => {
    const sp = new URLSearchParams({ mode: 'staff' });
    if (q) sp.set('q', q);
    if (cannot) sp.set('cannot', cannot);
    redirect(`/people?${sp.toString()}`);
  };

  const { person, scope, selfKey } = await directoryPerson(user, key);
  if (!person) back('That person is not in this business.');
  if (!mayEditContact(person, user, scope, selfKey)) back('Only the person themselves, or somebody they report to, can change their details.');

  const phone = contactField(formData.get('phone'), 40);
  const rawStart = String(formData.get('startDate') ?? '').trim();
  const startDate = isoDay(rawStart);
  if (rawStart && !startDate) back('That start date is not a day.');

  if (person.userId) {
    await db.update(schema.users).set({ phone, startDate })
      .where(and(eq(schema.users.id, person.userId), eq(schema.users.tenantId, user.tenantId)));
    // Keep the staff row they were invited from in step, so the two never say different things.
    const row = await staffOfUser(user.tenantId, person.userId);
    if (row) {
      await db.update(schema.staff).set({ phone, startDate })
        .where(and(eq(schema.staff.id, row.id), eq(schema.staff.tenantId, user.tenantId)));
    }
  } else if (person.staffId) {
    const email = contactField(formData.get('email'), 160);
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) back('That email is not an address.');
    await db.update(schema.staff).set({ phone, email, startDate })
      .where(and(eq(schema.staff.id, person.staffId), eq(schema.staff.tenantId, user.tenantId)));
  }
  revalidatePath('/people');
  back();
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * The file held on a person: contract, conduct, and the pay run
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

const txt = (f: FormData, k: string, max = 300) => String(f.get(k) ?? '').trim().slice(0, max);
const stamp = () => new Date().toISOString();
const refreshPeople = () => { for (const p of ['/people', '/compliance', '/my-page']) revalidatePath(p); };

/**
 * Draft a contract from the role, or open a conduct process.
 *
 * SPEC writes what it knows — the title, who it reports to, the start date, what the role is
 * measured on — and leaves pay, the award and the level marked for the business. It never invents
 * a number it does not hold.
 */
export async function openRecord(form: FormData) {
  const user = await manager();
  const kind = txt(form, 'kind', 20);
  const personName = txt(form, 'personName', 120);
  if (!isRecordKind(kind) || !personName) return;

  const roleId = txt(form, 'roleId', 64);
  let body = txt(form, 'body', 4000);

  if (kind === 'contract' && roleId) {
    const scope = await getScope(user);
    const role = scope.roles.find(r => r.id === roleId);
    if (role) {
      const tenant = await getTenantById(user.tenantId);
      const criteria = await db.select().from(schema.criteria)
        .where(and(eq(schema.criteria.roleId, roleId), eq(schema.criteria.active, true)));
      body = draftContract({
        roleTitle: role.title,
        businessName: tenant?.name ?? 'the business',
        reportsTo: scope.roles.find(r => r.id === role.reportsToRoleId)?.title ?? null,
        person: personName,
        startDate: null,
        kpis: criteria.filter(c => c.kpi).map(c => ({ pillar: c.pillar as Pillar, text: c.text })),
      });
    }
  }

  const now = stamp();
  await db.insert(schema.peopleRecords).values({
    id: randomUUID(), tenantId: user.tenantId, kind, personName,
    roleId: roleId || null, body,
    state: kind === 'contract' ? 'draft' : 'open',
    createdAt: now, updatedAt: now,
  });
  refreshPeople();
}

/** Send it. Nothing is in force until the person accepts — the screen says so. */
export async function sendContract(form: FormData) {
  const user = await manager();
  const id = txt(form, 'id', 64);
  const [row] = await db.select().from(schema.peopleRecords)
    .where(and(eq(schema.peopleRecords.id, id), eq(schema.peopleRecords.tenantId, user.tenantId)));
  if (!row || row.kind !== 'contract') return;

  await db.update(schema.peopleRecords)
    .set({ state: 'sent', sentAt: stamp(), updatedAt: stamp() })
    .where(eq(schema.peopleRecords.id, id));
  refreshPeople();
}

/**
 * Record that the person accepted it.
 *
 * Deliberately not dressed up as a digital signature. A recorded acceptance with a timestamp and
 * the name of whoever recorded it is what SPEC can honestly provide, and claiming more evidentiary
 * weight than that carries would be worse than claiming none.
 */
export async function signContract(form: FormData) {
  const user = await manager();
  const id = txt(form, 'id', 64);
  const accepted = form.get('accepted') === 'on';
  const [row] = await db.select().from(schema.peopleRecords)
    .where(and(eq(schema.peopleRecords.id, id), eq(schema.peopleRecords.tenantId, user.tenantId)));
  if (!row || row.kind !== 'contract') return;

  await db.update(schema.peopleRecords).set({
    state: accepted ? 'signed' : 'declined',
    signedAt: accepted ? stamp() : null,
    signedBy: accepted ? user.id : null,
    updatedAt: stamp(),
  }).where(eq(schema.peopleRecords.id, id));
  refreshPeople();
}

/**
 * Take the next step of a fair process — and only ever the next one.
 *
 * `mayTake` refuses anything else. A step skipped is a process a tribunal can unpick, and being the
 * thing that will not let that happen by accident is the whole reason this is a system.
 */
export async function takeStep(form: FormData) {
  const user = await manager();
  const id = txt(form, 'id', 64);
  const step = Number(form.get('step'));
  const note = txt(form, 'note', 1000);

  const [row] = await db.select().from(schema.peopleRecords)
    .where(and(eq(schema.peopleRecords.id, id), eq(schema.peopleRecords.tenantId, user.tenantId)));
  if (!row || row.kind !== 'conduct') return;

  if (!mayTake(step, row.stepsDone)) {
    refuseTo('/people', 'That step is not the next one. A fair process is only fair in order.');
  }
  if (!note) {
    refuseTo('/people', 'Say what happened at this step. A step with nothing recorded is a step nobody can show was taken.');
  }

  const steps = parseSteps(row.steps);
  steps.push({ step, note, at: stamp() });

  await db.update(schema.peopleRecords).set({
    stepsDone: row.stepsDone + 1,
    steps: JSON.stringify(steps),
    reviewAt: txt(form, 'reviewAt', 10) || row.reviewAt,
    state: row.stepsDone + 1 >= FAIR_PROCESS.length ? 'closed' : 'open',
    updatedAt: stamp(),
  }).where(eq(schema.peopleRecords.id, id));
  refreshPeople();
}

/**
 * Open the pay run for the week just finished, from the hours SPEC already holds, and check it.
 *
 * Before it goes, never after. A check that runs afterwards finds underpayments that have already
 * been made, which is a different and more expensive problem.
 */
export async function runPayCheck() {
  const user = await manager();
  const { from, to } = lastPayWeek(new Date());

  const entries = await db.select().from(schema.timesheetEntries)
    .where(eq(schema.timesheetEntries.tenantId, user.tenantId));
  const week = entries.filter(e => e.day >= from && e.day <= to);

  const byPerson = new Map<string, { minutes: number; jobs: Set<string> }>();
  for (const e of week) {
    const who = e.personName || 'Unnamed';
    const seen = byPerson.get(who) ?? { minutes: 0, jobs: new Set<string>() };
    seen.minutes += e.minutes;
    if (e.jobId) seen.jobs.add(e.jobId);
    byPerson.set(who, seen);
  }
  const rows = [...byPerson].map(([who, v]) => ({ who, minutes: v.minutes, jobs: v.jobs.size }));
  const issues = checkHours(rows);

  const now = stamp();
  const [existing] = await db.select().from(schema.payRuns)
    .where(and(eq(schema.payRuns.tenantId, user.tenantId), eq(schema.payRuns.fromDate, from)));

  if (existing) {
    await db.update(schema.payRuns).set({
      rows: JSON.stringify(rows), issues: JSON.stringify(issues),
      checkedAt: now, checkedBy: user.id,
    }).where(eq(schema.payRuns.id, existing.id));
  } else {
    await db.insert(schema.payRuns).values({
      id: randomUUID(), tenantId: user.tenantId, fromDate: from, toDate: to,
      rows: JSON.stringify(rows), issues: JSON.stringify(issues),
      checkedAt: now, checkedBy: user.id, createdAt: now,
    });
  }
  refreshPeople();
}

/**
 * Send the run to the accounting system.
 *
 * Refused until somebody has run the check. Not until there are no issues — a long week is often
 * correct and correctly paid, and blocking on that would teach people to stop recording overtime.
 * What must not happen is a run going out that nobody looked at.
 */
export async function exportPayRun(form: FormData) {
  const user = await manager();
  const id = txt(form, 'id', 64);
  const [run] = await db.select().from(schema.payRuns)
    .where(and(eq(schema.payRuns.id, id), eq(schema.payRuns.tenantId, user.tenantId)));
  if (!run) return;

  if (!mayExport(run)) {
    refuseTo('/people', 'Check it against the award before it goes. A check that runs afterwards finds underpayments already made.');
  }
  await db.update(schema.payRuns).set({ exportedAt: stamp() })
    .where(eq(schema.payRuns.id, id));
  refreshPeople();
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Subcontractors — design 17
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Invite a subcontractor to set themselves up.
 *
 * A business name and a mobile, which is all anybody has when they decide to use somebody. The six
 * checks come from them, on their phone — asking the office to collect six certificates on a
 * subbie's behalf is how a business ends up with none of them.
 */
export async function inviteSubbie(form: FormData) {
  const user = await manager();
  const business = txt(form, 'business', 160);
  const mobile = txt(form, 'mobile', 40);
  if (!business) refuseTo('/people?mode=subbies', 'A subcontractor needs a business name.');
  if (!mobile) refuseTo('/people?mode=subbies', 'A mobile is how they get the link to set themselves up.');

  await db.insert(schema.subcontractors).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    business,
    contact: txt(form, 'contact', 120),
    mobile,
    status: 'invited',
    invitedAt: stamp(),
    createdAt: stamp(),
  });
  revalidatePath('/people');
  redirect('/people?mode=subbies');
}

/**
 * Record one of the six checks against a subcontractor.
 *
 * The check is stored with its own expiry, because each one lapses on its own date — which is why
 * this is a row per check rather than six columns on the subbie. A check that expires is what stops
 * them being booked, and `mayBook` reads the DATE rather than this state, so a certificate recorded
 * as current in March stops counting in October without anybody touching it.
 */
export async function recordSubbieCheck(form: FormData) {
  const user = await manager();
  const subbieId = txt(form, 'subbieId', 64);
  const kind = txt(form, 'kind', 32);
  if (!isCheckKind(kind)) refuseTo('/people?mode=subbies', 'SPEC does not know that check.');

  const [subbie] = await db.select({ id: schema.subcontractors.id })
    .from(schema.subcontractors)
    .where(and(eq(schema.subcontractors.id, subbieId), eq(schema.subcontractors.tenantId, user.tenantId)));
  if (!subbie) refuseTo('/people?mode=subbies', 'That subcontractor is not in this business.');

  const expiresAt = txt(form, 'expiresAt', 10) || null;
  const [existing] = await db.select({ id: schema.subbieChecks.id })
    .from(schema.subbieChecks)
    .where(and(
      eq(schema.subbieChecks.tenantId, user.tenantId),
      eq(schema.subbieChecks.subbieId, subbieId),
      eq(schema.subbieChecks.kind, kind),
    ));

  if (existing) {
    await db.update(schema.subbieChecks)
      .set({ expiresAt, state: 'current', updatedAt: stamp() })
      .where(eq(schema.subbieChecks.id, existing.id));
  } else {
    await db.insert(schema.subbieChecks).values({
      id: randomUUID(),
      tenantId: user.tenantId,
      subbieId,
      kind,
      expiresAt,
      state: 'current',
      updatedAt: stamp(),
    });
  }

  /*
    Once all six are in they are working, not onboarding. Worked out from the checks rather than
    set by anybody, so the status can never disagree with what the checks say.
  */
  const checks = await db.select({
    kind: schema.subbieChecks.kind, expiresAt: schema.subbieChecks.expiresAt, state: schema.subbieChecks.state,
  }).from(schema.subbieChecks)
    .where(and(eq(schema.subbieChecks.tenantId, user.tenantId), eq(schema.subbieChecks.subbieId, subbieId)));

  if (mayBook(checks, new Date().toISOString().slice(0, 10)).ok) {
    await db.update(schema.subcontractors).set({ status: 'active' })
      .where(eq(schema.subcontractors.id, subbieId));
  }

  revalidatePath('/people');
  redirect('/people?mode=subbies');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Setting everybody up — the list worked down once, before anybody is charged
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** The person, confirmed to be in this business. Every action below starts here. */
async function ownStaff(tenantId: string, staffId: string) {
  const [row] = await db.select().from(schema.staff)
    .where(and(eq(schema.staff.id, staffId), eq(schema.staff.tenantId, tenantId)));
  return row ?? null;
}

const backToSetup = () => {
  revalidatePath('/people');
  redirect('/people?mode=setup');
};

/**
 * Team member or leadership.
 *
 * Written to the STAFF row, and to their account as well when they have one — because billing reads
 * `users.seatKindOverride` and the two must never disagree about the same person. Before anybody is
 * invited the staff row is the only place it can live, which is the whole reason this screen exists.
 */
export async function setSeatKind(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const kind = txt(form, 'seatKind', 20);
  if (!isSeatKind(kind)) refuseTo('/people?mode=setup', 'SPEC does not know that kind of seat.');

  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=setup', 'That person is not in this business.');

  await db.update(schema.staff).set({ seatKind: kind }).where(eq(schema.staff.id, staffId));
  if (person.userId) {
    await db.update(schema.users).set({ seatKindOverride: kind })
      .where(and(eq(schema.users.id, person.userId), eq(schema.users.tenantId, user.tenantId)));
  }
  backToSetup();
}

/**
 * A subcontractor, ticked on the same list as everybody else.
 *
 * Kris's correction of 24 September is what makes this a tick rather than a separate register:
 * subbies are people working for the business, held to the full expectation, on a paid team seat.
 * A separate list would say the opposite of that.
 */
export async function setSubcontractor(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=setup', 'That person is not in this business.');

  await db.update(schema.staff).set({ isSubcontractor: txt(form, 'on', 4) === '1' })
    .where(eq(schema.staff.id, staffId));
  backToSetup();
}

/**
 * Their company email, and their role.
 *
 * The email is the login — it signs them in, receives the sign-in link and recovers the account —
 * so a personal address is worth saying something about. It is SAVED either way: a business
 * part-way through a rollout has people on a personal address today, and a screen that refuses is
 * a screen they stop filling in. The warning is on the page beside the field.
 */
export async function savePersonDetail(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=setup', 'That person is not in this business.');

  const email = txt(form, 'email', 320).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    refuseTo('/people?mode=setup', 'That does not look like an email address.');
  }
  if (email) {
    await db.update(schema.staff).set({ email }).where(eq(schema.staff.id, staffId));
  }

  /* A role, when one was picked. Moving somebody is an assignment, not a column on the person. */
  const roleId = txt(form, 'roleId', 64);
  if (roleId) {
    const [role] = await db.select({ id: schema.roles.id }).from(schema.roles)
      .where(and(eq(schema.roles.id, roleId), eq(schema.roles.tenantId, user.tenantId)));
    if (!role) refuseTo('/people?mode=setup', 'That role is not in this business.');

    const today = new Date().toISOString().slice(0, 10);
    await db.update(schema.roleAssignments)
      .set({ toDate: today })
      .where(and(eq(schema.roleAssignments.staffId, staffId), isNull(schema.roleAssignments.toDate)));
    await db.insert(schema.roleAssignments).values({
      id: randomUUID(), roleId, staffId, fromDate: today,
    });
  }
  backToSetup();
}

/**
 * A licence or ticket, with the date it runs out.
 *
 * The expiry is the point of the row. A licence with no date is a licence nobody will ever be
 * warned about, so it is asked for — but not required, because a business with the certificate in
 * front of it and no date on it should still be able to record that it exists.
 */
export async function addLicence(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=setup', 'That person is not in this business.');

  const what = txt(form, 'what', 120);
  if (!what) refuseTo('/people?mode=setup', 'Say what the licence or ticket is.');

  await db.insert(schema.obligations).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    what,
    staffId,
    userId: person.userId ?? null,
    roleId: null,
    expiresAt: txt(form, 'expiresAt', 10) || null,
    evidence: null,
    createdAt: stamp(),
  });
  backToSetup();
}

/** Their induction. One of the two things that decide whether somebody can be sent to a job. */
export async function markInducted(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=setup', 'That person is not in this business.');

  await db.update(schema.staff).set({ inductedAt: new Date().toISOString().slice(0, 10) })
    .where(eq(schema.staff.id, staffId));
  backToSetup();
}

/**
 * The link this person opens on their phone to finish their own record.
 *
 * ── Why a new token every time ───────────────────────────────────────────────────────────────────
 *
 * Pressing it again is what somebody does when the first text went to the wrong number. Reusing the
 * token would leave the wrong phone holding a working link to a person's record, so each press
 * issues a fresh one and the old one stops working. That is the behaviour somebody expects from
 * "send it again" even though they would never think to ask for it.
 */
export async function sendSetupLink(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=setup', 'That person is not in this business.');

  await db.update(schema.staff).set({ setupToken: randomBytes(16).toString('hex') })
    .where(eq(schema.staff.id, staffId));
  backToSetup();
}

/* ── Somebody leaves ─────────────────────────────────────────────────────────────────────────── */

/**
 * Record a last day, which is what starts the list.
 *
 * SPEC closes nothing by itself. Final pay, tools and access are decisions with consequences —
 * somebody on gardening leave still has a login on purpose, and a tool written off is a
 * conversation rather than a tick. The job here is to make sure nobody has to REMEMBER.
 */
export async function recordLastDay(form: FormData) {
  const user = await manager();
  const staffId = txt(form, 'staffId', 64);
  const person = await ownStaff(user.tenantId, staffId);
  if (!person) refuseTo('/people?mode=leavers', 'That person is not in this business.');

  const lastDay = txt(form, 'lastDay', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) refuseTo('/people?mode=leavers', 'When was their last day?');

  await db.insert(schema.leavers).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    staffId,
    name: person.name,
    lastDay,
    done: '',
    createdAt: stamp(),
  });
  backTo('/people?mode=leavers');
}

/** Tick one thing off somebody's last-day list. */
export async function tickLastDay(form: FormData) {
  const user = await manager();
  const id = txt(form, 'leaverId', 64);
  const key = txt(form, 'key', 40);
  if (!LAST_DAY.some(i => i.key === key)) refuseTo('/people?mode=leavers', 'SPEC does not know that step.');

  const [row] = await db.select().from(schema.leavers)
    .where(and(eq(schema.leavers.id, id), eq(schema.leavers.tenantId, user.tenantId)));
  if (!row) refuseTo('/people?mode=leavers', 'That is not in this business.');

  const done = new Set(row.done.split(',').filter(Boolean));
  done.add(key);
  await db.update(schema.leavers).set({ done: [...done].join(',') })
    .where(eq(schema.leavers.id, id));
  backTo('/people?mode=leavers');
}
