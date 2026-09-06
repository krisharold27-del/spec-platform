import Link from 'next/link';
import { Shell } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getRoles, type RoleView } from '@/lib/queries';

export const dynamic = 'force-dynamic';

function Node({ role, all, depth }: { role: RoleView; all: RoleView[]; depth: number }) {
  const reports = all.filter(r => r.reportsToRoleId === role.id);
  return (
    <li className="mt-2">
      <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3" style={{ marginLeft: depth * 28 }}>
        <div className="flex-1">
          <Link href={`/scorecard/${role.id}`} className="font-medium text-blue-700 hover:underline">{role.title}</Link>
          <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">{role.stream}</span>
        </div>
        <div className="text-sm text-slate-600">
          {role.holder ? <>{role.holder.name} <span className="text-xs text-slate-400">· {role.holder.access}</span></> : <span className="italic text-slate-400">vacant — role exists, nobody assigned</span>}
        </div>
      </div>
      {reports.length > 0 && <ul>{reports.map(r => <Node key={r.id} role={r} all={all} depth={depth + 1} />)}</ul>}
    </li>
  );
}

export default async function OrgChart() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const roles = await getRoles(tenant.id);
  const top = roles.filter(r => !r.reportsToRoleId);
  return (
    <Shell title="Org chart" subtitle="Roles report to roles. A role can exist with nobody in it; a person cannot exist without a role.">
      <ul>{top.map(r => <Node key={r.id} role={r} all={roles} depth={0} />)}</ul>
      <div className="mt-8 rounded-lg border bg-white p-4 text-sm text-slate-600">
        <div className="font-medium text-slate-900">Streams (COGS)</div>
        <p className="mt-1"><b>Commercial</b> — numbers correct and on time: weekly GP, monthly net profit, STAR rating. <b>Operations</b> — billable hours and safety; supervisors signed off as capable. <b>Growth</b> — keep the clients you have, win more.</p>
      </div>
    </Shell>
  );
}
