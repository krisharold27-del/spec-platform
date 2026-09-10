import Link from 'next/link';
import { Shell, PillarTile, PILLAR_META, Badge, pct } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getRoles, getScorecard, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { STATUSES, STATUS_ORDER, statusFromAnswer, type Status } from '@/lib/status';
import { validateWeights } from '@/lib/scoring';
import { saveScorecard } from './actions';

export const dynamic = 'force-dynamic';

export default async function Scorecard({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const period = await currentPeriod(tenant.id);
  const role = (await getRoles(tenant.id)).find(r => r.id === roleId);
  if (!role) return <Shell title="Role not found"><p>No such role in this business.</p></Shell>;

  // You see your own board and everything below it — never above, never sideways.
  const scope = await getScope(user);
  if (!scope.canSee(roleId)) {
    return (
      <Shell title="Not your scorecard" subtitle="You can see your own SPEC board and those of your team.">
        <div className="rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm text-ink-light">
          <p><b className="text-ink">{role.title}</b> sits outside your part of the org chart, so its scores aren&apos;t yours to see.</p>
          <Link href="/me" className="mt-3 inline-block rounded-lg bg-rust px-4 py-2 text-sm text-white hover:bg-rust-dark">Go to my scorecard</Link>
        </div>
      </Shell>
    );
  }
  if (!period) {
    return (
      <Shell title={`${role.title} — scorecard`} subtitle="Not scoring yet">
        <div className="rounded-lg border-l-4 border-rust bg-white p-5 text-sm">
          <div className="font-medium text-ink">Your dashboard opens as soon as a role has its KPIs</div>
          <p className="mt-1 text-ink-light">
            Every role needs two numbers per pillar — Safety, People, Earnings, Compliance. Set them for
            one role and this page fills in. Building the business and setting the KPIs is free.
          </p>
          <Link href="/setup/kpis" className="mt-3 inline-block rounded-lg bg-rust px-4 py-2 text-sm text-white hover:bg-rust-dark">Set the KPIs</Link>
        </div>
      </Shell>
    );
  }
  const { rows, score } = await getScorecard(roleId, period.id);
  const scored = rows.some(r => r.answer !== '');
  const weightProblems = validateWeights(rows.map(r => ({ id: r.criterionId, pillar: r.pillar, text: r.text, weight: r.weight })));
  const readonly = !scope.canEdit(roleId) || period.status === 'locked';

  return (
    <Shell title={`${role.title} — scorecard`} subtitle={`${role.holder?.name ?? 'Vacant'} · ${period.period} · ${period.status}`}>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {PILLARS.map(p => <PillarTile key={p} pillar={p} score={score.pillars[p]} scored={scored} />)}
      </section>
      {weightProblems.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Weights must sum to 100% in every pillar. Problem: {weightProblems.map(w => `${PILLAR_META[w.pillar].name} = ${pct(w.total)}`).join(', ')}.
        </div>
      )}
      <form action={saveScorecard} className="mt-8">
        <input type="hidden" name="roleId" value={roleId} />
        <input type="hidden" name="periodId" value={period.id} />
        {PILLARS.map(p => (
          <div key={p} className="mt-6 overflow-hidden rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center justify-between border-b border-ink/10 bg-cream/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Badge pillar={p} />
                <div className="font-serif text-base font-bold text-ink">{PILLAR_META[p].name}</div>
              </div>
              <div className="text-sm font-medium text-ink-light">{scored ? pct(score.pillars[p]) : '—'}</div>
            </div>
            <div className="divide-y divide-ink/10">
              {rows.filter(r => r.pillar === p).map(r => {
                const status = (r.status ?? statusFromAnswer(r.answer)) as Status | null;
                const meta = status ? STATUSES[status] : null;
                return (
                  <div key={r.criterionId} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink">
                          {r.text}
                          {r.kpi && <span className="ml-2 rounded bg-cream px-1.5 text-xs font-normal">KPI</span>}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-light">
                          {r.target ? <>Target: <b className="font-medium">{r.target}</b></> : <span className="italic">No target set</span>}
                          <span className="ml-2 text-ink-light/50">{pct(r.weight)} of pillar</span>
                        </div>
                      </div>
                      {meta && (
                        <span className={`pill ${meta.tone === 'good' ? 'pill-confirmed' : meta.tone === 'bad' ? 'pill-fail' : 'pill-neutral'}`}>
                          {meta.label}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <label className="block text-xs">
                        <span className="label-caps">Result</span>
                        <input name={`result:${r.criterionId}`} defaultValue={r.result ?? ''} disabled={readonly}
                          placeholder="e.g. $827,172 (94.0%)"
                          className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5 text-sm disabled:bg-ink/5" />
                      </label>
                      <label className="block text-xs">
                        <span className="label-caps">Status</span>
                        <select name={`status:${r.criterionId}`} defaultValue={status ?? ''} disabled={readonly}
                          className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5 text-sm disabled:bg-ink/5">
                          <option value="">— not yet scored —</option>
                          {STATUS_ORDER.map(k => <option key={k} value={k}>{STATUSES[k].label}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs">
                        <span className="label-caps">Source</span>
                        <input name={`source:${r.criterionId}`} defaultValue={r.source ?? ''} disabled={readonly}
                          placeholder="Xero, Simpro, or how you confirmed it"
                          className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5 text-sm disabled:bg-ink/5" />
                      </label>
                    </div>

                    <label className="mt-3 block text-xs">
                      <span className="label-caps">Note</span>
                      <textarea name={`note:${r.criterionId}`} defaultValue={r.note ?? ''} disabled={readonly} rows={2}
                        placeholder="How it was measured, what changed, what happens next — the reasoning, not just the number."
                        className="mt-1 w-full rounded border border-ink/15 px-2 py-1.5 text-sm disabled:bg-ink/5" />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {!readonly && <button className="mt-6 rounded-lg bg-rust px-5 py-2 text-white hover:bg-rust-dark">Save scorecard</button>}
        {readonly && <p className="mt-6 text-sm text-ink-light">{period.status === 'locked' ? 'This period is locked.' : 'Read-only view: your role sees its checklist; supervisors and above score.'}</p>}
        {!readonly && (
          <p className="mt-3 max-w-2xl text-xs text-ink-light/70">
            <b className="text-ink-light">Not tracked</b> means no system produces this number yet — it is excluded from the
            score rather than counted as a failure. <b className="text-ink-light">Watch</b> means started, not finished — it is
            also excluded, and Watch two closed months running becomes Not met.
          </p>
        )}
      </form>
    </Shell>
  );
}
