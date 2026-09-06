import { Shell, PillarTile, PILLAR_META, pct } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getCurrentPeriod, getRoles, getScorecard, PILLARS } from '@/lib/queries';
import { validateWeights } from '@/lib/scoring';
import { saveScorecard } from './actions';

export const dynamic = 'force-dynamic';

export default async function Scorecard({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = getTenantById(user.tenantId)!;
  const period = getCurrentPeriod(tenant.id)!;
  const role = getRoles(tenant.id).find(r => r.id === roleId);
  if (!role) return <Shell title="Role not found"><p>No such role in this business.</p></Shell>;
  const { rows, score } = getScorecard(roleId, period.id);
  const scored = rows.some(r => r.answer !== '');
  const weightProblems = validateWeights(rows.map(r => ({ id: r.criterionId, pillar: r.pillar, text: r.text, weight: r.weight })));
  const readonly = user.access !== 'full' || period.status === 'locked';

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
          <div key={p} className="mt-6 overflow-hidden rounded-lg border bg-white">
            <div className="flex items-baseline justify-between px-4 py-2 text-white" style={{ background: PILLAR_META[p].colour }}>
              <div className="font-medium">{PILLAR_META[p].name}</div>
              <div className="text-sm">{scored ? pct(score.pillars[p]) : '—'}</div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {rows.filter(r => r.pillar === p).map(r => (
                  <tr key={r.criterionId} className="border-t align-top">
                    <td className="w-14 p-3 text-slate-500">{pct(r.weight)}</td>
                    <td className="p-3">
                      <div>{r.text}{r.kpi && <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs">KPI</span>}</div>
                      {r.target && <div className="text-xs text-slate-500">Target: {r.target}</div>}
                    </td>
                    <td className="w-40 p-3">
                      {(['Y', 'N', 'NA'] as const).map(v => (
                        <label key={v} className="mr-3 inline-flex items-center gap-1">
                          <input type="radio" name={`answer:${r.criterionId}`} value={v} defaultChecked={r.answer === v} disabled={readonly} /> {v}
                        </label>
                      ))}
                    </td>
                    <td className="w-72 p-3">
                      <input name={`note:${r.criterionId}`} defaultValue={r.note ?? ''} placeholder="Note — a solution, not commentary" disabled={readonly}
                        className="w-full rounded border px-2 py-1 text-sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!readonly && <button className="mt-6 rounded-lg bg-slate-900 px-5 py-2 text-white hover:bg-slate-700">Save scorecard</button>}
        {readonly && <p className="mt-6 text-sm text-slate-500">{period.status === 'locked' ? 'This period is locked.' : 'Read-only view: your role sees its checklist; supervisors and above score.'}</p>}
      </form>
    </Shell>
  );
}
