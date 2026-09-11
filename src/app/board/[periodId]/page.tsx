import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScope, isTopOfChart } from '@/lib/scope';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { renderMarkdown } from '@/lib/markdown';
import { getTeamRollup, getGates, PILLARS } from '@/lib/queries';
import { snapshotFor } from '@/lib/board-output';
import { governanceChecks, cadenceOf, governanceStatus, CADENCE } from '@/lib/governance';
import { approveBoardOutput } from '@/app/period/actions';

export const dynamic = 'force-dynamic';

const PILLAR_STATUS = {
  on_target: { label: 'At target', cls: 'text-sage-800' },
  below: { label: 'Below target', cls: 'text-rust-800' },
  not_scored: { label: 'Not scored', cls: 'text-ink-light' },
} as const;

const GATE_STATUS = {
  pass: { label: 'Pass', cls: 'bg-sage-200 text-sage-900' },
  fail: { label: 'Fail', cls: 'bg-rust-200 text-rust-800' },
  not_reporting: { label: 'Not reporting', cls: 'bg-rust-200 text-rust-800' },
} as const;

const GOV_STATUS = {
  pass: { label: 'OK', cls: 'text-sage-800' },
  attention: { label: 'Needs attention', cls: 'text-rust-800' },
  not_reporting: { label: 'Not reporting', cls: 'text-rust-800' },
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

  // The pack is the whole business, so it is the one lawful exception to "only me and above" — and
  // it reaches only the people it is addressed to. Until board seats exist (BUILD_SPEC §1.6), that
  // is an administrator or the top of the chart; never any seat.
  if (!(user.access === 'administrator' || isTopOfChart(await getScope(user)))) {
    return <Shell title="Board pack"><p className="text-sm text-ink-light">The board pack is read by the board and the top of the business. Your own card is on <a className="text-rust underline" href="/me">My scorecard</a>.</p></Shell>;
  }

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

  // What only the board can unblock. Read from the approvals queue rather than typed by hand: a
  // pack listing asks somebody remembered to write is a pack that quietly drops the ones they forgot.
  const boardAsks = (await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId)))
    .filter(a => a.state === 'waiting' && a.decidedByLevel === 'board')
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));

  // Numbers the business cannot produce. Flags, never scores.
  const unsupported = rollup.roles.flatMap(({ role, rows }) =>
    rows.filter(r => r.status === 'not_tracked')
      .map(r => ({ role: role.title, text: r.text, source: r.source })));

  // The run behind the figure: the closed months, oldest first. A month is a point, not a trend.
  const closed = (await db.select().from(schema.periods).where(eq(schema.periods.tenantId, user.tenantId)))
    .filter(p => p.status === 'locked' || p.id === periodId)
    .sort((a, b) => a.period.localeCompare(b.period))
    .slice(-6);
  const trend = [];
  for (const p of closed) {
    const r = p.id === periodId ? rollup : await getTeamRollup(user.tenantId, p.id);
    trend.push({ period: p.period, pillars: r.team.pillars });
  }

  return (
    <Shell
      title={`Board pack — ${period.period}`}
      subtitle={`${tenant.name} · ${CADENCE[cadence].label} board · ${bo ? (bo.approvedBy ? `approved by ${bo.approvedBy}` : 'awaiting approval') : 'not yet generated'}`}
    >
      {/* ---------- Layer one: the two-minute read ---------- */}
      <section className="rounded-lg border border-ink/10 bg-surface p-6">
        <div className="label-caps">At a glance</div>
        <p className="mt-2 font-serif text-xl leading-snug text-ink">{snap.headline}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {snap.pillars.map(p => (
            <div key={p.pillar} className="rounded-lg border border-ink/10 p-4" style={{ borderLeftColor: PILLAR_META[p.pillar].colour, borderLeftWidth: 6 }}>
              <div className="label-caps">{p.name}</div>
              <div className="mt-1 font-serif text-3xl text-ink">{p.value === null ? '—' : pct(p.value)}</div>
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
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${govStatus === 'pass' ? 'bg-sage-200 text-sage-900' : govStatus === 'attention' ? 'bg-rust-200 text-rust-800' : 'bg-rust-200 text-rust-800'}`}>
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
      <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-6">
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

      <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-6">
        <div className="label-caps">What the board is asked to do</div>
        {boardAsks.length ? (
          <ul className="mt-3 grid gap-3">
            {boardAsks.map(a => (
              <li key={a.id} className="rounded-lg bg-cream p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{a.title}</span>
                  <span className="text-xs text-ink-light">waiting since {a.requestedAt.slice(0, 10)}</span>
                </div>
                <p className="mt-1 text-xs text-ink-light">{a.detail}</p>
                {a.blocks && <p className="mt-1 text-xs text-rust-800">{a.blocks}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-light">Nothing. Every decision this month sat inside the business.</p>
        )}
        <p className="mt-3 text-xs text-ink-light">
          Decided in <a href="/inbox" className="text-rust-700 underline">approvals</a>, where each one keeps the
          name and the date — approvals and declines alike.
        </p>
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-6">
        <div className="label-caps">What the data cannot support</div>
        {unsupported.length ? (
          <>
            <ul className="mt-3 grid gap-2">
              {unsupported.map(u => (
                <li key={`${u.role}:${u.text}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/10 pb-2 last:border-0">
                  <span className="text-sm text-ink">{u.text}</span>
                  <span className="text-xs text-ink-light">{u.role}{u.source ? ` · ${u.source}` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-light">
              Excluded from the fraction on both sides rather than counted as zeros. These are flags, not
              scores — a gap in what the business can measure, not a failure by whoever holds the card.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink-light">
            Nothing. Every measure on every card has either a system or a named person behind it.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-6">
        <div className="label-caps">The last six months</div>
        {trend.length > 1 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="table-clean min-w-[520px]">
              <thead>
                <tr><th>Month</th>{PILLARS.map(p => <th key={p}>{PILLAR_META[p].name}</th>)}</tr>
              </thead>
              <tbody>
                {trend.map(t => (
                  <tr key={t.period}>
                    <td className="text-ink">{t.period}</td>
                    {PILLARS.map(p => <td key={p} className="font-mono">{pct(t.pillars[p])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-light">
            Only one month has closed. The 90% rule needs two consecutive ones, so there is a run to build
            rather than a trend to read.
          </p>
        )}
      </section>

      {/* ---------- Layer two: the full pack ---------- */}
      {bo ? (
        <details className="mt-6 rounded-lg border border-ink/10 bg-surface" open={false}>
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
        <p className="mt-6 rounded-lg border border-ink/10 bg-surface p-4 text-sm text-ink-light">
          The figures above are live. Lock the period from the executive summary to generate the written
          pack that goes with them.
        </p>
      )}

      {bo && !bo.approvedBy && canManage(user.access) && (
        <form action={approveBoardOutput} className="mt-4">
          <input type="hidden" name="periodId" value={periodId} />
          <button className="rounded-full bg-rust px-5 py-2 text-cream hover:bg-rust-600">Approve for the board</button>
        </form>
      )}
    </Shell>
  );
}
