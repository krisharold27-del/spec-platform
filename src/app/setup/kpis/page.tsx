import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getRoles } from '@/lib/queries';
import { PILLARS, type Pillar } from '@/lib/scoring';
import { Shell, PILLAR_META } from '@/components/ui';
import { saveCriteria } from './actions';

export const dynamic = 'force-dynamic';

export default async function KpiSetup({ searchParams }: { searchParams: Promise<{ role?: string; err?: string; saved?: string }> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const roles = getRoles(user.tenantId).filter(r => r.level !== 'staff');
  const role = roles.find(r => r.id === sp.role) ?? roles[0];
  if (!role) return <Shell title="KPIs"><p>Define roles first.</p></Shell>;
  const crit = db.select().from(schema.criteria).where(and(eq(schema.criteria.roleId, role.id), eq(schema.criteria.active, true))).orderBy(schema.criteria.sortOrder).all();

  return (
    <Shell title="KPIs per role" subtitle="Two per pillar. Weights sum to 100%. Targets are negotiated — the proposed figure stays on record.">
      <nav className="flex flex-wrap gap-2 text-sm">
        {roles.map(r => <a key={r.id} href={`/setup/kpis?role=${r.id}`} className={`rounded-full border px-3 py-1 ${r.id === role.id ? 'bg-slate-900 text-white' : 'bg-white'}`}>{r.title}</a>)}
      </nav>
      {sp.err && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-900">Not saved — weights must sum to 100% in every pillar. {sp.err}.</p>}
      {sp.saved && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-900">Saved.</p>}
      <form action={saveCriteria} className="mt-4">
        <input type="hidden" name="roleId" value={role.id} />
        {PILLARS.map(p => {
          const rows = crit.filter(c => c.pillar === p);
          const slots = [...rows, ...Array(Math.max(0, 2 - rows.length)).fill(null)];
          return (
            <div key={p} className="mt-4 overflow-hidden rounded-lg border bg-white">
              <div className="px-4 py-2 text-white" style={{ background: PILLAR_META[p].colour }}>{PILLAR_META[p].name} <span className="text-xs opacity-80">— {PILLAR_META[p].question}</span></div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="p-2 pl-4">Criterion</th><th className="p-2 w-20">Weight %</th><th className="p-2 w-14">KPI</th><th className="p-2 w-40">Agreed target</th><th className="p-2 w-32">Proposed</th></tr></thead>
                <tbody>
                  {slots.map((c, i) => {
                    const id = c?.id ?? `new-${p}-${i}`;
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-2 pl-4"><input type="hidden" name={`c:${id}:pillar`} value={p as Pillar} /><input name={`c:${id}:text`} defaultValue={c?.text ?? ''} placeholder={c ? '' : 'Add a criterion'} className="w-full rounded border px-2 py-1" /></td>
                        <td className="p-2"><input name={`c:${id}:weight`} type="number" min={0} max={100} step={1} defaultValue={c ? Math.round(c.weight * 100) : 50} className="w-full rounded border px-2 py-1" /></td>
                        <td className="p-2 text-center"><input type="checkbox" name={`c:${id}:kpi`} defaultChecked={c ? c.kpi : true} /></td>
                        <td className="p-2"><input name={`c:${id}:target`} defaultValue={c?.target ?? ''} className="w-full rounded border px-2 py-1" /></td>
                        <td className="p-2 text-xs text-slate-500">{c?.proposedTarget ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        <button className="mt-4 rounded-lg bg-slate-900 px-5 py-2 text-white hover:bg-slate-700">Save {role.title} KPIs</button>
        <span className="ml-4 text-sm text-slate-500">Leave a row blank to drop it. Clearing a criterion's text removes it.</span>
      </form>
      <p className="mt-6 text-sm"><a href="/journey" className="underline">Back to the journey</a></p>
    </Shell>
  );
}
