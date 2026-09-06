import Link from 'next/link';
import { Shell, PillarTile, PILLAR_META, pct } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getCurrentPeriod, getTeamRollup, PILLARS } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function TeamRollup() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = getTenantById(user.tenantId)!;
  const period = getCurrentPeriod(tenant.id)!;
  const rollup = getTeamRollup(tenant.id, period.id);
  const scoredRoles = rollup.roles.filter(r => r.rows.some(x => x.answer !== ''));
  return (
    <Shell title="Team rollup" subtitle={`${period.period} · averages across scored roles only (${scoredRoles.length} of ${rollup.roleCount})`}>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {PILLARS.map(p => <PillarTile key={p} pillar={p} score={rollup.team.pillars[p]} scored={scoredRoles.length > 0} sub="Target 90%" />)}
      </section>
      <h2 className="mt-10 text-lg font-medium">By role</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {rollup.roles.map(({ role, rows, score }) => {
          const scored = rows.some(r => r.answer !== '');
          return (
            <Link key={role.id} href={`/scorecard/${role.id}`} className="rounded-lg border bg-white p-4 hover:border-slate-400">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{role.title}</div>
                <div className="text-sm text-slate-500">{role.holder?.name ?? 'vacant'}</div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                {PILLARS.map(p => (
                  <div key={p}>
                    <div className="h-1.5 rounded" style={{ background: PILLAR_META[p].colour, opacity: scored ? 0.2 + 0.8 * score.pillars[p] : 0.15 }} />
                    <div className="mt-1">{scored ? pct(score.pillars[p]) : '—'}</div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
