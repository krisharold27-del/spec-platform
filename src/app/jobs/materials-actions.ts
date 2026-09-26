'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, schema } from '@/db';
import { requireManager } from '@/lib/guard';
import { assertWritable } from '@/lib/plan';
import { nextOrderRef } from '@/lib/purchasing';
import { parseComponents } from '@/lib/jobs';
import { materialsFor, ordersFrom } from '@/lib/materials';

/**
 * Order it all: one purchase order per supplier for everything the job's quote needs, each tagged to
 * the job so the bill can be matched against it later. Worked out again here from the database — the
 * page's list is never trusted for what goes on an order. Pressed twice, it orders once.
 */
export async function orderJobMaterials(form: FormData) {
  const user = await requireManager();
  await assertWritable(user.tenantId);
  const jobId = String(form.get('jobId') ?? '').slice(0, 64);
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.tenantId, user.tenantId)));
  if (!job) redirect('/jobs?tab=catalogue');

  const tag = `Materials for ${job.ref}`;
  const already = await db.select({ id: schema.purchaseOrders.id }).from(schema.purchaseOrders).where(and(
    eq(schema.purchaseOrders.tenantId, user.tenantId), eq(schema.purchaseOrders.jobId, job.id), like(schema.purchaseOrders.note, `${tag}%`),
  ));
  if (already.length) redirect(`/jobs?tab=catalogue&job=${job.id}#materials`);

  const quotes = await db.select().from(schema.quotes).where(and(eq(schema.quotes.tenantId, user.tenantId), eq(schema.quotes.jobId, job.id)))
    .orderBy(schema.quotes.createdAt);
  const quote = quotes.filter(q => q.status === 'sent').at(-1) ?? quotes.at(-1);
  if (!quote) redirect(`/jobs?tab=catalogue&job=${job.id}#materials`);
  const [lines, kitRows, items] = await Promise.all([
    db.select().from(schema.quoteLines).where(and(eq(schema.quoteLines.tenantId, user.tenantId), eq(schema.quoteLines.quoteId, quote.id))),
    db.select().from(schema.kits).where(eq(schema.kits.tenantId, user.tenantId)),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, user.tenantId)),
  ]);
  const orders = ordersFrom(materialsFor(
    lines.map(l => ({ kind: l.kind, refId: l.refId, qty: l.qty })),
    kitRows.map(k => ({ id: k.id, components: parseComponents(k.components) })),
    items.map(i => ({ id: i.id, name: i.name, supplier: i.supplier, unit: i.unit, costCents: i.costCents })),
  ));
  const refs = (await db.select({ ref: schema.purchaseOrders.ref }).from(schema.purchaseOrders)
    .where(eq(schema.purchaseOrders.tenantId, user.tenantId))).map(r => r.ref);
  const at = new Date().toISOString();
  for (const o of orders) {
    const ref = nextOrderRef(refs);
    refs.push(ref);
    await db.insert(schema.purchaseOrders).values({
      id: randomUUID(), tenantId: user.tenantId, ref, supplier: o.supplier, jobId: job.id,
      what: o.what, totalCents: o.totalCents, state: 'sent', note: tag,
      createdAt: at, updatedAt: at,
    });
  }
  revalidatePath('/jobs');
  redirect(`/jobs?tab=catalogue&job=${job.id}#materials`);
}
