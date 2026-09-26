import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { CopyBox } from '@/components/copy-box';
import { SubmitButton } from '@/components/submit-button';
import { cleanReading, questionsMessage, checkLine } from '@/lib/understand';
import { lineFrom, parseComponents, priceQuote, DEFAULT_MARKUP, type Kit, type QuoteLine } from '@/lib/jobs';
import { approveQuestions, buildQuoteFromReading } from './understand-actions';
import { UnderstandForm } from './understand-form';

const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-AU')}`;

/**
 * Understand the work — on the pipeline, for a job still being quoted. Photos, plans and what the
 * customer said go in; what SPEC sees, the job as SPEC reads it (priced from this business's own
 * pre-builds), the questions worth asking first, and one press to build the quote come out.
 */
export async function UnderstandPanel({ tenantId, jobId, manage, business }: {
  tenantId: string; jobId?: string; manage: boolean; business: string;
}) {
  if (!manage) return null;
  const open = await db.select({ id: schema.jobs.id, ref: schema.jobs.ref, title: schema.jobs.title, client: schema.jobs.client })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.tenantId, tenantId), inArray(schema.jobs.stage, ['enquiry', 'quoted'])))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(40);
  if (!open.length) return null;
  const job = open.find(j => j.id === jobId) ?? open[0];

  const [latest] = await db.select().from(schema.jobReadings)
    .where(and(eq(schema.jobReadings.tenantId, tenantId), eq(schema.jobReadings.jobId, job.id)))
    .orderBy(desc(schema.jobReadings.createdAt)).limit(1);

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
    const reading = cleanReading(JSON.parse(latest.reading), kits);
    const ctx = { items, kits, rates };
    const kitLines = reading.scope
      .map(s => lineFrom('kit', s.kitId, ctx, s.qty))
      .filter((l): l is QuoteLine => !!l);
    const extraHours = reading.extras.reduce((a, e) => a + e.hours, 0);
    const extraLine = extraHours > 0 && rates[0] ? lineFrom('labour', rates[0].id, ctx, Math.round(extraHours * 10) / 10) : null;
    const totals = priceQuote([...kitLines, ...(extraLine ? [extraLine] : [])], DEFAULT_MARKUP);
    const hours = kitLines.reduce((a, l) => a + l.hours * l.qty, 0) + (extraLine ? extraHours : 0);
    const ask = questionsMessage(job.client, reading.questions, business);

    body = (
      <div className="mt-5 grid gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">What SPEC sees</h3>
          {!latest.byModel && (
            <p className="mt-1 text-[13px] text-ink-light">Read from the words only — SPEC&apos;s reading was not available, so the photos are kept for a person to look through.</p>
          )}
          <ul className="mt-2 grid gap-1.5">
            {reading.sees.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span aria-hidden className={`mt-1.5 h-2 w-2 flex-none rounded-full ${s.flag === 'check' ? 'bg-rust' : 'bg-light-green'}`} />
                <span><strong>{s.from}:</strong> {s.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">The job, as SPEC reads it</h3>
          {kitLines.length === 0 && !extraLine ? (
            <p className="mt-1 text-[13px] text-ink-light">Nothing here matches one of your pre-builds yet. Add the pre-build once and every job like this prices itself.</p>
          ) : (
            <ul className="mt-2 grid gap-1">
              {kitLines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 text-sm"><span>{l.name}{l.qty !== 1 ? ` × ${l.qty}` : ''}</span><span>{money((totals.lines[i]?.sellCents ?? 0) * 1.1)}</span></li>
              ))}
              {reading.extras.map((e, i) => (
                <li key={`x${i}`} className="flex justify-between gap-3 text-sm"><span>{e.label}</span><span>+{e.hours} h</span></li>
              ))}
            </ul>
          )}
          {totals.exGstCents > 0 && (
            <p className="mt-2 text-sm text-ink">
              <strong className="font-serif text-lg">{money(totals.exGstCents + totals.gstCents)}</strong>{' '}
              <span className="text-ink-light">inc GST · {Math.round(hours * 10) / 10} hours · your own pre-builds and labour rate</span>
            </p>
          )}
        </div>

        {reading.questions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink">{checkLine(job.client, reading.questions.length)}</h3>
            {latest.questionsApprovedAt ? (
              <p className="mt-1 text-[13px] font-semibold text-sage-800">Sent · their answers will update the quote</p>
            ) : (
              <form action={approveQuestions} className="mt-2 grid gap-2">
                <input type="hidden" name="id" value={latest.id} />
                <CopyBox label="SPEC's message" value={ask} rows={3} />
                <SubmitButton className="btn-secondary w-fit text-sm" pending="…">Approve and send</SubmitButton>
              </form>
            )}
          </div>
        )}

        {latest.quoteId ? (
          <p className="text-[13px] font-semibold text-sage-800">
            Quote built · <Link className="underline" href={`/jobs?tab=quotes&quote=${latest.quoteId}`}>open it to send</Link>
          </p>
        ) : (kitLines.length > 0 || extraLine) && (
          <form action={buildQuoteFromReading}>
            <input type="hidden" name="id" value={latest.id} />
            <SubmitButton className="btn-primary w-fit text-sm" pending="Building…">Build the quote</SubmitButton>
          </form>
        )}
      </div>
    );
  }

  return (
    <section id="understand" aria-label="Understand the work" className="card mb-6" data-understand>
      <h2 className="font-serif text-xl text-ink">Understand the work</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-light">
        Photos, plans and what the customer said. SPEC works out the job before you quote it.
      </p>
      {open.length > 1 && (
        <nav aria-label="Which job" className="mt-3 flex flex-wrap gap-2">
          {open.slice(0, 8).map(j => (
            <Link key={j.id} href={`/jobs?tab=pipeline&job=${j.id}#understand`}
              className={`rounded-full px-3 py-1 text-[13px] ${j.id === job.id ? 'bg-ink text-white' : 'bg-cream text-ink'}`}>
              {j.ref} · {j.client}
            </Link>
          ))}
        </nav>
      )}
      <p className="mt-3 text-sm text-ink"><strong>{job.ref}</strong> · {job.title} · {job.client}</p>
      <UnderstandForm jobId={job.id} />
      {body}
    </section>
  );
}
