import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { renderMarkdown } from '@/lib/markdown';
import { getTeamRollup, getGates, PILLARS } from '@/lib/queries';
import { snapshotFor } from '@/lib/board-output';
import { governanceChecks, cadenceOf, governanceStatus, CADENCE } from '@/lib/governance';
import { approveBoardOutput } from '@/app/period/actions';

export const dynamic = 'force-dynamic';

const PILLAR_STATUS = {
  on_target: { label: 'At target', cls: 'text-emerald-800' },
  below: { label: 'Below target', cls: 'text-red-800' },
  not_scored: { label: 'Not scored', cls: 'text-ink-light' },
} as const;

const GATE_STATUS = {
  pass: { label: 'Pass', cls: 'bg-emerald-100 text-emerald-900' },
  fail: { label: 'Fail', cls: 'bg-red-100 text-red-900' },
  not_reporting: { label: 'Not reporting', cls: 'bg-amber-100 text-amber-900' },
} as const;

const GOV_STATUS = {
  pass: { label: 'OK', cls: 'text-emerald-800' },
  attention: { label: 'Needs attention', cls: 'text-red-800' },
  not_reporting: { label: 'Not reporting', cls: 'text-amber-800' },
} as const;

/**
 * The board pack, in two layers.
 *
 * A director gets ten minutes with this before the meeting, and most of them will read the first
 * screen and nothing else. So the first screen has to be complete on its own: four pillars, both
 * gates, governance, and everything that could bite — no scrolling, no interpretation required.
 * The full pack sits behind it for whoever wants to dig into a pillar properly.
 */
export default async function Board({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  const user = await getCurrentUser(); if (!user) redirect('/signin');

  const period = (await db.select().from(schema.periods)
    .where(and(eq(schema.periods.id, periodId), eq(schema.periods.tenantId, user.tenantId))))[0];
  if (!period) return <Shell title="Not found"><p>No such period.</p></Shell>;

  const tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId)))[0]!;
  const bo = (await db.select().from(schema.boardOutputs).where(eq(schema.boardOutputs.periodId, periodId)))[0];

  const rollup = await getTeamRollup(user.tenantId, periodId);
  const gates = await getGates(periodId);
  const boardMeetings = (await db.select().from(schema.meetings).where(eq(schema.meetings.tenantId, tenant.id))).filter(m => m.type === 'board');
  const directors = await db.select().from(schema.directors).where(eq(schema.directors.tenantId, tenant.id));
  const cadence = cadenceOf(tenant.boardCadence);
  const governance = governanceChecks(cadence, boardMeetings, directors);
  const govStatus = governanceStatus(governance);

  const snap = snapshotFor({ tenantName: tenant.name, period: period.period, rollup, gates, pillars: PILLARS, governance });

  return (
    <Shell
      title={`Board pack — ${period.period}`}
      subtitle={`${tenant.name} · ${CADENCE[cadence].label} board · ${bo ? (bo.approvedBy ? `approved by ${bo.approvedBy}` : 'awaiting approval') : 'not yet generated'}`}
    >
      {/* ---------- Layer one: the two-minute read ---------- */}
      <section className="rounded-lg border border-ink/10 bg-white p-6">
        <div className="label-caps">At a glance</div>
        <p className="mt-2 font-serif text-xl font-bold leading-snug text-ink">{snap.headline}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {snap.pillars.map(p => (
            <div key={p.pillar} className="rounded-lg border border-ink/10 p-4" style={{ borderLeftColor: PILLAR_META[p.pillar].colour, borderLeftWidth: 6 }}>
              <div className="label-caps">{p.name}</div>
              <div className="mt-1 font-serif text-3xl font-bold text-ink">{p.value === null ? '—' : pct(p.value)}</div>
              <div className={`text-xs font-medium ${PILLAR_STATUS[p.status].cls}`}>{PILLAR_STATUS[p.status].label}</div>
              {p.driver && <div className="mt-2 text-xs leading-snug text-ink-light">{p.driver}</div>}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {snap.gates.map(g => (
            <div key={g.name} className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${GATE_STATUS[g.status].cls}`}>{GATE_STATUS[g.status].label}</span>
              <span className="font-medium text-ink">{g.name}</span>
              <span className="text-ink-light">— {g.detail}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${govStatus === 'pass' ? 'bg-emerald-100 text-emerald-900' : govStatus === 'attention' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>
              {GOV_STATUS[govStatus].label}
            </span>
            <span className="font-medium text-ink">Governance</span>
          </div>
        </div>

        {snap.risks.length > 0 && (
          <div className="mt-5">
            <div className="label-caps">For the board&apos;s attention</div>
            <ul className="mt-2 space-y-1.5 text-sm text-ink">
              {snap.risks.map((r, n) => <li key={n} className="flex gap-2"><span className="text-rust">•</span><span>{r}</span></li>)}
            </ul>
          </div>
        )}

        {snap.integrity && <p className="mt-4 text-xs text-ink-light">{snap.integrity}</p>}

        {/* The north star. Everything else in this pack exists to prove these three things. */}
        <p className="mt-5 border-t border-ink/10 pt-4 text-sm italic text-ink-light">
          Did the business make the money it expected, did it do that safely, and does everyone want to
          come to work? If all three are yes, the job is done.
        </p>
      </section>

      {/* ---------- Governance detail, inside Compliance ---------- */}
      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-6">
        <div className="label-caps">Compliance — governance</div>
        <p className="mt-1 text-sm text-ink-light">
          {CADENCE[cadence].label} board. {CADENCE[cadence].note}
        </p>
        <ul className="mt-3 divide-y divide-ink/10">
          {governance.map(c => (
            <li key={c.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-ink">{c.question}</span>
                <span className={`text-xs font-medium ${GOV_STATUS[c.status].cls}`}>{GOV_STATUS[c.status].label}</span>
              </div>
              <div className="mt-0.5 text-sm text-ink-light">{c.detail}</div>
              {c.fix && <div className="mt-1 text-sm text-ink"><b>Fix:</b> {c.fix}</div>}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Layer two: the full pack ---------- */}
      {bo ? (
        <details className="mt-6 rounded-lg border border-ink/10 bg-white" open={false}>
          <summary className="cursor-pointer list-none p-4 text-sm font-medium text-ink hover:text-rust">
            Read the full pack
            <span className="ml-2 font-normal text-ink-light">— every pillar in detail, with the reasoning</span>
          </summary>
          <div
            className="border-t border-ink/10 p-6 text-sm leading-6 [&_h1]:mt-0 [&_h1]:font-serif [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-ink [&_h2]:mt-6 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2]:first:mt-0 [&_p]:mt-3 [&_p]:first:mt-0 [&_strong]:font-semibold [&_strong]:text-ink [&_em]:text-ink-light [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(bo.markdown) }}
          />
        </details>
      ) : (
        <p className="mt-6 rounded-lg border border-ink/10 bg-white p-4 text-sm text-ink-light">
          The figures above are live. Lock the period from the executive summary to generate the written
          pack that goes with them.
        </p>
      )}

      {bo && !bo.approvedBy && user.access === 'full' && (
        <form action={approveBoardOutput} className="mt-4">
          <input type="hidden" name="periodId" value={periodId} />
          <button className="rounded-lg bg-rust px-5 py-2 text-white hover:bg-rust-dark">Approve for the board</button>
        </form>
      )}
    </Shell>
  );
}
