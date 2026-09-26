import Link from 'next/link';
import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import { parseComponents } from '@/lib/jobs';
import { materialsFor, ordersFrom } from '@/lib/materials';
import { orderJobMaterials } from './materials-actions';

const money = (c: number) => `$${(c / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Materials for a job — on Catalogue, beside the prices it is built from. What the job's quote needs,
 * each line from the supplier with it cheapest in this business's own catalogue, and one press to
 * raise the orders.
 */
export async function MaterialsPanel({ tenantId, jobId, manage }: { tenantId: string; jobId?: string; manage: boolean }) {
  const quoted = await db.selectDistinct({ jobId: schema.quotes.jobId }).from(schema.quotes).where(eq(schema.quotes.tenantId, tenantId));
  if (!quoted.length) return null;
  const jobs = await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, client: schema.jobs.client, site: schema.jobs.site })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.id, quoted.map(q => q.jobId)),
      inArray(schema.jobs.stage, ['enquiry', 'quoted', 'won', 'scheduled', 'onsite'])))
    .orderBy(desc(schema.jobs.createdAt)).limit(30);
  if (!jobs.length) return null;
  const job = jobs.find(j => j.id === jobId) ?? jobs[0];

  const quotes = await db.select().from(schema.quotes).where(and(eq(schema.quotes.tenantId, tenantId), eq(schema.quotes.jobId, job.id)))
    .orderBy(schema.quotes.createdAt);
  const quote = quotes.filter(q => q.status === 'sent').at(-1) ?? quotes.at(-1)!;
  const [lines, kitRows, items, ordered] = await Promise.all([
    db.select().from(schema.quoteLines).where(and(eq(schema.quoteLines.tenantId, tenantId), eq(schema.quoteLines.quoteId, quote.id))),
    db.select().from(schema.kits).where(eq(schema.kits.tenantId, tenantId)),
    db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, tenantId)),
    db.select({ ref: schema.purchaseOrders.ref, supplier: schema.purchaseOrders.supplier }).from(schema.purchaseOrders)
      .where(and(eq(schema.purchaseOrders.tenantId, tenantId), eq(schema.purchaseOrders.jobId, job.id), like(schema.purchaseOrders.note, `Materials for ${job.ref}%`))),
  ]);
  const materials = materialsFor(
    lines.map(l => ({ kind: l.kind, refId: l.refId, qty: l.qty })),
    kitRows.map(k => ({ id: k.id, components: parseComponents(k.components) })),
    items.map(i => ({ id: i.id, name: i.name, supplier: i.supplier, unit: i.unit, costCents: i.costCents })),
  );
  const total = materials.reduce((a, m) => a + m.totalCents, 0);
  const saved = materials.reduce((a, m) => a + m.savedCents, 0);
  const suppliers = ordersFrom(materials).length;

  return (
    <section id="materials" aria-label="Materials for the job" className="card mt-6" data-materials>
      <h2 className="font-serif text-xl text-ink">Materials for {job.ref}</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
        {job.site ? `${job.site}. ` : ''}Built from the job&apos;s pre-builds, each line at the best price in your own catalogue.
      </p>
      {jobs.length > 1 && (
        <nav aria-label="Which job" className="mt-3 flex flex-wrap gap-2">
          {jobs.slice(0, 8).map(j => (
            <Link key={j.id} href={`/jobs?tab=catalogue&job=${j.id}#materials`}
              className={`rounded-full px-3 py-1 text-[13px] ${j.id === job.id ? 'bg-ink text-white' : 'bg-cream text-ink'}`}>
              {j.ref} · {j.client}
            </Link>
          ))}
        </nav>
      )}
      {materials.length === 0 ? (
        <p className="mt-3 text-sm text-ink-light">This job&apos;s quote has no parts from your catalogue on it — labour only, or pre-builds without their parts listed.</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-1">
            {materials.map(m => (
              <li key={m.itemId} className="flex flex-wrap justify-between gap-3 text-sm">
                <span><strong>{m.qty} × {m.name}</strong> <span className="text-ink-light">· {m.supplier}</span></span>
                <span>{money(m.totalCents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <strong className="font-serif text-lg">{money(total)}</strong>{' '}
            <span className="text-ink-light">ex GST · {suppliers} {suppliers === 1 ? 'supplier' : 'suppliers'}{saved > 0 ? ` · ${money(saved)} less than buying it all from the dearest` : ''}</span>
          </p>
          {ordered.length ? (
            <p className="mt-2 text-[13px] font-semibold text-sage-800">
              {ordered.length} {ordered.length === 1 ? 'order' : 'orders'} raised · {ordered.map(o => `${o.ref} ${o.supplier}`).join(', ')}
            </p>
          ) : manage && (
            <form action={orderJobMaterials} className="mt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <SubmitButton className="btn-primary w-fit text-sm" pending="Ordering…">Order it all</SubmitButton>
            </form>
          )}
        </>
      )}
    </section>
  );
}
