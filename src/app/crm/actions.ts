'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { getScope, type Scope } from '@/lib/scope';
import type { CurrentUser } from '@/lib/auth';
import { createJob } from '@/lib/jobs-data';
import {
  ensureStages, visibleDeal, logEvent, mayShapePipeline, type DealRow,
} from '@/lib/crm-data';
import {
  toCents, moveRefusal, lostRefusal, jobFromDeal, isActivityKind, activityLabel, parseDueDate,
  parseProbability, parseRotDays, ownerOptions, DEFAULT_ROT_DAYS,
} from '@/lib/crm';

/**
 * Every write on the CRM screen.
 *
 * The same gate as Jobs — a manager, in a business that can be written to — and then the chart:
 * a deal may only be touched by somebody who can see it, which is its owner and the people above
 * them in their own line. Every id from a form is re-read with this business's tenant_id first.
 */

async function writer(): Promise<{ user: CurrentUser; scope: Scope }> {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return { user, scope: await getScope(user) };
}

function back(extra: Record<string, string> = {}, cannot?: string): never {
  const q = new URLSearchParams(extra);
  if (cannot) q.set('cannot', cannot);
  const s = q.toString();
  redirect(`/crm${s ? `?${s}` : ''}`);
}

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
const now = () => new Date().toISOString();
const tabOf = (f: FormData) => {
  const t = str(f, 'tab', 20);
  return ['deals', 'activities', 'people', 'organisations'].includes(t) ? t : 'deals';
};

async function setDeal(tenantId: string, id: string, values: Partial<typeof schema.crmDeals.$inferInsert>) {
  await db.update(schema.crmDeals).set(values)
    .where(and(eq(schema.crmDeals.id, id), eq(schema.crmDeals.tenantId, tenantId)));
}

/** The owner a form named, only if they are somebody on this person's part of the chart. */
function ownerFrom(scope: Scope, roleId: string) {
  return ownerOptions(scope.roles, scope.visible).find(o => o.roleId === roleId) ?? null;
}

/** The organisation a form picked, or one it named that the business does not have yet. */
async function organisationFrom(user: CurrentUser, f: FormData): Promise<string | null> {
  const id = str(f, 'organisationId');
  if (id) {
    const [org] = await db.select({ id: schema.crmOrganisations.id }).from(schema.crmOrganisations)
      .where(and(eq(schema.crmOrganisations.id, id), eq(schema.crmOrganisations.tenantId, user.tenantId)));
    if (org) return org.id;
  }
  const name = str(f, 'organisationName', 160);
  if (!name) return null;
  // Typing a name the business already has joins that one rather than making a second.
  const all = await db.select({ id: schema.crmOrganisations.id, name: schema.crmOrganisations.name })
    .from(schema.crmOrganisations).where(eq(schema.crmOrganisations.tenantId, user.tenantId));
  const match = all.find(o => o.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  const newId = randomUUID();
  await db.insert(schema.crmOrganisations).values({ id: newId, tenantId: user.tenantId, name, createdBy: user.name, createdAt: now() });
  return newId;
}

/** The person a form picked, or one it named — joined to the organisation when there is one. */
async function personFrom(user: CurrentUser, f: FormData, organisationId: string | null): Promise<string | null> {
  const id = str(f, 'personId');
  if (id) {
    const [p] = await db.select({ id: schema.crmPeople.id }).from(schema.crmPeople)
      .where(and(eq(schema.crmPeople.id, id), eq(schema.crmPeople.tenantId, user.tenantId)));
    if (p) return p.id;
  }
  const name = str(f, 'personName', 120);
  if (!name) return null;
  const newId = randomUUID();
  await db.insert(schema.crmPeople).values({
    id: newId, tenantId: user.tenantId, organisationId, name,
    email: str(f, 'personEmail', 160), phone: str(f, 'personPhone', 40), createdBy: user.name, createdAt: now(),
  });
  return newId;
}

/* ── Deals ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * A new deal. Nothing is required but what it is — the value can be "not priced yet", the client
 * can come later — and it lands in the first stage, owned by whoever added it unless they chose
 * somebody in their line.
 */
export async function addDeal(formData: FormData) {
  const { user, scope } = await writer();
  const title = str(formData, 'title', 160);
  if (!title) back({}, 'A deal needs to say what the work is — for example “Switchboard upgrade”.');
  const rawValue = str(formData, 'value', 20);
  const value = rawValue ? toCents(rawValue) : 0;
  if (value === null) back({}, 'That value is not a number of dollars.');

  const stages = await ensureStages(user.tenantId);
  const wantedStage = str(formData, 'stageId');
  const proposed = wantedStage.match(/^proposed-(\d+)$/);
  const stage = (proposed ? stages[Number(proposed[1])] : stages.find(s => s.id === wantedStage)) ?? stages[0];
  const owner = ownerFrom(scope, str(formData, 'ownerRoleId')) ?? ownerFrom(scope, scope.myRoleId ?? '');
  if (!owner && user.access !== 'administrator') back({}, 'Place yourself on the org chart first, so the deal has somebody to own it.');

  const organisationId = await organisationFrom(user, formData);
  const personId = await personFrom(user, formData, organisationId);
  const id = randomUUID();
  const at = now();
  await db.insert(schema.crmDeals).values({
    id, tenantId: user.tenantId, title, organisationId, personId, site: str(formData, 'site', 160),
    valueCents: value, stageId: stage.id, status: 'open',
    ownerRoleId: owner?.roleId ?? null, ownerName: owner?.name ?? user.name,
    expectedClose: parseDueDate(str(formData, 'expectedClose', 10)),
    createdBy: user.name, createdAt: at, stageAt: at,
  });
  await logEvent(user.tenantId, id, user.name, { kind: 'created', toStageId: stage.id });
  revalidatePath('/crm');
  back({ deal: id });
}

async function move(user: CurrentUser, deal: DealRow, toStageId: string): Promise<string | null> {
  const stages = await ensureStages(user.tenantId);
  const refusal = moveRefusal(deal, toStageId, stages);
  if (refusal) return refusal;
  if (deal.stageId === toStageId) return null;
  await setDeal(user.tenantId, deal.id, { stageId: toStageId, stageAt: now() });
  await logEvent(user.tenantId, deal.id, user.name, { kind: 'stage', fromStageId: deal.stageId, toStageId });
  revalidatePath('/crm');
  return null;
}

/**
 * Dragged onto another column. Called straight from the board, so it answers rather than
 * redirecting — the board puts the card back if the answer is no.
 */
export async function moveDealTo(dealId: string, toStageId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, String(dealId).slice(0, 64));
  if (!deal) return { ok: false, reason: 'That deal is not in your part of the chart.' };
  const refusal = await move(user, deal, String(toStageId).slice(0, 64));
  return refusal ? { ok: false, reason: refusal } : { ok: true };
}

/** The same move from a plain form — the keyboard and phone way, no dragging. */
export async function moveDeal(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  const refusal = await move(user, deal, str(formData, 'stageId'));
  back({ deal: deal.id }, refusal ?? undefined);
}

/**
 * Won. The deal closes and becomes a job in the Jobs pipeline at Won — through the same path a
 * typed enquiry takes, so it gets the next J-number and is booked, costed and invoiced there like any
 * other job. Pressing Won twice never makes two jobs.
 */
export async function markWon(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  if (deal.status === 'won' && deal.jobId) back({ deal: deal.id });
  if (deal.status === 'lost') back({ deal: deal.id }, 'That deal was marked lost. Reopen it first.');

  const [org] = deal.organisationId
    ? await db.select().from(schema.crmOrganisations)
        .where(and(eq(schema.crmOrganisations.id, deal.organisationId), eq(schema.crmOrganisations.tenantId, user.tenantId)))
    : [];
  const [person] = deal.personId
    ? await db.select().from(schema.crmPeople)
        .where(and(eq(schema.crmPeople.id, deal.personId), eq(schema.crmPeople.tenantId, user.tenantId)))
    : [];
  const carried = jobFromDeal(deal, org?.name ?? null, person?.name ?? null);
  const job = await createJob({
    tenantId: user.tenantId, stage: 'won', title: carried.title, client: carried.client, site: carried.site,
    valueCents: carried.valueCents, createdBy: user.name,
  });
  const at = now();
  await setDeal(user.tenantId, deal.id, { status: 'won', closedAt: at, closedBy: user.name, jobId: job.id, lostReason: null, lostNote: null });
  await logEvent(user.tenantId, deal.id, user.name, { kind: 'won', text: `now ${job.ref} in Jobs` });
  revalidatePath('/crm');
  revalidatePath('/jobs');
  back({ deal: deal.id });
}

/** Lost, with a reason from the short list — and words, when the reason is Other. */
export async function markLost(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  if (deal.status !== 'open') back({ deal: deal.id }, 'That deal is already closed.');
  const reason = str(formData, 'reason', 60);
  const note = str(formData, 'note', 400);
  const refusal = lostRefusal(reason, note);
  if (refusal) back({ deal: deal.id, lose: '1' }, refusal);
  await setDeal(user.tenantId, deal.id, { status: 'lost', closedAt: now(), closedBy: user.name, lostReason: reason, lostNote: note || null });
  await logEvent(user.tenantId, deal.id, user.name, { kind: 'lost', text: note ? `${reason}: ${note}` : reason });
  revalidatePath('/crm');
  back({ deal: deal.id });
}

/**
 * Back on the board, in the stage it left from. A lost deal only: a won deal is a job now, and the
 * job is changed in Jobs, not undone from here.
 */
export async function reopenDeal(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  if (deal.status === 'won') back({ deal: deal.id }, 'A won deal is a job now — change it in Jobs.');
  if (deal.status !== 'lost') back({ deal: deal.id });
  const stages = await ensureStages(user.tenantId);
  const stageId = stages.some(s => s.id === deal.stageId) ? deal.stageId : stages[0].id;
  await setDeal(user.tenantId, deal.id, { status: 'open', closedAt: null, closedBy: null, lostReason: null, lostNote: null, stageId, stageAt: now() });
  await logEvent(user.tenantId, deal.id, user.name, { kind: 'reopened', toStageId: stageId });
  revalidatePath('/crm');
  back({ deal: deal.id });
}

/** The deal's own details: what, where, worth, when, who with, and who owns it. */
export async function updateDeal(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  const title = str(formData, 'title', 160) || deal.title;
  const rawValue = str(formData, 'value', 20);
  const value = rawValue ? toCents(rawValue) : 0;
  if (value === null) back({ deal: deal.id }, 'That value is not a number of dollars.');
  const rawClose = str(formData, 'expectedClose', 10);
  const expectedClose = rawClose ? parseDueDate(rawClose) : null;
  if (rawClose && !expectedClose) back({ deal: deal.id }, 'That close date is not a day.');

  const wantedOwner = str(formData, 'ownerRoleId');
  const owner = wantedOwner && wantedOwner !== deal.ownerRoleId ? ownerFrom(scope, wantedOwner) : null;
  if (wantedOwner && wantedOwner !== deal.ownerRoleId && !owner) back({ deal: deal.id }, 'A deal can only be given to somebody in your part of the chart.');

  const organisationId = await organisationFrom(user, formData);
  const personId = await personFrom(user, formData, organisationId);
  await setDeal(user.tenantId, deal.id, {
    title, valueCents: value, expectedClose, site: str(formData, 'site', 160), notes: str(formData, 'notes', 4000),
    organisationId, personId,
    ...(owner ? { ownerRoleId: owner.roleId, ownerName: owner.name } : {}),
  });
  if (owner) await logEvent(user.tenantId, deal.id, user.name, { kind: 'owner', text: owner.name });
  revalidatePath('/crm');
  back({ deal: deal.id });
}

/** A note on the deal — kept on the deal, and a line in its history. */
export async function addNote(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  const text = str(formData, 'note', 1000);
  if (!text) back({ deal: deal.id });
  await logEvent(user.tenantId, deal.id, user.name, { kind: 'note', text });
  revalidatePath('/crm');
  back({ deal: deal.id });
}

/* ── Activities ────────────────────────────────────────────────────────────────────────────────── */

export async function addActivity(formData: FormData) {
  const { user, scope } = await writer();
  const deal = await visibleDeal(user, scope, str(formData, 'dealId'));
  if (!deal) back({}, 'That deal is not in your part of the chart.');
  const kind = str(formData, 'kind', 20);
  const dueDate = parseDueDate(str(formData, 'dueDate', 10));
  if (!isActivityKind(kind) || !dueDate) back({ deal: deal.id }, 'An activity needs what kind it is and the day it is due.');
  const subject = str(formData, 'subject', 200) || activityLabel(kind);
  const owner = ownerFrom(scope, str(formData, 'ownerRoleId'));
  await db.insert(schema.crmActivities).values({
    id: randomUUID(), tenantId: user.tenantId, dealId: deal.id, kind, subject, dueDate,
    ownerRoleId: owner?.roleId ?? deal.ownerRoleId, ownerName: owner?.name ?? deal.ownerName,
    createdBy: user.name, createdAt: now(),
  });
  revalidatePath('/crm');
  back({ deal: deal.id });
}

/** Tick an activity done, or untick it. Ticking it is something happening on the deal. */
export async function toggleActivity(formData: FormData) {
  const { user, scope } = await writer();
  const tab = tabOf(formData);
  const [act] = await db.select().from(schema.crmActivities)
    .where(and(eq(schema.crmActivities.id, str(formData, 'activityId')), eq(schema.crmActivities.tenantId, user.tenantId)));
  const deal = act ? await visibleDeal(user, scope, act.dealId) : null;
  if (!act || !deal) back({ tab }, 'That activity is not in your part of the chart.');
  const done = !act.doneAt;
  await db.update(schema.crmActivities).set(done ? { doneAt: now(), doneBy: user.name } : { doneAt: null, doneBy: null })
    .where(and(eq(schema.crmActivities.id, act.id), eq(schema.crmActivities.tenantId, user.tenantId)));
  if (done) await logEvent(user.tenantId, deal.id, user.name, { kind: 'done', text: act.subject });
  revalidatePath('/crm');
  back(tab === 'deals' ? { deal: deal.id } : { tab });
}

/* ── Contacts ──────────────────────────────────────────────────────────────────────────────────── */

export async function addOrganisation(formData: FormData) {
  const { user } = await writer();
  const name = str(formData, 'name', 160);
  if (!name) back({ tab: 'organisations' }, 'An organisation needs a name.');
  await db.insert(schema.crmOrganisations).values({
    id: randomUUID(), tenantId: user.tenantId, name, address: str(formData, 'address', 200), phone: str(formData, 'phone', 40),
    createdBy: user.name, createdAt: now(),
  });
  revalidatePath('/crm');
  back({ tab: 'organisations' });
}

export async function addPerson(formData: FormData) {
  const { user } = await writer();
  const name = str(formData, 'name', 120);
  if (!name) back({ tab: 'people' }, 'A person needs a name.');
  const organisationId = await organisationFrom(user, formData);
  await db.insert(schema.crmPeople).values({
    id: randomUUID(), tenantId: user.tenantId, organisationId, name,
    email: str(formData, 'email', 160), phone: str(formData, 'phone', 40), createdBy: user.name, createdAt: now(),
  });
  revalidatePath('/crm');
  back({ tab: 'people' });
}

/* ── The pipeline itself ───────────────────────────────────────────────────────────────────────── */

/**
 * Rename a stage, set what it is worth to the forecast and how long a deal may sit in it. SPEC
 * proposed the starting five; this is the business editing them. Only the top of the chart or an
 * administrator — the pipeline is the whole business's, not one salesperson's.
 */
export async function saveStage(formData: FormData) {
  const { user, scope } = await writer();
  if (!mayShapePipeline(scope, user.access)) back({ stages: '1' }, 'The top of the chart or an administrator sets up the pipeline.');
  const stages = await ensureStages(user.tenantId);
  // A stage from the proposal the page drew before anything was saved is matched by position.
  const rawId = str(formData, 'stageId');
  const proposed = rawId.match(/^proposed-(\d+)$/);
  const stage = proposed ? stages[Number(proposed[1])] : stages.find(s => s.id === rawId);
  if (!stage) back({ stages: '1' });
  const name = str(formData, 'name', 60);
  const probability = parseProbability(str(formData, 'probability', 4));
  const rotDays = parseRotDays(str(formData, 'rotDays', 4));
  if (!name || probability === null || rotDays === null) {
    back({ stages: '1' }, 'A stage needs a name, a chance of winning from 0 to 100%, and days before quiet from 1 to 365.');
  }
  await db.update(schema.crmStages).set({ name, probability, rotDays })
    .where(and(eq(schema.crmStages.id, stage.id), eq(schema.crmStages.tenantId, user.tenantId)));
  revalidatePath('/crm');
  back({ stages: '1' });
}

export async function addStage(formData: FormData) {
  const { user, scope } = await writer();
  if (!mayShapePipeline(scope, user.access)) back({ stages: '1' }, 'The top of the chart or an administrator sets up the pipeline.');
  const stages = await ensureStages(user.tenantId);
  const name = str(formData, 'name', 60);
  if (!name) back({ stages: '1' }, 'A new stage needs a name.');
  const probability = parseProbability(str(formData, 'probability', 4)) ?? stages.at(-1)?.probability ?? 50;
  await db.insert(schema.crmStages).values({
    id: randomUUID(), tenantId: user.tenantId, name, probability, rotDays: DEFAULT_ROT_DAYS,
    position: (stages.at(-1)?.position ?? -1) + 1, createdAt: now(),
  });
  revalidatePath('/crm');
  back({ stages: '1' });
}

/** Take a stage off the board — only once no deal is sitting in it, so no deal loses its place. */
export async function removeStage(formData: FormData) {
  const { user, scope } = await writer();
  if (!mayShapePipeline(scope, user.access)) back({ stages: '1' }, 'The top of the chart or an administrator sets up the pipeline.');
  const stages = await ensureStages(user.tenantId);
  const stage = stages.find(s => s.id === str(formData, 'stageId'));
  if (!stage) back({ stages: '1' });
  if (stages.length <= 1) back({ stages: '1' }, 'A pipeline needs at least one stage.');
  const inIt = await db.select({ id: schema.crmDeals.id }).from(schema.crmDeals)
    .where(and(eq(schema.crmDeals.tenantId, user.tenantId), eq(schema.crmDeals.stageId, stage.id), eq(schema.crmDeals.status, 'open')));
  if (inIt.length) back({ stages: '1' }, `Move the ${inIt.length} open ${inIt.length === 1 ? 'deal' : 'deals'} out of ${stage.name} first.`);
  await db.delete(schema.crmStages).where(and(eq(schema.crmStages.id, stage.id), eq(schema.crmStages.tenantId, user.tenantId)));
  revalidatePath('/crm');
  back({ stages: '1' });
}
