import Link from 'next/link';
import { Shell, PillarTile, PILLAR_META, pct } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getTeamRollupForRoles, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope, scoredRolesInScope } from '@/lib/scope';

export const dynamic = 'force-dynamic';

export default async function TeamRollup() {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const period = await currentPeriod(tenant.id);
  if (!period) {
    return (
      <Shell title="My team" subtitle="Not scoring yet">
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
  // Only this viewer's own role and the roles beneath it — never the whole business.
  const scope = await getScope(user);
  const rollup = await getTeamRollupForRoles(scoredRolesInScope(scope), period.id);
  // Scored means the engine produced a number — a card marked only Pending or Watch is not scored.
  const scoredRoles = rollup.roles.filter(r => r.score.overall !== null);
  return (
    <Shell title="My team" subtitle={`${period.period} · averages across scored roles only (${scoredRoles.length} of ${rollup.roleCount})`}>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {PILLARS.map(p => <PillarTile key={p} pillar={p} score={rollup.team.pillars[p]} scored={scoredRoles.length > 0} sub="Target 90%" />)}
      </section>
      <h2 className="mt-10 font-serif text-lg font-bold text-ink">By role</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {rollup.roles.map(({ role, rows, score }) => {
          const scored = rows.some(r => r.answer !== '');
          return (
            <Link key={role.id} href={`/scorecard/${role.id}`} className="rounded-lg border bg-white p-4 hover:border-rust/40">
              <div className="flex items-baseline justify-between">
                <div className="font-medium">{role.title}</div>
                <div className="text-sm text-ink-light">{role.holder?.name ?? 'vacant'}</div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                {PILLARS.map(p => {
                  const v = scored ? score.pillars[p] : null;
                  return (
                    <div key={p}>
                      <div className="h-1.5 rounded" style={{ background: PILLAR_META[p].colour, opacity: v === null ? 0.15 : 0.2 + 0.8 * v }} />
                      <div className="mt-1">{pct(v)}</div>
                    </div>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
