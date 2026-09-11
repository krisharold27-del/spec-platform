import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { CATEGORIES, categoryName, STATUS_LABEL } from '@/lib/systems';
import { addConnection, removeConnection } from './actions';

export const dynamic = 'force-dynamic';

const ERROR: Record<string, string> = {
  name: 'Give the system a name — whatever you call it day to day is fine.',
  owner: 'We need an email address for whoever manages that system, so we can ask them to connect it.',
};

/**
 * "Get live KPIs by connecting the systems you already run."
 *
 * A free-text box, not a dropdown of vendors: this platform has to work for a business on Simpro
 * and Xero and for one on AroFlo and MYOB, without either of them feeling like the odd one out.
 * The client names what they run; SPEC only needs to know what kind of number it produces.
 */
export default async function Systems({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const error = ERROR[String(sp.error ?? '')];

  const connections = await db.select().from(schema.systemConnections)
    .where(eq(schema.systemConnections.tenantId, user.tenantId));

  return (
    <Shell
      title="Connect the systems you already run"
      subtitle="Optional. Everything in SPEC works without this — connecting simply means the numbers arrive on their own instead of being typed in each month."
    >
      {error && <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm">{error}</div>}
      {sp.added && (
        <div className="mb-4 rounded-lg border-l-4 border-sage-600 bg-sage-100 p-4 text-sm text-sage-900">
          Added. Nothing breaks while it&apos;s being set up — any KPI it feeds stays on manual entry until the connection is live.
        </div>
      )}

      {connections.length > 0 && (
        <section className="mb-6 rounded-lg border border-ink/10 bg-surface">
          <div className="border-b border-ink/10 p-4 label-caps">Your systems</div>
          <ul className="divide-y divide-ink/10">
            {connections.map(c => (
              <li key={c.id} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <div className="font-medium text-ink">{c.name}</div>
                  <div className="text-sm text-ink-light">
                    {categoryName(c.category)} · {STATUS_LABEL[c.status] ?? c.status}
                    {c.ownerEmail && ` · ${c.ownerName ?? c.ownerEmail} is setting it up`}
                  </div>
                </div>
                <form action={removeConnection}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-sm text-ink-light underline hover:text-rust">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={addConnection} className="rounded-lg border border-ink/10 bg-surface p-5">
        <label className="label-caps" htmlFor="name">What system do you use?</label>
        <input
          id="name" name="name" required autoComplete="off"
          placeholder="Type whatever you run — the name you call it is fine"
          className="mt-1 w-full rounded-lg border border-ink/20 p-3 text-base"
        />
        <p className="mt-1 text-xs text-ink-light">
          Anything that holds a number you want on a scorecard counts — including a spreadsheet.
        </p>

        <label className="label-caps mt-5 block" htmlFor="category">What does it hold?</label>
        <select id="category" name="category" className="mt-1 w-full rounded-lg border border-ink/20 p-3 text-base">
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name} — {c.asks}</option>)}
        </select>

        {/*
          * The person setting SPEC up is very often not the person who administers the accounting
          * package. Asking is the difference between a connection that happens and one that stalls
          * on someone's to-do list for a month.
          */}
        <fieldset className="mt-5">
          <legend className="label-caps">Who looks after it?</legend>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="radio" name="owner" value="me" defaultChecked /> I do
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="radio" name="owner" value="someone_else" /> Someone else in the business does
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="ownerName" placeholder="Their name" autoComplete="off" className="rounded-lg border border-ink/20 p-3 text-base" />
            <input name="ownerEmail" type="email" placeholder="Their email" autoComplete="off" className="rounded-lg border border-ink/20 p-3 text-base" />
          </div>
          <p className="mt-1 text-xs text-ink-light">
            They&apos;ll be asked to connect this one system. It doesn&apos;t give them a SPEC login or add a seat.
          </p>
        </fieldset>

        <button className="btn-primary mt-5">Add this system</button>
      </form>

      <p className="mt-6 text-sm text-ink-light">
        If a connection ever stops working, nobody in the business sees an error. The KPI it feeds falls
        back to being marked by hand, and only the person who set it up is told — quietly, by email.
      </p>
    </Shell>
  );
}
