import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getRoles } from '@/lib/queries';
import { PILLARS, type Pillar } from '@/lib/scoring';
import { Shell, PILLAR_META, Badge } from '@/components/ui';
import { saveCriteria, loadVirtualGmKpis } from './actions';

export const dynamic = 'force-dynamic';

export default async function KpiSetup({ searchParams }: { searchParams: Promise<{ role?: string; err?: string; saved?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const roles = (await getRoles(user.tenantId)).filter(r => r.level !== 'staff');
  const role = roles.find(r => r.id === sp.role) ?? roles[0];
  if (!role) return <Shell title="KPIs"><p>Define roles first.</p></Shell>;
  const crit = await db.select().from(schema.criteria).where(and(eq(schema.criteria.roleId, role.id), eq(schema.criteria.active, true))).orderBy(schema.criteria.sortOrder);

  return (
    <Shell title="KPIs per role" subtitle="Two per pillar to start, and add as many as you like. Targets are negotiated, so leave one blank until it is agreed.">
      <nav className="flex flex-wrap gap-2 text-sm">
        {roles.map(r => <a key={r.id} href={`/setup/kpis?role=${r.id}`} className={`rounded-full border px-3 py-1 ${r.id === role.id ? 'bg-rust text-cream' : 'bg-surface'}`}>{r.title}</a>)}
      </nav>
      {/*
        The virtual GM's eight, for a business that already existed when they changed.

        Offered on the top role only, because these are what the Board holds the general manager to.
        Nothing is deleted: what is there is marked inactive exactly as an ordinary edit does, so a
        month already closed keeps the scorecard it was scored against.
      */}
      {role.level === 'gm' && (
        <form action={loadVirtualGmKpis} className="mt-4 flex flex-wrap items-baseline gap-3 rounded-lg border border-ink/10 bg-surface p-3">
          <input type="hidden" name="roleId" value={role.id} />
          <button className="btn-secondary text-sm">Load the virtual GM&rsquo;s eight</button>
          <span className="text-xs text-ink-light">
            Two per pillar — zero harm and zero workers compensation; trained for the role and a culture
            nobody leaves; profitable and the financial systems fit for purpose; the contracts understood
            and people doing as they say. Replaces what is here. Closed months keep what they were scored against.
          </span>
        </form>
      )}
      {sp.err && <p className="mt-4 rounded bg-rust-100 p-3 text-sm text-rust-800">Not saved — weights must sum to 100% in every pillar. {sp.err}.</p>}
      {sp.saved && <p className="mt-4 rounded bg-sage-100 p-3 text-sm text-sage-900">Saved.</p>}
      <form action={saveCriteria} className="mt-4">
        <input type="hidden" name="roleId" value={role.id} />
        {PILLARS.map(p => {
          const rows = crit.filter(c => c.pillar === p);
          /*
            Two is the FOUNDATION, not the cap.

            Kris, 18 September: *"Users can ADD as many KPIs per quadrant as they like — the
            2-per-pillar are a foundation, not a cap. Never a blank scorecard."* This screen filled
            up to two blank rows and stopped, so once a pillar had its two there was nowhere to type
            a third — a business could not measure something it had decided mattered.

            So: pad to two, and always leave one spare row beyond whatever is there. The weights
            still have to sum to 100% in the pillar, which is what makes adding a third a decision
            about what matters rather than a free extra.
          */
          const slots = [...rows, ...Array(Math.max(1, 2 - rows.length)).fill(null)];
          return (
            <div key={p} className="mt-4 overflow-hidden rounded-lg border border-ink/10 bg-surface">
              <div className="flex items-center gap-2 border-b border-ink/10 bg-cream/50 px-4 py-2.5">
                <Badge pillar={p} />
                <div className="font-serif text-base text-ink">{PILLAR_META[p].name}</div>
                <span className="text-xs text-ink-light">— {PILLAR_META[p].question}</span>
                <span className="ml-auto text-xs text-ink-light">
                  {crit.filter(c => c.pillar === p).length} KPIs &middot; type in the empty row to add one
                </span>
              </div>
              {/*
                Two columns: what you are measuring, and what good looks like.

                It was five — Criterion, Weight %, KPI, Agreed target, Proposed — which is a
                spreadsheet, and one of those columns actively stopped you saving. Weights are
                worked out in `saveCriteria`, every criterion on a scorecard is a thing being
                measured so the tick box was always ticked, and the proposed figure is a hint on
                the target box rather than a column of dashes.
              */}
              <ul className="divide-y divide-ink/10">
                {slots.map((c, i) => {
                  const id = c?.id ?? `new-${p}-${i}`;
                  return (
                    <li key={id} className="grid gap-2 p-3 sm:grid-cols-[1fr_16rem]">
                      <input type="hidden" name={`c:${id}:pillar`} value={p as Pillar} />
                      <input
                        name={`c:${id}:text`}
                        defaultValue={c?.text ?? ''}
                        /*
                          "Add a KPI", in the words Kris uses.

                          The empty row said "Add a criterion", and he went looking for it and could
                          not find it: *"it doesn't say add kpi's"*. The whole screen is headed KPIs
                          and then asks for a criterion — which is the internal word for the same
                          thing. A person hunting for the button they were told about does not
                          translate; they conclude it is not there.
                        */
                        placeholder={c ? '' : `Add a KPI — what else does ${role.title} have to get right?`}
                        aria-label={`${PILLAR_META[p].name} KPI`}
                        className="w-full rounded border border-ink/15 px-3 py-2"
                      />
                      <input
                        name={`c:${id}:target`}
                        defaultValue={c?.target ?? ''}
                        aria-label={`${PILLAR_META[p].name} target`}
                        /* The proposed figure as the hint, so a number nobody agreed never sits in
                           the box looking agreed. */
                        placeholder={c?.proposedTarget ? `${c.proposedTarget} — proposed` : 'Target, if you have agreed one'}
                        className="w-full rounded border border-ink/15 px-3 py-2 text-sm"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <button className="btn-primary mt-4">Save {role.title} KPIs</button>
        <span className="ml-4 text-sm text-ink-light">
          Type in the empty row to add one. Clear a row to drop it. SPEC shares each pillar evenly between
          whatever is in it, so there is no arithmetic to do.
        </span>
      </form>
      <p className="mt-6 text-sm"><a href="/journey" className="underline">Back to the journey</a></p>
    </Shell>
  );
}
