import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import { cleanTakeoff, takeoffLine } from '@/lib/understand';
import { lineFrom, parseComponents, priceQuote, DEFAULT_MARKUP, type Kit } from '@/lib/jobs';
import { approveTakeoff } from './understand-actions';
import { PlansForm } from './plans-form';

const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-AU')}`;

/**
 * Estimate from plans — on Takeoff. The drawings go in; every count comes back against this
 * business's own pre-builds, priced, with anything SPEC was not sure of marked. Approving a clean
 * count builds and records the quote; a count with anything marked opens as a draft to check first.
 */
export async function PlansPanel({ tenantId, jobId, manage }: { tenantId: string; jobId?: string; manage: boolean }) {
  if (!manage) return null;
  const open = await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, title: schema.jobs.title, client: schema.jobs.client })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.stage, ['enquiry', 'quoted'])))
    .orderBy(desc(schema.jobs.createdAt)).limit(40);
  if (!open.length) return null;
  const job = open.find(j => j.id === jobId) ?? open[0];
  const first = job.client.trim().split(/\s+/)[0] || 'them';

  const [latest] = await db.select().from(schema.planTakeoffs)
    .where(and(eq(schema.planTakeoffs.tenantId, tenantId), eq(schema.planTakeoffs.jobId, job.id)))
    .orderBy(desc(schema.planTakeoffs.createdAt)).limit(1);

  let body: React.ReactNode = null;
  if (latest) {
    const [kitRows, items, rates] = await Promise.all([
      db.select().from(schema.kits).where(eq(schema.kits.tenantId, tenantId)),
      db.select().from(schema.catalogueItems).where(eq(schema.catalogueItems.tenantId, tenantId)),
      db.select().from(schema.labourRates).where(eq(schema.labourRates.tenantId, tenantId))
        .orderBy(schema.labourRates.position, schema.labourRates.createdAt),
    ]);
    const kits: Kit[] = kitRows.map(k => ({
      id: k.id, name: k.name, components: parseComponents(k.components),
      labourHours: k.labourHours, labourRateId: k.labourRateId, extraCostCents: k.extraCostCents,
    }));
    const rows = cleanTakeoff(JSON.parse(latest.rows), kits);
    const ctx = { items, kits, rates };
    const priced = rows.map(r => {
      const l = lineFrom('kit', r.kitId, ctx, r.qty);
      return { r, name: l?.name ?? '', inc: l ? Math.round(priceQuote([l], DEFAULT_MARKUP).exGstCents * 1.1) : 0 };
    });
    const total = priced.reduce((a, p) => a + p.inc, 0);
    const [quote] = latest.quoteId
      ? await db.select({ ref: schema.quotes.ref, status: schema.quotes.status }).from(schema.quotes)
          .where(and(eq(schema.quotes.id, latest.quoteId), eq(schema.quotes.tenantId, tenantId)))
      : [];
    const sure = rows.every(r => !r.unsure);

    body = !rows.length ? (
      <p className="mt-4 text-sm text-ink-light">
        {latest.byModel
          ? 'Nothing on these plans matched one of your pre-builds. Add the pre-build once and plans like these count themselves.'
          : 'Counting plans needs SPEC’s reading, which was not available just now. The plans are kept — try again, or add the counts in the quote builder.'}
      </p>
    ) : (
      <div className="mt-4 grid gap-3">
        <p className="text-[13px] text-ink-light">From {latest.fileName || 'the plans'}</p>
        <ul className="grid gap-1">
          {priced.map((p, i) => (
            <li key={i} className="flex justify-between gap-3 text-sm">
              <span>{p.name}{p.r.where ? ` · ${p.r.where}` : ''} × {p.r.qty}{p.r.unsure && <span className="ml-2 rounded-full bg-rust-100 px-2 py-0.5 text-[12px] text-rust-700">confirm</span>}</span>
              <span>{money(p.inc)}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm"><strong className="font-serif text-lg">{money(total)}</strong> <span className="text-ink-light">inc GST · {takeoffLine(rows)}</span></p>
        {quote ? (
          <p className="text-[13px] font-semibold text-sage-800">
            {quote.status === 'sent' ? `Quote ${quote.ref} sent · on the Jobs board` : <>Quote {quote.ref} built · <Link className="underline" href={`/jobs?tab=quotes&quote=${latest.quoteId}`}>check the marked counts and send it</Link></>}
          </p>
        ) : (
          <form action={approveTakeoff}>
            <input type="hidden" name="id" value={latest.id} />
            <SubmitButton className="btn-primary w-fit text-sm" pending="…">
              {sure ? `Approve and send to ${first}` : 'Build it and check the marked counts'}
            </SubmitButton>
          </form>
        )}
        <p className="text-[13px] text-ink-light">Check the counts before you send. Anything SPEC wasn&apos;t sure of is marked for you to confirm.</p>
      </div>
    );
  }

  return (
    <section id="plans" aria-label="Estimate from plans" className="card mt-6" data-plans>
      <h2 className="font-serif text-xl text-ink">Estimate from plans</h2>
      <p className="mt-1 text-sm text-ink-light">Drop the plans. SPEC counts everything and prices it from your pre-builds.</p>
      {open.length > 1 && (
        <nav aria-label="Which job" className="mt-3 flex flex-wrap gap-2">
          {open.slice(0, 8).map(j => (
            <Link key={j.id} href={`/jobs?tab=takeoff&job=${j.id}#plans`}
              className={`rounded-full px-3 py-1 text-[13px] ${j.id === job.id ? 'bg-ink text-white' : 'bg-cream text-ink'}`}>
              {j.ref} · {j.client}
            </Link>
          ))}
        </nav>
      )}
      <p className="mt-3 text-sm text-ink"><strong>{job.ref}</strong> · {job.title} · {job.client}</p>
      <PlansForm jobId={job.id} />
      {body}
    </section>
  );
}
