import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { CopyBox } from '@/components/copy-box';
import { SubmitButton } from '@/components/submit-button';
import { KIND_LABEL, inboxSummary, type InboxKind } from '@/lib/email-read';
import { addInboxMessage, approveInboxItem } from './inbox-actions';

/**
 * From your inboxes — on the pipeline, above the columns, because a message somebody meant to answer
 * tonight is the first thing a pipeline loses. Each one: what kind of thing it is, who from, what
 * SPEC read in it, the reply SPEC would send, and Approve. Answered ones stay for a day, saying what
 * happened, then leave the list.
 */
export async function InboxPanel({ tenantId, manage }: { tenantId: string; manage: boolean }) {
  const rows = await db.select().from(schema.mailboxMessages)
    .where(eq(schema.mailboxMessages.tenantId, tenantId))
    .orderBy(desc(schema.mailboxMessages.addedAt))
    .limit(60);
  const dayAgo = Date.now() - 86_400_000;
  const open = rows.filter(r => !r.doneAt);
  const recent = rows.filter(r => r.doneAt && Date.parse(r.doneAt) > dayAgo);
  const shown = [...open, ...recent].slice(0, 12);

  return (
    <section id="inbox" aria-label="From your inboxes" className="card mb-6" data-inbox>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">From your inboxes</h2>
        <span className="text-sm text-ink-light">{inboxSummary(open.map(r => ({ kind: r.kind as InboxKind })))}</span>
      </div>

      {shown.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {shown.map(r => (
            <li key={r.id} className="rounded-2xl bg-cream p-4">
              <p className="text-sm text-ink">
                <span className="mr-2 rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold">{KIND_LABEL[r.kind as InboxKind] ?? 'Message'}</span>
                <strong>{r.fromName}</strong>
              </p>
              <p className="mt-1 text-sm text-ink">{r.subject}</p>
              <p className="mt-0.5 text-[13px] text-ink-light">{r.readLine}</p>
              {!r.doneAt ? (
                manage && (
                  <form action={approveInboxItem} className="mt-3 grid gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <CopyBox label="SPEC's reply" value={r.reply} rows={3} />
                    <SubmitButton className="btn-primary w-fit text-sm" pending="…">Approve</SubmitButton>
                  </form>
                )
              ) : (
                <p className="mt-2 text-[13px] font-semibold text-sage-800">
                  {r.jobId ? 'Approved · the enquiry is on the pipeline' : 'Approved · answered'}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {manage && (
        <form action={addInboxMessage} className="mt-4 grid gap-2">
          <label className="text-sm text-ink" htmlFor="inbox-message">Forward or paste an email</label>
          <textarea id="inbox-message" name="message" rows={4} required minLength={8} maxLength={20000}
            className="w-full rounded-2xl border border-ink/15 bg-white p-3 text-sm"
            placeholder={'From: …\nSubject: …\n\nThe message'} />
          <SubmitButton className="btn-secondary w-fit text-sm" pending="Reading…">Read it</SubmitButton>
        </form>
      )}
      <p className="mt-3 text-[13px] text-ink-light">
        SPEC reads what is put here and drafts the reply; nothing is sent until a person approves it,
        and then it goes from your own email. Anything a person marks private is never read.
      </p>
    </section>
  );
}
