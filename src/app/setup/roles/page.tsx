import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getRoles } from '@/lib/queries';
import { Shell } from '@/components/ui';
import templates from '../../../../seed/criteria_templates.json';
import { addRole, removeRole } from './actions';

export const dynamic = 'force-dynamic';

export default async function RolesSetup() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const roles = getRoles(user.tenantId);
  const gm = roles.find(r => r.level === 'gm');
  const have = new Set(roles.map(r => `${r.stream}:${r.level}`));
  const proposals = (templates.roles as { template_id: string; title: string; stream: string; level: string }[])
    .filter(t => t.level !== 'gm' && !have.has(`${t.stream}:${t.level}`) && t.level === 'manager');
  const ops = roles.find(r => r.stream === 'operations' && r.level === 'manager');

  return (
    <Shell title="Org chart — roles first" subtitle="Define the roles the business needs. Nobody is named yet.">
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="font-medium">Roles so far</h2>
          <ul className="mt-2 divide-y rounded-lg border bg-white">
            {roles.map(r => (
              <li key={r.id} className="flex items-center justify-between p-3 text-sm">
                <div><span className="font-medium">{r.title}</span> <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs uppercase">{r.stream} · {r.level}</span>
                  <div className="text-xs text-slate-500">reports to {roles.find(x => x.id === r.reportsToRoleId)?.title ?? '—'} · {r.holder?.name ?? 'vacant'}</div></div>
                {r.level !== 'gm' && <form action={removeRole}><input type="hidden" name="roleId" value={r.id} /><button className="text-xs text-slate-400 hover:text-red-700">remove</button></form>}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="font-medium">Claude proposes</h2>
          <p className="mt-1 text-sm text-slate-600">Every business needs the numbers owned (Commercial), the work owned (Operations) and the clients owned (Growth). Add each with one click; the role comes with two KPIs per pillar you'll tune next.</p>
          <div className="mt-3 space-y-2">
            {proposals.map(t => (
              <form key={t.template_id} action={addRole} className="flex items-center justify-between rounded-lg border bg-white p-3 text-sm">
                <input type="hidden" name="template" value={t.template_id} /><input type="hidden" name="reportsTo" value={gm?.id ?? ''} />
                <span><b>{t.title}</b> <span className="text-slate-500">· reports to {gm?.title}</span></span>
                <button className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-700">Add</button>
              </form>
            ))}
            {proposals.length === 0 && <p className="text-sm text-emerald-800">All three COGS heads are in place.</p>}
            {ops && (
              <form action={addRole} className="flex items-center justify-between rounded-lg border bg-white p-3 text-sm">
                <input type="hidden" name="template" value="supervisor" /><input type="hidden" name="reportsTo" value={ops.id} />
                <span><b>Supervisor</b> <span className="text-slate-500">· reports to {ops.title}</span></span>
                <button className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-700">Add</button>
              </form>
            )}
          </div>
          <h3 className="mt-6 text-sm font-medium">Or add a custom role</h3>
          <form action={addRole} className="mt-2 grid gap-2 rounded-lg border bg-white p-3 text-sm">
            <input name="title" placeholder="Role title" required className="rounded border px-2 py-1" />
            <div className="flex gap-2">
              <select name="stream" className="rounded border px-2 py-1"><option value="commercial">Commercial</option><option value="operations">Operations</option><option value="growth">Growth</option></select>
              <select name="level" className="rounded border px-2 py-1"><option value="manager">Manager</option><option value="supervisor">Supervisor</option><option value="staff">Staff (read-only)</option></select>
              <select name="reportsTo" className="flex-1 rounded border px-2 py-1">{roles.map(r => <option key={r.id} value={r.id}>reports to {r.title}</option>)}</select>
            </div>
            <button className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-700">Add custom role (no KPIs yet)</button>
          </form>
        </section>
      </div>
      <p className="mt-6 text-sm"><a href="/journey" className="underline">Back to the journey</a></p>
    </Shell>
  );
}
