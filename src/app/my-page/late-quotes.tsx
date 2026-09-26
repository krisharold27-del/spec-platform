import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { quoteWatch, chaseDraft, QUOTE_CHASE, type QuoteWatch } from '@/lib/growth';
import { CopyBox } from '@/components/copy-box';
import { SubmitButton } from '@/components/submit-button';
import { approveQuoteChase } from './actions';

/**
 * Late quotes, on My Page, for the company's administrator.
 *
 * Kris, 26 September: *"control is always in my page - this is associated with the administrator of
 * the company"*. The design (`SPEC My Page.dc.html`, 24 September) puts each quote whose chase has
 * come due here, with SPEC's draft and one press to approve it. The ladder, the drafts and the
 * record are the same ones Jobs uses (`lib/growth`, `quote_chases`), so the two screens can never
 * disagree about what is due.
 *
 * SPEC does not send the message itself: a business's voice is its own. The draft is here to copy
 * into wherever the administrator already talks to that customer; the button approves it and
 * records it as sent, which is what stops the same chase going twice.
 */
export async function LateQuotes({ tenantId, business, chased }: {
  tenantId: string;
  business: string;
  /** The job whose chase was just approved, to say so in place. */
  chased?: string;
}) {
  const [jobs, chases] = await Promise.all([
    db.select().from(schema.jobs).where(and(eq(schema.jobs.tenantId, tenantId), eq(schema.jobs.stage, 'quoted'))),
    db.select().from(schema.quoteChases).where(eq(schema.quoteChases.tenantId, tenantId)),
  ]);
  const chasedBy = new Map<string, number[]>();
  for (const c of chases) chasedBy.set(c.jobId, [...(chasedBy.get(c.jobId) ?? []), c.day]);

  const now = new Date();
  const due: QuoteWatch[] = jobs
    .filter(j => j.quotedAt)
    .map(j => quoteWatch({
      id: j.id, ref: j.ref, client: j.client || 'the customer',
      valueCents: j.valueCents ?? 0, sentAt: j.quotedAt!,
      chasedDays: chasedBy.get(j.id) ?? [],
    }, now))
    .filter(w => w.state === 'chase' && w.due)
    .sort((a, b) => b.daysOut - a.daysOut);
  const justSent = chased ? jobs.find(j => j.id === chased) : undefined;

  /* Nothing due is nothing to show: My Page stays short rather than drawing an empty box. */
  if (!due.length && !justSent) return null;

  return (
    <section id="late-quotes" className="card mt-4" data-late-quotes>
      <h2 className="font-serif text-lg text-ink">Quotes waiting on a chase</h2>
      <ul className="mt-3 grid gap-3">
        {justSent && (
          <li className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            Sent · {justSent.client || 'the customer'} has it
          </li>
        )}
        {due.map(w => {
          const draft = chaseDraft(w.quote, w.due!, business);
          const which = QUOTE_CHASE.indexOf(w.due!) + 1;
          return (
            <li key={w.quote.id} className="rounded-2xl bg-cream p-4">
              <p className="text-sm text-ink"><strong>{w.quote.client} · {w.quote.ref}</strong></p>
              <p className="mt-0.5 text-[13px] text-ink-light">{w.says}</p>
              <p className="text-[13px] text-ink-light">Chase {which} of {QUOTE_CHASE.length}</p>
              <form action={approveQuoteChase} className="mt-3 grid gap-2">
                <input type="hidden" name="jobId" value={w.quote.id} />
                <input type="hidden" name="day" value={w.due!} />
                <input type="hidden" name="said" value={draft} />
                <CopyBox label="SPEC's draft" value={draft} rows={3} />
                <span className="flex flex-wrap items-center gap-3">
                  <SubmitButton className="btn-primary w-fit text-sm" pending="…">
                    Approve SPEC&apos;s draft and send
                  </SubmitButton>
                  <Link href="/jobs?tab=growth" className="btn-secondary text-sm">Open it</Link>
                </span>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
