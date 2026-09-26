'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { readTheWork, readPlans, type Picture } from '@/lib/understand-data';
import { cleanReading, cleanTakeoff } from '@/lib/understand';
import { lineFrom, nextRef, parseComponents, priceQuote, DEFAULT_MARKUP, type Kit, type QuoteLine } from '@/lib/jobs';

/*
  Understand the work: read, ask, build. See lib/understand for what is proposed and what is not.
*/

async function writer() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

const back = (jobId: string, extra = ''): never => redirect(`/jobs?tab=pipeline&job=${jobId}${extra}#understand`);

const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_TOTAL = 3_800_000;

async function ownJob(tenantId: string, id: string) {
  if (!id) return null;
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, id), eq(schema.jobs.tenantId, tenantId)));
  return job ?? null;
}

async function kitsOf(tenantId: string): Promise<Kit[]> {
  const rows = await db.select().from(schema.kits).where(eq(schema.kits.tenantId, tenantId));
  return rows.map(k => ({
    id: k.id, name: k.name, components: parseComponents(k.components),
    labourHours: k.labourHours, labourRateId: k.labourRateId, extraCostCents: k.extraCostCents,
  }));
}

/** Read the photos, plans and message into a proposed job. */
export async function readWork(form: FormData) {
  const user = await writer();
  const jobId = String(form.get('jobId') ?? '').slice(0, 64);
  const job = await ownJob(user.tenantId, jobId);
  if (!job) redirect('/jobs?tab=pipeline');

  const said = String(form.get('said') ?? '').slice(0, 4000).trim();
  const pictures: Picture[] = [];
  let total = 0;
  for (const f of [...form.getAll('photos'), ...form.getAll('plans')].slice(0, 7)) {
    if (!(f instanceof File) || !f.size || !PICTURE_TYPES.includes(f.type)) continue;
    total += f.size;
    if (total > MAX_TOTAL) break;
    pictures.push({ mediaType: f.type, name: f.name.slice(0, 80), base64: Buffer.from(await f.arrayBuffer()).toString('base64') });
  }
  if (!said && !pictures.length) back(job.id, '&cannot=' + encodeURIComponent('Add a photo, the plans or what the customer told you.'));

  const kits = await kitsOf(user.tenantId);
  const { reading, byModel } = await readTheWork({ text: said, pictures, kits: kits.map(k => ({ id: k.id, name: k.name })) });

  await db.insert(schema.jobReadings).values({
    id: randomUUID(), tenantId: user.tenantId, jobId: job.id, said,
    photos: pictures.filter(p => p.mediaType.startsWith('image/')).length,
    reading: JSON.stringify(reading), byModel,
    createdAt: new Date().toISOString(), createdBy: user.name,
  });
  revalidatePath('/jobs');
  back(job.id);
}

async function ownReading(tenantId: string, id: string) {
  const [r] = await db.select().from(schema.jobReadings)
    .where(and(eq(schema.jobReadings.id, id), eq(schema.jobReadings.tenantId, tenantId)));
  return r ?? null;
}

/** The questions are approved and sent from the business's own phone or email. SPEC sends nothing. */
export async function approveQuestions(form: FormData) {
  const user = await writer();
  const r = await ownReading(user.tenantId, String(form.get('id') ?? '').slice(0, 64));
  if (!r) redirect('/jobs?tab=pipeline');
  if (!r.questionsApprovedAt) {
    await db.update(schema.jobReadings).set({ questionsApprovedAt: new Date().toISOString() })
      .where(and(eq(schema.jobReadings.id, r.id), eq(schema.jobReadings.tenantId, user.tenantId)));
  }
  revalidatePath('/jobs');
  back(r.jobId);
}

/**
 * Build the quote from the reading: each kit the reading named, at this business's own price, and the
 * extra time at its first labour rate. A draft — it goes out from the quote builder, the usual way.
 * Built once per reading; pressing again opens the same one.
 */
export async function buildQuoteFromReading(form: FormData) {
  const user = await writer();
  const r = await ownReading(user.tenantId, String(form.get('id') ?? '').slice(0, 64));
  if (!r) redirect('/jobs?tab=pipeline');
  if (r.quoteId) redirect(`/jobs?tab=quotes&quote=${r.quoteId}`);

  const [kits, items, rates] = await Promise.all([
    kitsOf(user.tenantId),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, user.tenantId)),
    db.select().from(schema.labourRates).where(eq(schema.labourRates.tenantId, user.tenantId))
      .orderBy(schema.labourRates.position, schema.labourRates.createdAt),
  ]);
  const reading = cleanReading(JSON.parse(r.reading), kits);
  const ctx = { items, kits, rates };
  const lines: QuoteLine[] = [];
  for (const s of reading.scope) {
    const l = lineFrom('kit', s.kitId, ctx, s.qty);
    if (l) lines.push(l);
  }
  const extraHours = reading.extras.reduce((a, e) => a + e.hours, 0);
  if (extraHours > 0 && rates[0]) {
    const l = lineFrom('labour', rates[0].id, ctx, Math.round(extraHours * 10) / 10);
    if (l) lines.push({ ...l, name: `${l.name} — ${reading.extras.map(e => e.label).join(', ')}`.slice(0, 200) });
  }
  if (!lines.length) back(r.jobId, '&cannot=' + encodeURIComponent('Nothing in the reading matches one of your pre-builds yet, so there is nothing to price. Open the quote builder and add the lines.'));

  const allRefs = await db.select({ ref: schema.quotes.ref }).from(schema.quotes).where(eq(schema.quotes.tenantId, user.tenantId));
  const id = randomUUID();
  const at = new Date().toISOString();
  await db.insert(schema.quotes).values({
    id, tenantId: user.tenantId, jobId: r.jobId, ref: nextRef('Q', allRefs.map(x => x.ref)),
    markupPct: DEFAULT_MARKUP, status: 'draft', createdAt: at, updatedAt: at,
  });
  await db.insert(schema.quoteLines).values(lines.map((l, i) => ({
    id: randomUUID(), tenantId: user.tenantId, quoteId: id, position: i,
    kind: l.kind, refId: l.ref, name: l.name, unitCostCents: l.unitCostCents, hours: l.hours,
    rateCostCents: l.rateCostCents, rateChargeCents: l.rateChargeCents, qty: l.qty,
  })));
  await db.update(schema.jobReadings).set({ quoteId: id })
    .where(and(eq(schema.jobReadings.id, r.id), eq(schema.jobReadings.tenantId, user.tenantId)));
  revalidatePath('/jobs');
  redirect(`/jobs?tab=quotes&quote=${id}`);
}

/* ── Estimate from plans ──────────────────────────────────────────────────────────────────────── */

const backPlans = (jobId: string, extra = ''): never => redirect(`/jobs?tab=takeoff&job=${jobId}${extra}#plans`);

/** Count the plans against this business's pre-builds. */
export async function readPlansAction(form: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, String(form.get('jobId') ?? '').slice(0, 64));
  if (!job) redirect('/jobs?tab=takeoff');
  const plans: Picture[] = [];
  let total = 0;
  for (const f of form.getAll('plans').slice(0, 4)) {
    if (!(f instanceof File) || !f.size || !PICTURE_TYPES.includes(f.type)) continue;
    total += f.size;
    if (total > MAX_TOTAL) break;
    plans.push({ mediaType: f.type, name: f.name.slice(0, 80), base64: Buffer.from(await f.arrayBuffer()).toString('base64') });
  }
  if (!plans.length) backPlans(job.id, '&cannot=' + encodeURIComponent('Add the plans — a PDF or photos of the drawings.'));

  const kits = await kitsOf(user.tenantId);
  const { rows, byModel } = await readPlans({ plans, kits: kits.map(k => ({ id: k.id, name: k.name })) });
  await db.insert(schema.planTakeoffs).values({
    id: randomUUID(), tenantId: user.tenantId, jobId: job.id,
    fileName: plans.map(p => p.name).join(', ').slice(0, 200),
    rows: JSON.stringify(rows), byModel,
    createdAt: new Date().toISOString(), createdBy: user.name,
  });
  revalidatePath('/jobs');
  backPlans(job.id);
}

/**
 * Approve the counts. Every count read clearly: the quote is built and recorded as sent (it goes out
 * the business's usual way, as every SPEC quote does), and the job moves to Quoted. Any count marked
 * to confirm: the quote is built as a draft and opened, so the counts are checked before anything
 * goes — "check the counts before you send" as a gate, not a sentence.
 */
export async function approveTakeoff(form: FormData) {
  const user = await writer();
  const [t] = await db.select().from(schema.planTakeoffs)
    .where(and(eq(schema.planTakeoffs.id, String(form.get('id') ?? '').slice(0, 64)), eq(schema.planTakeoffs.tenantId, user.tenantId)));
  if (!t) redirect('/jobs?tab=takeoff');
  if (t.quoteId) redirect(`/jobs?tab=quotes&quote=${t.quoteId}`);

  const [kits, items, rates] = await Promise.all([
    kitsOf(user.tenantId),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, user.tenantId)),
    db.select().from(schema.labourRates).where(eq(schema.labourRates.tenantId, user.tenantId))
      .orderBy(schema.labourRates.position, schema.labourRates.createdAt),
  ]);
  const rows = cleanTakeoff(JSON.parse(t.rows), kits);
  const byKit = new Map<string, number>();
  for (const r of rows) byKit.set(r.kitId, (byKit.get(r.kitId) ?? 0) + r.qty);
  const ctx = { items, kits, rates };
  const lines = [...byKit].map(([kitId, qty]) => lineFrom('kit', kitId, ctx, qty)).filter((l): l is QuoteLine => !!l);
  if (!lines.length) backPlans(t.jobId, '&cannot=' + encodeURIComponent('There is nothing counted to price yet.'));

  const sure = rows.every(r => !r.unsure);
  const allRefs = await db.select({ ref: schema.quotes.ref }).from(schema.quotes).where(eq(schema.quotes.tenantId, user.tenantId));
  const id = randomUUID();
  const at = new Date().toISOString();
  await db.insert(schema.quotes).values({
    id, tenantId: user.tenantId, jobId: t.jobId, ref: nextRef('Q', allRefs.map(x => x.ref)),
    markupPct: DEFAULT_MARKUP, status: sure ? 'sent' : 'draft', createdAt: at, updatedAt: at,
    ...(sure ? { sentAt: at, sentBy: user.name } : {}),
  });
  await db.insert(schema.quoteLines).values(lines.map((l, i) => ({
    id: randomUUID(), tenantId: user.tenantId, quoteId: id, position: i,
    kind: l.kind, refId: l.ref, name: l.name, unitCostCents: l.unitCostCents, hours: l.hours,
    rateCostCents: l.rateCostCents, rateChargeCents: l.rateChargeCents, qty: l.qty,
  })));
  if (sure) {
    const job = await ownJob(user.tenantId, t.jobId);
    if (job) {
      await db.update(schema.jobs)
        .set({ valueCents: priceQuote(lines, DEFAULT_MARKUP).exGstCents, ...(job.stage === 'enquiry' ? { stage: 'quoted', stageAt: at, quotedAt: at } : {}) })
        .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.tenantId, user.tenantId)));
    }
  }
  await db.update(schema.planTakeoffs).set({ quoteId: id })
    .where(and(eq(schema.planTakeoffs.id, t.id), eq(schema.planTakeoffs.tenantId, user.tenantId)));
  revalidatePath('/jobs');
  redirect(sure ? `/jobs?tab=takeoff&job=${t.jobId}#plans` : `/jobs?tab=quotes&quote=${id}`);
}
