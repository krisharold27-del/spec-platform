'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { crewFor, createJob } from '@/lib/jobs-data';
import { nextOrderRef, match } from '@/lib/purchasing';
import { isBillKind, claimMaths, maySend, DEFAULT_RETENTION } from '@/lib/billing-job';
import { isRecurKind, nextDue } from '@/lib/recurring';
import {
  parseEnquiry, nextRef, nextStage, lineFrom, priceQuote, MARKUPS, DEFAULT_MARKUP,
  toCents, minutesBetween, bookingRefusal, workWeek, parseComponents, parsePriceFile,
  type LineKind, type QuoteLine, type Kit,
} from '@/lib/jobs';

/**
 * Every write on the Jobs screen.
 *
 * Each one starts at the same gate as the rest of SPEC — a manager, in a business that can be
 * written to — and every id that arrives from a form is re-read with this business's tenant_id
 * before anything is changed. A form is somebody else's text until proven otherwise.
 */

async function writer() {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  return user;
}

/** Back to the tab somebody was on, with SPEC's reason if it said no. */
function back(tab: string, extra: Record<string, string> = {}, cannot?: string): never {
  const q = new URLSearchParams({ tab, ...extra });
  if (cannot) q.set('cannot', cannot);
  redirect(`/jobs?${q.toString()}`);
}

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max);
const now = () => new Date().toISOString();

async function ownJob(tenantId: string, id: string) {
  if (!id) return null;
  const [job] = await db.select().from(schema.jobs)
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.tenantId, tenantId)));
  return job ?? null;
}

/* ── The pipeline ─────────────────────────────────────────────────────────────────────────────── */

/** A new enquiry from one line: "Sam Lee, switchboard upgrade, Balmain". */
export async function addEnquiry(formData: FormData) {
  const user = await writer();
  const parsed = parseEnquiry(str(formData, 'enquiry', 400));
  if (!parsed) back('pipeline', {}, 'Type who it is for and what they want — for example “Sam Lee, switchboard upgrade, Balmain”.');

  const { id } = await createJob({
    tenantId: user.tenantId, stage: 'enquiry', title: parsed.title, client: parsed.client, site: parsed.site,
    createdBy: user.name,
  });
  revalidatePath('/jobs');
  back('pipeline', { job: id });
}

/** One stage on. A job never skips a stage from here. */
export async function advanceJob(formData: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(formData, 'jobId'));
  if (!job) back('pipeline');
  const to = nextStage(job.stage);
  if (!to) back('pipeline', { job: job.id });
  await db.update(schema.jobs).set({ stage: to, stageAt: now() })
    .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.tenantId, user.tenantId)));
  revalidatePath('/jobs');
  back('pipeline', { job: job.id });
}

/** Materials put on the job so far, typed in. Empty clears it back to "not recorded". */
export async function recordMaterials(formData: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(formData, 'jobId'));
  if (!job) back('pipeline');
  const raw = str(formData, 'materials', 20);
  const cents = raw ? toCents(raw) : null;
  if (raw && cents === null) back('pipeline', { job: job.id }, 'That amount is not a number of dollars.');
  await db.update(schema.jobs).set({ materialsCents: cents })
    .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.tenantId, user.tenantId)));
  revalidatePath('/jobs');
  back('pipeline', { job: job.id });
}

/* ── Quotes ───────────────────────────────────────────────────────────────────────────────────── */

async function catalogueOf(tenantId: string) {
  const [items, kitRows, rates] = await Promise.all([
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, tenantId)),
    db.select().from(schema.kits).where(eq(schema.kits.tenantId, tenantId)),
    db.select().from(schema.labourRates).where(eq(schema.labourRates.tenantId, tenantId))
      .orderBy(schema.labourRates.position, schema.labourRates.createdAt),
  ]);
  const kits: Kit[] = kitRows.map(k => ({
    id: k.id, name: k.name, components: parseComponents(k.components),
    labourHours: k.labourHours, labourRateId: k.labourRateId, extraCostCents: k.extraCostCents,
  }));
  return { items, kits, rates };
}

/**
 * Open a quote for a job — the latest draft if there is one, otherwise a new draft.
 *
 * A job whose quote has already gone out gets a NEW draft carrying the same lines, rather than the
 * sent one reopened: the quote a client holds keeps the price it went out at.
 */
export async function startQuote(formData: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(formData, 'jobId'));
  if (!job) back('quotes');

  const existing = await db.select().from(schema.quotes)
    .where(and(eq(schema.quotes.tenantId, user.tenantId), eq(schema.quotes.jobId, job.id)))
    .orderBy(schema.quotes.createdAt);
  const draft = existing.filter(q => q.status === 'draft').at(-1);
  if (draft) back('quotes', { quote: draft.id });

  const allRefs = await db.select({ ref: schema.quotes.ref }).from(schema.quotes).where(eq(schema.quotes.tenantId, user.tenantId));
  const id = randomUUID();
  const at = now();
  const last = existing.at(-1);
  await db.insert(schema.quotes).values({
    id, tenantId: user.tenantId, jobId: job.id, ref: nextRef('Q', allRefs.map(r => r.ref)),
    markupPct: last?.markupPct ?? DEFAULT_MARKUP, status: 'draft', createdAt: at, updatedAt: at,
  });
  if (last) {
    const lines = await db.select().from(schema.quoteLines)
      .where(and(eq(schema.quoteLines.tenantId, user.tenantId), eq(schema.quoteLines.quoteId, last.id)));
    if (lines.length) {
      await db.insert(schema.quoteLines).values(lines.map(l => ({ ...l, id: randomUUID(), quoteId: id })));
    }
  }
  revalidatePath('/jobs');
  back('quotes', { quote: id });
}

/**
 * Save the builder — and, with intent=send, record that the quote went out.
 *
 * The browser sends only WHICH things are on the quote and how many. Prices never come from the
 * form: a line already on the quote keeps the price it was added at, and a new one is priced from
 * this business's own catalogue here, on the server.
 *
 * SPEC never emails a quote. "Sent" is the business saying it went out its usual way; the job then
 * moves to Quoted, carrying the price.
 */
export async function saveQuote(formData: FormData) {
  const user = await writer();
  const quoteId = str(formData, 'quoteId');
  const [quote] = await db.select().from(schema.quotes)
    .where(and(eq(schema.quotes.id, quoteId), eq(schema.quotes.tenantId, user.tenantId)));
  if (!quote) back('quotes');
  if (quote.status !== 'draft') back('quotes', { quote: quote.id }, 'That quote has gone out, so it keeps its price. Start a revised one instead.');

  const markup = Number(str(formData, 'markup', 4));
  const markupPct = (MARKUPS as readonly number[]).includes(markup) ? markup : DEFAULT_MARKUP;

  let wanted: { kind: LineKind; ref: string; qty: number }[] = [];
  try {
    const raw = JSON.parse(String(formData.get('lines') ?? '[]'));
    if (Array.isArray(raw)) {
      wanted = raw
        .filter(l => l && ['item', 'kit', 'labour'].includes(l.kind) && typeof l.ref === 'string')
        .map(l => ({ kind: l.kind as LineKind, ref: String(l.ref), qty: Math.round(Number(l.qty) * 100) / 100 }))
        .filter(l => Number.isFinite(l.qty) && l.qty > 0 && l.qty <= 100_000)
        .slice(0, 200);
    }
  } catch { /* nothing usable arrived; saved as empty rather than guessed at */ }

  const stored = await db.select().from(schema.quoteLines)
    .where(and(eq(schema.quoteLines.tenantId, user.tenantId), eq(schema.quoteLines.quoteId, quote.id)));
  const ctx = await catalogueOf(user.tenantId);

  const lines: QuoteLine[] = [];
  for (const w of wanted) {
    const kept = stored.find(s => s.kind === w.kind && s.refId === w.ref);
    if (kept) {
      lines.push({
        kind: w.kind, ref: w.ref, name: kept.name, unitCostCents: kept.unitCostCents, hours: kept.hours,
        rateCostCents: kept.rateCostCents, rateChargeCents: kept.rateChargeCents, qty: w.qty,
      });
      continue;
    }
    const fresh = lineFrom(w.kind, w.ref, ctx, w.qty);
    if (fresh) lines.push(fresh);
  }

  const at = now();
  await db.delete(schema.quoteLines)
    .where(and(eq(schema.quoteLines.tenantId, user.tenantId), eq(schema.quoteLines.quoteId, quote.id)));
  if (lines.length) {
    await db.insert(schema.quoteLines).values(lines.map((l, i) => ({
      id: randomUUID(), tenantId: user.tenantId, quoteId: quote.id, position: i,
      kind: l.kind, refId: l.ref, name: l.name, unitCostCents: l.unitCostCents, hours: l.hours,
      rateCostCents: l.rateCostCents, rateChargeCents: l.rateChargeCents, qty: l.qty,
    })));
  }

  const send = str(formData, 'intent') === 'send';
  if (send && !lines.length) back('quotes', { quote: quote.id }, 'There is nothing on the quote yet.');
  await db.update(schema.quotes)
    .set(send ? { markupPct, updatedAt: at, status: 'sent', sentAt: at, sentBy: user.name } : { markupPct, updatedAt: at })
    .where(and(eq(schema.quotes.id, quote.id), eq(schema.quotes.tenantId, user.tenantId)));

  if (send) {
    const totals = priceQuote(lines, markupPct);
    const job = await ownJob(user.tenantId, quote.jobId);
    if (job) {
      await db.update(schema.jobs)
        .set({
          valueCents: totals.exGstCents,
          ...(job.stage === 'enquiry' ? { stage: 'quoted', stageAt: at } : {}),
        })
        .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.tenantId, user.tenantId)));
    }
    // Put on a quote is what "used" means for keeping the catalogue lean.
    const itemIds = lines.filter(l => l.kind === 'item').map(l => l.ref);
    if (itemIds.length) {
      await db.update(schema.catalogueItems).set({ lastUsedAt: at })
        .where(and(eq(schema.catalogueItems.tenantId, user.tenantId), inArray(schema.catalogueItems.id, itemIds)));
    }
  }
  revalidatePath('/jobs');
  back('quotes', { quote: quote.id });
}

/* ── Catalogue ────────────────────────────────────────────────────────────────────────────────── */

export async function addItem(formData: FormData) {
  const user = await writer();
  const name = str(formData, 'name', 160);
  const cost = toCents(str(formData, 'cost', 20));
  if (!name || cost === null) back('catalogue', {}, 'An item needs a name and what it costs you.');
  await db.insert(schema.catalogueItems).values({
    id: randomUUID(), tenantId: user.tenantId, name,
    category: str(formData, 'category', 60), supplier: str(formData, 'supplier', 80),
    unit: str(formData, 'unit', 30) || 'each', costCents: cost,
    priceDate: new Date().toISOString().slice(0, 10), createdAt: now(),
  });
  revalidatePath('/jobs');
  back('catalogue');
}

/**
 * A supplier's price file, pasted in. An item already in the catalogue from that supplier under the
 * same name takes the new price; anything new is added. Nothing is removed — a file that leaves an
 * item out has not told SPEC the business stopped using it.
 */
export async function loadPriceFile(formData: FormData) {
  const user = await writer();
  const supplier = str(formData, 'supplier', 80);
  const { rows, skipped } = parsePriceFile(String(formData.get('file') ?? '').slice(0, 200_000));
  if (!supplier || !rows.length) back('catalogue', {}, 'Name the supplier and paste at least one line: name, unit, cost.');

  const today = new Date().toISOString().slice(0, 10);
  const have = await db.select().from(schema.catalogueItems)
    .where(and(eq(schema.catalogueItems.tenantId, user.tenantId), eq(schema.catalogueItems.supplier, supplier)));
  const fresh: (typeof schema.catalogueItems.$inferInsert)[] = [];
  for (const r of rows.slice(0, 5000)) {
    const match = have.find(h => h.name.toLowerCase() === r.name.toLowerCase());
    if (match) {
      await db.update(schema.catalogueItems).set({ costCents: r.costCents, unit: r.unit, priceDate: today })
        .where(and(eq(schema.catalogueItems.id, match.id), eq(schema.catalogueItems.tenantId, user.tenantId)));
    } else {
      fresh.push({ id: randomUUID(), tenantId: user.tenantId, name: r.name, supplier, unit: r.unit, costCents: r.costCents, priceDate: today, createdAt: now() });
    }
  }
  if (fresh.length) await db.insert(schema.catalogueItems).values(fresh);
  revalidatePath('/jobs');
  back('catalogue', skipped ? { skipped: String(skipped) } : {});
}

/** Take an item off the list. Quotes that carry it keep their own copy of its price. */
export async function retireItem(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'itemId');
  if (id) {
    await db.delete(schema.catalogueItems)
      .where(and(eq(schema.catalogueItems.id, id), eq(schema.catalogueItems.tenantId, user.tenantId)));
  }
  revalidatePath('/jobs');
  back('catalogue');
}

export async function addRate(formData: FormData) {
  const user = await writer();
  const name = str(formData, 'name', 80);
  const cost = toCents(str(formData, 'cost', 20));
  const charge = toCents(str(formData, 'charge', 20));
  if (!name || cost === null || charge === null) back('catalogue', {}, 'A labour rate needs a name, what an hour costs you, and what you charge for it.');
  const existing = await db.select({ id: schema.labourRates.id }).from(schema.labourRates)
    .where(eq(schema.labourRates.tenantId, user.tenantId));
  await db.insert(schema.labourRates).values({
    id: randomUUID(), tenantId: user.tenantId, name, costCents: cost, chargeCents: charge,
    position: existing.length, createdAt: now(),
  });
  revalidatePath('/jobs');
  back('catalogue');
}

/** A kit from up to six catalogue items, its labour hours and any sundries. */
export async function addKit(formData: FormData) {
  const user = await writer();
  const name = str(formData, 'name', 160);
  if (!name) back('catalogue', {}, 'A kit needs a name.');
  const items = await db.select({ id: schema.catalogueItems.id }).from(schema.catalogueItems)
    .where(eq(schema.catalogueItems.tenantId, user.tenantId));
  const own = new Set(items.map(i => i.id));
  const components = [0, 1, 2, 3, 4, 5]
    .map(i => ({ itemId: str(formData, `item${i}`), qty: Number(str(formData, `qty${i}`, 10) || '1') }))
    .filter(c => own.has(c.itemId) && Number.isFinite(c.qty) && c.qty > 0);
  const hours = Number(str(formData, 'hours', 10) || '0');
  const rateId = str(formData, 'rateId');
  const rates = rateId
    ? await db.select({ id: schema.labourRates.id }).from(schema.labourRates)
        .where(and(eq(schema.labourRates.id, rateId), eq(schema.labourRates.tenantId, user.tenantId)))
    : [];
  if (!components.length && !(hours > 0)) back('catalogue', {}, 'A kit needs at least one item or some labour hours.');
  await db.insert(schema.kits).values({
    id: randomUUID(), tenantId: user.tenantId, name,
    components: JSON.stringify(components),
    labourHours: Number.isFinite(hours) && hours > 0 ? Math.round(hours * 100) / 100 : 0,
    labourRateId: rates[0]?.id ?? null,
    extraCostCents: toCents(str(formData, 'extra', 20)) ?? 0,
    createdAt: now(),
  });
  revalidatePath('/jobs');
  back('catalogue');
}

/* ── Schedule ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Book somebody onto a job for a day.
 *
 * Clear to Work is checked here, on the server, from the same records the People screen reads — the
 * greyed-out cell on the grid is a courtesy, this is the gate. The first booking on a won job moves
 * it to Scheduled.
 */
export async function bookCrew(formData: FormData) {
  const user = await writer();
  const week = str(formData, 'week', 10);
  const day = str(formData, 'day', 10);
  const job = await ownJob(user.tenantId, str(formData, 'jobId'));
  // Booked from the job itself (the Crew card on a job) goes back to the job; from the grid, the grid.
  const fromJob = str(formData, 'from', 10) === 'job' && job;
  const retreat: (cannot?: string) => never = cannot => fromJob
    ? back('pipeline', { job: job.id }, cannot)
    : back('schedule', job ? { week, book: job.id } : { week }, cannot);
  if (!job || !/^\d{4}-\d{2}-\d{2}$/.test(day)) retreat(job ? 'Pick the day to book them for.' : undefined);

  const crew = await crewFor(user);
  const person = crew.find(c => c.key === str(formData, 'person'));
  if (!person) retreat('That person is not in your part of the chart.');

  const [taken] = await db.select({ id: schema.scheduleBookings.id }).from(schema.scheduleBookings)
    .where(and(eq(schema.scheduleBookings.tenantId, user.tenantId), eq(schema.scheduleBookings.personKey, person.key), eq(schema.scheduleBookings.day, day)));
  const refusal = bookingRefusal(person, Boolean(taken));
  if (refusal) retreat(refusal);

  await db.insert(schema.scheduleBookings).values({
    id: randomUUID(), tenantId: user.tenantId, jobId: job.id, personKey: person.key, personName: person.name,
    day, createdBy: user.name, createdAt: now(),
  }).onConflictDoNothing();
  if (job.stage === 'won') {
    await db.update(schema.jobs).set({ stage: 'scheduled', stageAt: now() })
      .where(and(eq(schema.jobs.id, job.id), eq(schema.jobs.tenantId, user.tenantId)));
  }
  revalidatePath('/jobs');
  revalidatePath('/tech-day');
  if (fromJob) back('pipeline', { job: job.id });
  back('schedule', { week, book: job.id });
}

export async function unbookCrew(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'bookingId');
  if (id) {
    await db.delete(schema.scheduleBookings)
      .where(and(eq(schema.scheduleBookings.id, id), eq(schema.scheduleBookings.tenantId, user.tenantId)));
  }
  revalidatePath('/jobs');
  back('schedule', { week: str(formData, 'week', 10) });
}

/* ── Timesheets ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Start and Finish, typed in by a leader — the manual mode of what the phone records. Time on a job
 * is billable; time with no job is not.
 */
export async function recordTime(formData: FormData) {
  const user = await writer();
  const week = str(formData, 'week', 10);
  const day = str(formData, 'day', 10);
  const start = str(formData, 'start', 5);
  const finish = str(formData, 'finish', 5);
  const minutes = minutesBetween(start, finish);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || minutes === null) back('time', { week }, 'A day, a start and a finish after it, please.');

  const crew = await crewFor(user);
  const person = crew.find(c => c.key === str(formData, 'person'));
  if (!person) back('time', { week }, 'That person is not in your part of the chart.');
  const jobId = str(formData, 'jobId');
  const job = jobId ? await ownJob(user.tenantId, jobId) : null;

  await db.insert(schema.timesheetEntries).values({
    id: randomUUID(), tenantId: user.tenantId, personKey: person.key, personName: person.name,
    jobId: job?.id ?? null, day, startedAt: start, finishedAt: finish, minutes,
    billable: Boolean(job), source: 'typed', createdAt: now(),
  });
  revalidatePath('/jobs');
  back('time', { week });
}

/** Approve every waiting entry in the week, for the people this leader can see. */
export async function approveWeek(formData: FormData) {
  const user = await writer();
  const week = str(formData, 'week', 10);
  const days = workWeek(week);
  if (!days.length) back('time');
  const crew = await crewFor(user);
  const keys = crew.map(c => c.key);
  if (keys.length) {
    const waiting = await db.select().from(schema.timesheetEntries)
      .where(and(
        eq(schema.timesheetEntries.tenantId, user.tenantId),
        inArray(schema.timesheetEntries.day, days),
        inArray(schema.timesheetEntries.personKey, keys),
      ));
    const ids = waiting.filter(e => !e.approvedAt && e.finishedAt).map(e => e.id);
    if (ids.length) {
      await db.update(schema.timesheetEntries).set({ approvedBy: user.name, approvedAt: now() })
        .where(and(eq(schema.timesheetEntries.tenantId, user.tenantId), inArray(schema.timesheetEntries.id, ids)));
    }
  }
  revalidatePath('/jobs');
  back('time', { week });
}


/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Buying materials, and checking the bill against the order
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Money typed by a person: "1,240.50" and "$1240.5" both mean the same thing. */
const cents = (f: FormData, k: string): number => {
  const raw = String(f.get(k) ?? '').replace(/[^0-9.]/g, '');
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

/** Raise an order. From a job when there is one, because that is where the money lands. */
export async function raiseOrder(formData: FormData) {
  const user = await writer();
  const supplier = str(formData, 'supplier', 120);
  if (!supplier) back('stock', {}, 'An order needs a supplier.');

  const total = cents(formData, 'total');
  if (total <= 0) back('stock', {}, 'An order needs an amount, so the bill has something to be checked against.');

  const jobId = str(formData, 'jobId', 64);
  if (jobId) {
    // Only this business's own job. The id arrives from a form anybody can edit.
    const job = await ownJob(user.tenantId, jobId);
    if (!job) back('stock', {}, 'That job is not in this business.');
  }

  const existing = await db.select({ ref: schema.purchaseOrders.ref })
    .from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, user.tenantId));

  const stamp = now();
  await db.insert(schema.purchaseOrders).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    ref: nextOrderRef(existing.map(e => e.ref)),
    supplier,
    jobId: jobId || null,
    what: str(formData, 'what', 300) || null,
    totalCents: total,
    expectedAt: str(formData, 'expectedAt', 10) || null,
    state: 'sent',
    createdAt: stamp,
    updatedAt: stamp,
  });
  revalidatePath('/jobs');
  back('stock');
}

/**
 * Record the supplier's bill against an order.
 *
 * Nothing is decided here. `match` in lib/purchasing works out whether it holds, and the screen
 * says so — a bill higher than its order holds payment, a lower one does not, and that asymmetry
 * is the whole reason this capability is worth having.
 */
export async function recordBill(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [order] = await db.select().from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)));
  if (!order) back('stock', {}, 'That order is not in this business.');

  await db.update(schema.purchaseOrders).set({
    billRef: str(formData, 'billRef', 80) || null,
    billTotalCents: cents(formData, 'billTotal'),
    state: 'billed',
    // A new bill is a new question: anything accepted before does not carry over.
    matchedAt: null,
    matchedBy: null,
    updatedAt: now(),
  }).where(eq(schema.purchaseOrders.id, id));
  revalidatePath('/jobs');
  back('stock');
}

/**
 * Accept a difference somebody has looked at, and close the order.
 *
 * The note is required when the bill came in over. A held bill released with no reason is the same
 * as not having held it — and in six months the question will be why this job's margin was short.
 */
export async function acceptBill(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [order] = await db.select().from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)));
  if (!order) back('stock', {}, 'That order is not in this business.');

  const note = str(formData, 'note', 300);
  const verdict = match(order.totalCents, order.billTotalCents);
  if (verdict.holds && !note) {
    back('stock', {}, 'Say why the extra is accepted before releasing it — in six months the question will be why the margin was short.');
  }

  await db.update(schema.purchaseOrders).set({
    matchedAt: now(),
    matchedBy: user.id,
    note: note || order.note,
    state: 'closed',
    updatedAt: now(),
  }).where(eq(schema.purchaseOrders.id, id));
  revalidatePath('/jobs');
  back('stock');
}

/** The materials turned up. */
export async function orderArrived(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [order] = await db.select({ id: schema.purchaseOrders.id }).from(schema.purchaseOrders)
    .where(and(eq(schema.purchaseOrders.id, id), eq(schema.purchaseOrders.tenantId, user.tenantId)));
  if (!order) return;
  await db.update(schema.purchaseOrders).set({ state: 'received', updatedAt: now() })
    .where(eq(schema.purchaseOrders.id, id));
  revalidatePath('/jobs');
  back('stock');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Money against a job: variations, progress claims, invoices
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Raise a variation, a claim or an invoice against a job. */
export async function raiseBill(formData: FormData) {
  const user = await writer();
  const kind = str(formData, 'kind', 20);
  const jobId = str(formData, 'jobId', 64);
  const what = str(formData, 'what', 300);
  if (!isBillKind(kind) || !what) back('billing', {}, 'Say what it is for.');

  const job = await ownJob(user.tenantId, jobId);
  if (!job) back('billing', {}, 'That job is not in this business.');

  const amount = cents(formData, 'amount');
  if (amount <= 0) back('billing', {}, 'It needs an amount.');

  /*
    Retention only applies to a progress claim, and only when the business says so. A default is
    offered on the form; nothing is held back silently.
  */
  const pct = Number(String(formData.get('retentionPct') ?? '').replace(/[^0-9.]/g, ''));
  const maths = kind === 'claim'
    ? claimMaths(amount, Number.isFinite(pct) && pct > 0 ? pct / 100 : DEFAULT_RETENTION)
    : { grossCents: amount, retentionCents: 0, netCents: amount };

  const stamp = now();
  await db.insert(schema.jobBills).values({
    id: randomUUID(), tenantId: user.tenantId, jobId, kind, what,
    amountCents: maths.grossCents, retentionCents: maths.retentionCents,
    state: 'draft', createdAt: stamp, updatedAt: stamp,
  });
  revalidatePath('/jobs');
  back('billing');
}

/**
 * Record that the customer agreed the extra work, on site, before it was done.
 *
 * This is the row that stops a write-off. Extra work done on a nod and invoiced afterwards is the
 * single most common way a job loses money, and a name and a date against it is what settles the
 * argument three months later.
 */
export async function agreeVariation(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const who = str(formData, 'agreedBy', 120);
  if (!who) back('billing', {}, 'Who agreed it? A variation with no name against it is a variation that gets disputed.');

  const [bill] = await db.select().from(schema.jobBills)
    .where(and(eq(schema.jobBills.id, id), eq(schema.jobBills.tenantId, user.tenantId)));
  if (!bill) back('billing', {}, 'That is not in this business.');

  await db.update(schema.jobBills)
    .set({ state: 'agreed', agreedBy: who, agreedAt: now(), updatedAt: now() })
    .where(eq(schema.jobBills.id, id));
  revalidatePath('/jobs');
  back('billing');
}

/** Send it. `maySend` refuses an unagreed variation — the one rule that saves real money. */
export async function sendBill(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [bill] = await db.select().from(schema.jobBills)
    .where(and(eq(schema.jobBills.id, id), eq(schema.jobBills.tenantId, user.tenantId)));
  if (!bill) back('billing', {}, 'That is not in this business.');

  const verdict = maySend(bill);
  if (!verdict.ok) back('billing', {}, verdict.why);

  await db.update(schema.jobBills)
    .set({ state: 'sent', sentAt: now(), updatedAt: now() })
    .where(eq(schema.jobBills.id, id));
  revalidatePath('/jobs');
  back('billing');
}

/** Record the reminder as sent, so the same one never goes twice. */
export async function sendReminder(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [bill] = await db.select().from(schema.jobBills)
    .where(and(eq(schema.jobBills.id, id), eq(schema.jobBills.tenantId, user.tenantId)));
  if (!bill) return;

  await db.update(schema.jobBills)
    .set({ remindersSent: bill.remindersSent + 1, lastReminderAt: now(), updatedAt: now() })
    .where(eq(schema.jobBills.id, id));
  revalidatePath('/jobs');
  back('billing');
}

/** Paid. */
export async function markPaid(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [bill] = await db.select({ id: schema.jobBills.id }).from(schema.jobBills)
    .where(and(eq(schema.jobBills.id, id), eq(schema.jobBills.tenantId, user.tenantId)));
  if (!bill) return;
  await db.update(schema.jobBills)
    .set({ state: 'paid', paidAt: now(), updatedAt: now() })
    .where(eq(schema.jobBills.id, id));
  revalidatePath('/jobs');
  back('billing');
}

/** Release the retention held on a claim — the money businesses forget to collect. */
export async function releaseRetention(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [bill] = await db.select({ id: schema.jobBills.id }).from(schema.jobBills)
    .where(and(eq(schema.jobBills.id, id), eq(schema.jobBills.tenantId, user.tenantId)));
  if (!bill) return;
  await db.update(schema.jobBills)
    .set({ releasedAt: now(), updatedAt: now() })
    .where(eq(schema.jobBills.id, id));
  revalidatePath('/jobs');
  back('billing');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Work that comes round again: service contracts and tested items
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Put something on the recurring register — a maintenance agreement, or an item to be tested. */
export async function addRecurring(formData: FormData) {
  const user = await writer();
  const kind = str(formData, 'kind', 20);
  const title = str(formData, 'title', 160);
  if (!isRecurKind(kind) || !title) back('service', {}, 'It needs a name.');

  const everyMonths = Math.max(1, Math.round(Number(str(formData, 'everyMonths', 4)) || 12));
  const lastDoneAt = str(formData, 'lastDoneAt', 10) || null;
  const stamp = now();

  await db.insert(schema.recurringWork).values({
    id: randomUUID(), tenantId: user.tenantId, kind, title,
    forWhom: str(formData, 'forWhom', 160) || null,
    everyMonths, lastDoneAt,
    nextDueAt: nextDue(lastDoneAt, everyMonths),
    createdAt: stamp, updatedAt: stamp,
  });
  revalidatePath('/jobs');
  back('service');
}

/**
 * Record that it was done, and work out when it comes round again.
 *
 * The next date is computed here rather than asked for: a person typing a date twelve months out is
 * a person who will eventually type the wrong one, and the interval is already known.
 */
export async function recordDone(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [row] = await db.select().from(schema.recurringWork)
    .where(and(eq(schema.recurringWork.id, id), eq(schema.recurringWork.tenantId, user.tenantId)));
  if (!row) return;

  const doneAt = str(formData, 'doneAt', 10) || now().slice(0, 10);
  const result = str(formData, 'result', 10);

  await db.update(schema.recurringWork).set({
    lastDoneAt: doneAt,
    nextDueAt: nextDue(doneAt, row.everyMonths),
    result: result === 'pass' || result === 'fail' ? result : null,
    // Doing it clears the booking: the job it was raised for is finished.
    bookedJobId: null,
    updatedAt: now(),
  }).where(eq(schema.recurringWork.id, id));
  revalidatePath('/jobs');
  back('service');
}

/**
 * Raise the job for it — the whole of "books itself".
 *
 * A register that only lists what is due leaves the last step to somebody remembering, which is the
 * step that gets missed. This puts it on the Jobs board where the rest of the week already is.
 */
export async function bookRecurring(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [row] = await db.select().from(schema.recurringWork)
    .where(and(eq(schema.recurringWork.id, id), eq(schema.recurringWork.tenantId, user.tenantId)));
  if (!row) return;

  const job = await createJob({
    tenantId: user.tenantId,
    stage: 'won',
    client: row.forWhom ?? 'Service contract',
    title: row.result === 'fail' ? `${row.title} — failed test, make safe` : row.title,
    site: row.forWhom ?? '',
    createdBy: user.id,
  });

  await db.update(schema.recurringWork)
    .set({ bookedJobId: job.id, updatedAt: now() })
    .where(eq(schema.recurringWork.id, id));
  revalidatePath('/jobs');
  back('service');
}
