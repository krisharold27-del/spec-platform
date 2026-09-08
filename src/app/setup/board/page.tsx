import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { CADENCE, cadenceOf, governanceChecks, type Cadence } from '@/lib/governance';
import { setCadence, addDirector, standDownDirector, recordBoardMeeting } from './actions';

export const dynamic = 'force-dynamic';

const ERROR: Record<string, string> = {
  name: "A director needs a name — it's the register the board is accountable through.",
  date: 'A board meeting needs a date.',
};

/**
 * How the board runs, and who is on it.
 *
 * Both are Compliance questions, not admin: a business that cannot say when its board last met, or
 * who its directors are, has a governance gap however good the safety numbers look. Asking for it
 * once here means the board pack can report it every month without anyone chasing it.
 */
export default async function BoardSetup({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const error = ERROR[String(sp.error ?? '')];

  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const cadence = cadenceOf(tenant.boardCadence);
  const directors = await db.select().from(schema.directors).where(eq(schema.directors.tenantId, user.tenantId));
  const meetings = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, user.tenantId)))
    .filter(m => m.type === 'board')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const checks = governanceChecks(cadence, meetings, directors);

  return (
    <Shell
      title="How your board runs"
      subtitle="The board is the fourth audience on the same data. This decides how often it sits and who sits on it — both reported in Compliance every period."
    >
      {error && <div className="mb-4 rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm">{error}</div>}
      {sp.saved && <div className="mb-4 rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-900">Saved.</div>}

      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <div className="label-caps">How often does the board sit?</div>
        <form action={setCadence} className="mt-3 space-y-3">
          {(Object.keys(CADENCE) as Cadence[]).map(k => (
            <label key={k} className="flex gap-3 rounded-lg border border-ink/10 p-4 hover:border-rust">
              <input type="radio" name="cadence" value={k} defaultChecked={cadence === k} className="mt-1" />
              <span>
                <span className="font-medium text-ink">{CADENCE[k].label}</span>
                <span className="block text-sm text-ink-light">{CADENCE[k].note}</span>
              </span>
            </label>
          ))}
          <button className="btn-primary">Save</button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5">
        <div className="label-caps">Directors</div>
        {directors.filter(d => d.active).length > 0 ? (
          <ul className="mt-2 divide-y divide-ink/10">
            {directors.filter(d => d.active).map(d => (
              <li key={d.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <span>
                  <span className="font-medium text-ink">{d.name}</span>
                  {d.title && <span className="text-sm text-ink-light"> — {d.title}</span>}
                  {d.appointedAt && <span className="text-xs text-ink-light"> · appointed {d.appointedAt}</span>}
                </span>
                <form action={standDownDirector}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-sm text-ink-light underline hover:text-rust">Stood down</button>
                </form>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-light">None recorded yet.</p>}

        <form action={addDirector} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input name="name" placeholder="Name" autoComplete="off" className="rounded-lg border border-ink/20 p-3 text-base" />
          <input name="title" placeholder="Chair, director, owner…" autoComplete="off" className="rounded-lg border border-ink/20 p-3 text-base" />
          <input name="appointedAt" type="date" className="rounded-lg border border-ink/20 p-3 text-base" />
          <button className="btn-secondary sm:col-span-3 sm:w-auto sm:justify-self-start">Add director</button>
        </form>
        <p className="mt-2 text-xs text-ink-light">
          Standing someone down keeps them on the record — who was on the board when a pack was approved is part of that pack.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5">
        <div className="label-caps">Board meetings</div>
        {meetings.length > 0 ? (
          <ul className="mt-2 divide-y divide-ink/10">
            {meetings.slice(0, 6).map(m => (
              <li key={m.id} className="py-2.5 text-sm">
                <span className="font-medium text-ink">{m.date}</span>
                <span className="text-ink-light"> — {m.minutes ? 'minutes recorded' : 'no minutes yet'}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink-light">None recorded yet. An unrecorded meeting reads the same as one that never happened.</p>}

        <form action={recordBoardMeeting} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="date" type="date" required className="rounded-lg border border-ink/20 p-3 text-base" />
          <input name="minutes" placeholder="Minutes or a link to them" autoComplete="off" className="rounded-lg border border-ink/20 p-3 text-base" />
          <button className="btn-secondary sm:col-span-2 sm:w-auto sm:justify-self-start">Record a meeting</button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5">
        <div className="label-caps">What the board pack will say</div>
        <ul className="mt-2 divide-y divide-ink/10">
          {checks.map(c => (
            <li key={c.id} className="py-2.5 text-sm">
              <span className="font-medium text-ink">{c.question}</span>
              <span className="block text-ink-light">{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
