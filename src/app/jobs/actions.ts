'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { QUOTE_CHASE } from '@/lib/growth';
import { isTerritory } from '@/lib/certificates';
import { assertWritable } from '@/lib/plan';
import { crewFor, createJob } from '@/lib/jobs-data';
import { nextOrderRef, match } from '@/lib/purchasing';
import { isBillKind, claimMaths, maySend, DEFAULT_RETENTION } from '@/lib/billing-job';
import { isRecurKind, nextDue } from '@/lib/recurring';
import { isSource } from '@/lib/leads';
import { reorderList } from '@/lib/stock';
import { reprice, bigRises, splitChecklist } from '@/lib/prebuild';
import { isCause } from '@/lib/rework';
import { mayAsk } from '@/lib/reviews';
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

  /*
    ── What went up, said out loud ────────────────────────────────────────────────────────────────

    The import already replaced the costs. What it never did was mention that some of them JUMPED —
    and a price rise nobody sees is every quote already out with that item on it quietly going
    wrong. `bigRises` names the ones past 5%; below that it is noise.
  */
  const rises = bigRises(reprice(rows, have));

  revalidatePath('/jobs');
  back('catalogue', {
    ...(skipped ? { skipped: String(skipped) } : {}),
    ...(rises.length ? { rises: String(rises.length), rose: rises.slice(0, 3).map(r => r.name).join(', ') } : {}),
  });
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

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Where the work came from, and what is on the vans
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Say where an enquiry came from. Two columns on the job it already is — never a second list. */
export async function setSource(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'jobId', 64);
  const source = str(formData, 'source', 40);
  const job = await ownJob(user.tenantId, id);
  if (!job || !isSource(source)) return;

  await db.update(schema.jobs).set({ source }).where(eq(schema.jobs.id, id));
  revalidatePath('/jobs');
  back('leads');
}

/**
 * Mark the quote as gone.
 *
 * Stamped here rather than inferred from the stage, because a job can reach `quoted` by somebody
 * dragging it, and speed-to-quote measured off a drag is a number that flatters.
 */
export async function markQuoted(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'jobId', 64);
  const job = await ownJob(user.tenantId, id);
  if (!job) return;

  await db.update(schema.jobs)
    .set({ quotedAt: now(), stage: job.stage === 'enquiry' ? 'quoted' : job.stage, stageAt: now() })
    .where(eq(schema.jobs.id, id));
  revalidatePath('/jobs');
  back('leads');
}

/** Put an item on the register for a place — a van, or the yard. */
export async function setStock(formData: FormData) {
  const user = await writer();
  const itemId = str(formData, 'itemId', 64);
  const place = str(formData, 'place', 60) || 'Yard';
  if (!itemId) back('stock', {}, 'Pick the item — stock is counted against the catalogue.');

  const [item] = await db.select({ id: schema.catalogueItems.id }).from(schema.catalogueItems)
    .where(and(eq(schema.catalogueItems.id, itemId), eq(schema.catalogueItems.tenantId, user.tenantId)));
  if (!item) back('stock', {}, 'That item is not in this business’s catalogue.');

  const qty = Math.max(0, Math.round(Number(str(formData, 'qty', 6)) || 0));
  const minQty = Math.max(0, Math.round(Number(str(formData, 'minQty', 6)) || 0));
  const stamp = now();

  const [existing] = await db.select().from(schema.stockLevels).where(and(
    eq(schema.stockLevels.tenantId, user.tenantId),
    eq(schema.stockLevels.itemId, itemId),
    eq(schema.stockLevels.place, place),
  ));

  if (existing) {
    await db.update(schema.stockLevels)
      .set({ qty, minQty, countedAt: stamp, countedBy: user.id, updatedAt: stamp })
      .where(eq(schema.stockLevels.id, existing.id));
  } else {
    await db.insert(schema.stockLevels).values({
      id: randomUUID(), tenantId: user.tenantId, itemId, place, qty, minQty,
      countedAt: stamp, countedBy: user.id, createdAt: stamp, updatedAt: stamp,
    });
  }
  revalidatePath('/jobs');
  back('stock');
}

/**
 * Turn the reorder list into a purchase order.
 *
 * The last step of "a reorder list built from what jobs will need": a list that still leaves
 * somebody to type an order is a list that gets read and not acted on.
 */
export async function orderTheShortfall(formData: FormData) {
  const user = await writer();
  const supplier = str(formData, 'supplier', 120) || 'To be decided';

  const [levels, items] = await Promise.all([
    db.select().from(schema.stockLevels).where(eq(schema.stockLevels.tenantId, user.tenantId)),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, user.tenantId)),
  ]);
  const short = reorderList(levels);
  if (short.length === 0) back('stock', {}, 'Nothing is under its minimum.');

  const nameOf = (id: string) => items.find(i => i.id === id)?.name ?? 'An item';
  const costOf = (id: string) => items.find(i => i.id === id)?.costCents ?? 0;
  const total = short.reduce((t, l) => t + l.buy * costOf(l.itemId), 0);
  const what = short.slice(0, 8).map(l => `${l.buy} × ${nameOf(l.itemId)} (${l.place})`).join(', ');

  const existing = await db.select({ ref: schema.purchaseOrders.ref })
    .from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, user.tenantId));

  const stamp = now();
  await db.insert(schema.purchaseOrders).values({
    id: randomUUID(), tenantId: user.tenantId,
    ref: nextOrderRef(existing.map(e => e.ref)),
    supplier,
    what: short.length > 8 ? `${what}, and ${short.length - 8} more` : what,
    totalCents: total,
    state: 'draft',
    createdAt: stamp, updatedAt: stamp,
  });
  revalidatePath('/jobs');
  back('stock');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Supplier price files, and the pre-build job pack
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Give a kit its job pack — which SWMS, and what to check before leaving. */
export async function setKitPack(formData: FormData) {
  const user = await writer();
  const id = str(formData, 'id', 64);
  const [kit] = await db.select({ id: schema.kits.id }).from(schema.kits)
    .where(and(eq(schema.kits.id, id), eq(schema.kits.tenantId, user.tenantId)));
  if (!kit) back('catalogue', {}, 'That kit is not in this business.');

  await db.update(schema.kits).set({
    swms: str(formData, 'swms', 200) || null,
    checklist: JSON.stringify(splitChecklist(String(formData.get('checklist') ?? '').slice(0, 4000))),
  }).where(eq(schema.kits.id, id));
  revalidatePath('/jobs');
  back('catalogue');
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Design 17 · get paid and keep them
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Record a callback: a job that had to be gone back to.
 *
 * The cause is the whole record. Getting it wrong in either direction is expensive — a supplier's
 * faulty fitting written off as our workmanship is money the business is owed and never claims, and
 * a genuine workmanship callback invoiced as a call-out is a customer lost. So an unknown cause is
 * refused rather than defaulted: "workmanship" is the one that costs the business money, and
 * quietly assuming it would make the register lie in the expensive direction.
 */
export async function logCallback(formData: FormData) {
  const user = await writer();
  const jobId = str(formData, 'jobId', 64);
  const [job] = await db.select({ id: schema.jobs.id }).from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job) back('rework', {}, 'That job is not in this business.');

  const hours = Math.max(0, Math.min(200, Number(formData.get('hours')) || 0));

  /*
    ── The first question, and it is not the cause ──────────────────────────────────────────────

    Kris, 25 September: "if returning for troubleshooting etc and paid this is just a continuation
    of the job - anything paid simple job process - unpaid is re work and negative to the business".

    So a paid return never becomes a callback at all. The hours go on the job as ordinary time and
    it is invoiced like any other work — which is both the truth and the simpler path, because
    nobody has to answer a question about fault for work a customer is happily paying for.

    This also fixes the rate in the direction that mattered: counting paid returns as rework made a
    business that goes back often AND charges for it read as a business with a quality problem.
  */
  if (str(formData, 'paid', 8) === 'yes') {
    if (hours > 0) {
      const whoBack = str(formData, 'who', 120);
      await db.insert(schema.timesheetEntries).values({
        id: randomUUID(),
        tenantId: user.tenantId,
        jobId,
        /* Keyed on the name as typed, the way the rest of the Rework form records who went. */
        personKey: whoBack.toLowerCase().replace(/\s+/g, '-').slice(0, 64) || 'unknown',
        personName: whoBack || 'Unknown',
        day: new Date().toISOString().slice(0, 10),
        /*
          The office is recording a visit that already happened and knows how long it took, not
          clocking somebody on. Start is the honest anchor available — the minutes are what was
          entered, and finish is left off because nobody watched a clock.
        */
        startedAt: new Date().toISOString(),
        minutes: Math.round(hours * 60),
        /* Billable, because that is exactly what makes it a continuation rather than rework. */
        billable: true,
        source: 'return-visit',
        createdAt: new Date().toISOString(),
      });
    }
    revalidatePath('/jobs');
    back('pipeline');
  }

  const cause = str(formData, 'cause', 24);
  if (!isCause(cause)) back('rework', {}, 'SPEC does not know that cause.');

  /*
    ── What it cost, from the business's own labour rate ────────────────────────────────────────

    This wrote a flat `costCents: 0`, every time, which meant the unpaid-rework figure could never
    be anything but zero — the whole of "what did going back for nothing cost us" was a number that
    was structurally incapable of moving. Found by driving it rather than by reading it: the model
    was right, the tests were right, and nothing on earth was ever going to put a value in.

    Costed off the business's OWN cheapest labour rate, which is the conservative end. SPEC has no
    business inventing an hourly rate, so a business that has not set one gets a zero and a screen
    that says hours rather than pretending to know dollars — the same rule as the lodgement window
    in `lib/certificates` and the amount in `lib/apprentice-funding`.
  */
  const [rate] = await db.select({ costCents: schema.labourRates.costCents })
    .from(schema.labourRates)
    .where(eq(schema.labourRates.tenantId, user.tenantId))
    .orderBy(schema.labourRates.costCents)
    .limit(1);

  await db.insert(schema.callbacks).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId,
    cause,
    what: str(formData, 'what', 400),
    who: str(formData, 'who', 120),
    minutes: Math.round(hours * 60),
    costCents: Math.round(hours * (rate?.costCents ?? 0)),
    recoveredCents: 0,
    status: 'open',
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/jobs');
  back('rework');
}

/**
 * Where paid customers are sent to leave a review.
 *
 * One link for the whole business, used for everybody. There is deliberately nowhere to record a
 * second one — two links is how review gating starts.
 */
export async function setReviewLink(formData: FormData) {
  const user = await writer();
  const link = str(formData, 'link', 400);
  if (link && !/^https?:\/\//i.test(link)) {
    back('reviews', {}, 'That does not look like a link. Paste the whole address, starting with https.');
  }
  await db.update(schema.tenants).set({ reviewLink: link || null })
    .where(eq(schema.tenants.id, user.tenantId));
  revalidatePath('/jobs');
  back('reviews');
}

/**
 * Ask one paid customer for a review.
 *
 * `mayAsk` is the gate and it takes no account of how the job went — see the rule at the top of
 * lib/reviews. The only things it asks are: is the job paid, has this customer already been asked,
 * and is there a link to send them to.
 */
export async function askForReview(formData: FormData) {
  const user = await writer();
  const jobId = str(formData, 'jobId', 64);
  const [job] = await db.select({
    id: schema.jobs.id, stage: schema.jobs.stage, reviewAskedAt: schema.jobs.reviewAskedAt,
  }).from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job) back('reviews', {}, 'That job is not in this business.');

  const [tenant] = await db.select({ link: schema.tenants.reviewLink })
    .from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));

  const allowed = mayAsk({ stage: job.stage, reviewAskedAt: job.reviewAskedAt }, tenant?.link ?? null);
  if (!allowed.ok) back('reviews', {}, allowed.why);

  await db.update(schema.jobs).set({ reviewAskedAt: new Date().toISOString() })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  revalidatePath('/jobs');
  back('reviews');
}

/** Put a tool in the register. The value and the test date are what make the row worth having. */
export async function addTool(formData: FormData) {
  const user = await writer();
  const name = str(formData, 'name', 120);
  if (!name) back('tools', {}, 'A tool needs a name.');
  const value = Math.max(0, Math.min(1_000_000, Number(formData.get('value')) || 0));
  await db.insert(schema.tools).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    name,
    serial: str(formData, 'serial', 80) || null,
    heldBy: str(formData, 'heldBy', 120),
    valueCents: Math.round(value * 100),
    dueAt: str(formData, 'dueAt', 10) || null,
    status: 'held',
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/jobs');
  back('tools');
}

/** Add a tender package. The due date is what turns this from a list into a screen worth opening. */
export async function addTender(formData: FormData) {
  const user = await writer();
  const title = str(formData, 'title', 160);
  if (!title) back('tenders', {}, 'A tender needs a name.');
  const value = Math.max(0, Math.min(100_000_000, Number(formData.get('value')) || 0));
  await db.insert(schema.tenders).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    title,
    builder: str(formData, 'builder', 120),
    dueAt: str(formData, 'dueAt', 10) || null,
    valueCents: Math.round(value * 100),
    addenda: 0,
    takeoff: 'none',
    status: 'open',
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/jobs');
  back('tenders');
}

/**
 * Record a chase that has gone out on a quote.
 *
 * SPEC drafts it and works out which one is due; a person sends it from wherever they already send
 * things, and presses this. The row is what stops the same chase going twice — and what lets the
 * NEXT one be the right one, because a quote eleven days out needs the seven-day chase, not the
 * gentle first nudge eleven days late.
 *
 * Deliberately not an email send. A business's voice is its own, and the thing that wins the work
 * is that it came from the person who quoted it.
 */
export async function recordQuoteChase(form: FormData) {
  const user = await writer();
  const jobId = str(form, 'jobId', 64);
  const day = Number(form.get('day') ?? 0);
  if (!QUOTE_CHASE.includes(day as (typeof QUOTE_CHASE)[number])) back('growth');

  /* Found in this business, so a job id from anywhere else finds nothing. */
  const job = await ownJob(user.tenantId, jobId);
  if (!job) back('growth', {}, 'That quote is not in this business.');

  await db.insert(schema.quoteChases).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId,
    day,
    said: str(form, 'said', 2000) || null,
    sentAt: now(),
    sentBy: user.id,
  });
  back('growth');
}

/**
 * Split a job into another scope — a part of it a crew of its own does.
 *
 * Kris, 25 September: *"multi crew is common - split scopes with one supervisor overall"*.
 */
export async function addScope(form: FormData) {
  const user = await writer();
  const jobId = str(form, 'jobId', 64);
  const job = await ownJob(user.tenantId, jobId);
  if (!job) back('schedule', {}, 'That job is not in this business.');

  const name = str(form, 'name', 120);
  if (!name) back('schedule', { book: jobId }, 'Say what this part of the job is.');

  const leadName = str(form, 'leadName', 120);
  const existing = await db.select({ id: schema.jobScopes.id }).from(schema.jobScopes)
    .where(and(eq(schema.jobScopes.tenantId, user.tenantId), eq(schema.jobScopes.jobId, jobId)));

  await db.insert(schema.jobScopes).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId,
    name,
    leadKey: leadName ? leadName.toLowerCase().replace(/\s+/g, '-').slice(0, 64) : null,
    leadName: leadName || null,
    position: existing.length,
    createdAt: now(),
  });
  back('schedule', { book: jobId });
}

/**
 * Name the one person answerable for the whole job.
 *
 * Deliberately its own action rather than a field on the scope form. A supervisor is not a property
 * of a scope — that is the confusion the whole thing turns on — and a form that asked for both at
 * once would invite somebody to name a different one each time.
 */
export async function setSupervisor(form: FormData) {
  const user = await writer();
  const jobId = str(form, 'jobId', 64);
  const job = await ownJob(user.tenantId, jobId);
  if (!job) back('schedule', {}, 'That job is not in this business.');

  const who = str(form, 'supervisorName', 120);
  await db.update(schema.jobs).set({
    supervisorName: who || null,
    supervisorKey: who ? who.toLowerCase().replace(/\s+/g, '-').slice(0, 64) : null,
  }).where(eq(schema.jobs.id, jobId));
  back('schedule', { book: jobId });
}

/* ── The certificate that proves the work was lawful ─────────────────────────────────────────── */

/**
 * What the business calls its certificate, where it works, and how long it has to lodge one.
 *
 * Set once. The window is the business's own, from their own regulator — SPEC has none of its own
 * and says so rather than inventing one.
 */
export async function setCertificateSetup(form: FormData) {
  const user = await writer();
  const territory = str(form, 'territory', 8);
  const days = String(form.get('withinDays') ?? '').trim();

  await db.update(schema.tenants).set({
    certificateName: str(form, 'name', 120) || null,
    certificateTerritory: isTerritory(territory) ? territory : null,
    /* Blank means nobody has said, which is different from zero and must stay different. */
    certificateWithinDays: days === '' ? null : Math.max(0, Math.min(365, Number(days) || 0)),
  }).where(eq(schema.tenants.id, user.tenantId));
  back('certificates');
}

/** Written. Not the same as lodged, which is the whole reason these are two presses. */
export async function issueCertificate(form: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(form, 'jobId', 64));
  if (!job) back('certificates', {}, 'That job is not in this business.');

  await db.update(schema.jobs).set({
    certificateRef: str(form, 'ref', 60) || null,
    certificateIssuedAt: now(),
  }).where(eq(schema.jobs.id, job.id));
  back('certificates');
}

/**
 * Lodged with whoever has to receive it.
 *
 * The press that actually finishes it. A business that only ever reaches "issued" has a customer
 * holding a certificate and a regulator who never got one, which is the failure this screen exists
 * to make visible.
 */
export async function lodgeCertificate(form: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(form, 'jobId', 64));
  if (!job) back('certificates', {}, 'That job is not in this business.');
  if (!job.certificateIssuedAt) back('certificates', {}, 'Write it before you lodge it.');

  await db.update(schema.jobs).set({ certificateLodgedAt: now() })
    .where(eq(schema.jobs.id, job.id));
  back('certificates');
}

/**
 * This job does not need one — and why.
 *
 * A reason rather than a tick. Plenty of finished jobs genuinely need no certificate, and a business
 * that can silently skip them has a register that means nothing; one that has to say why has a
 * register somebody can audit.
 */
export async function excuseCertificate(form: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(form, 'jobId', 64));
  if (!job) back('certificates', {}, 'That job is not in this business.');

  const why = str(form, 'why', 200);
  if (!why) back('certificates', {}, 'Say why this one does not need a certificate.');

  await db.update(schema.jobs).set({ noCertificateBecause: why })
    .where(eq(schema.jobs.id, job.id));
  back('certificates');
}

/* ── A builder's agreed rates, and plant on hire ─────────────────────────────────────────────── */

/** Start a rate card against a customer. */
export async function addRateCard(form: FormData) {
  const user = await writer();
  const customerName = str(form, 'customerName', 200);
  const name = str(form, 'name', 120);
  if (!customerName || !name) back('rates', {}, 'A card needs a customer and a name.');

  await db.insert(schema.rateCards).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    customerKey: customerName.toLowerCase().replace(/\s+/g, '-').slice(0, 64),
    customerName,
    name,
    startsAt: str(form, 'startsAt', 10) || null,
    endsAt: str(form, 'endsAt', 10) || null,
    createdAt: now(),
  });
  back('rates');
}

/** One agreed rate, in the builder's own wording. */
export async function addRateLine(form: FormData) {
  const user = await writer();
  const cardId = str(form, 'cardId', 64);
  const [card] = await db.select({ id: schema.rateCards.id }).from(schema.rateCards)
    .where(and(eq(schema.rateCards.id, cardId), eq(schema.rateCards.tenantId, user.tenantId)));
  if (!card) back('rates', {}, 'That card is not in this business.');

  const what = str(form, 'what', 160);
  const dollars = Number(form.get('dollars'));
  if (!what || !Number.isFinite(dollars) || dollars <= 0) back('rates', {}, 'A rate needs wording and a price.');

  await db.insert(schema.rateCardLines).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    cardId,
    what,
    unit: str(form, 'unit', 24) || 'each',
    cents: Math.round(dollars * 100),
    createdAt: now(),
  });
  back('rates');
}

/** Put plant on hire against a job. */
export async function putOnHire(form: FormData) {
  const user = await writer();
  const job = await ownJob(user.tenantId, str(form, 'jobId', 64));
  if (!job) back('rates', {}, 'That job is not in this business.');

  const what = str(form, 'what', 160);
  if (!what) back('rates', {}, 'Say what went on hire.');

  const perDay = Number(form.get('perDay'));
  await db.insert(schema.plantHires).values({
    id: randomUUID(),
    tenantId: user.tenantId,
    jobId: job.id,
    what,
    supplier: str(form, 'supplier', 160) || null,
    onHireAt: now(),
    offHireAt: null,
    /* Null rather than zero: SPEC never invents what a day of hire costs. */
    perDayCents: Number.isFinite(perDay) && perDay > 0 ? Math.round(perDay * 100) : null,
    createdAt: now(),
  });
  back('rates');
}

/** Off hire. The press that stops the meter. */
export async function offHire(form: FormData) {
  const user = await writer();
  const id = str(form, 'hireId', 64);
  const [row] = await db.select({ id: schema.plantHires.id }).from(schema.plantHires)
    .where(and(eq(schema.plantHires.id, id), eq(schema.plantHires.tenantId, user.tenantId)));
  if (!row) back('rates', {}, 'That hire is not in this business.');

  await db.update(schema.plantHires).set({ offHireAt: now() })
    .where(eq(schema.plantHires.id, id));
  back('rates');
}
