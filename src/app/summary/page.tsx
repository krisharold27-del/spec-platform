import Link from 'next/link';
import { Shell, PillarTile, GateBadge, PILLAR_META, pct } from '@/components/ui';
import { redirect } from 'next/navigation';
import { getCurrentUser, canManage } from '@/lib/auth';
import { saveGates, lockPeriod } from '@/app/period/actions';
import { getTenantById, getTeamRollupForRoles, getGates, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope, scoredRolesInScope } from '@/lib/scope';

export const dynamic = 'force-dynamic';

export default async function ExecutiveSummary() {
  const user = await getCurrentUser(); if (!user) redirect('/welcome');
  const tenant = (await getTenantById(user.tenantId))!;
  const period = await currentPeriod(tenant.id);
  if (!period) {
    return (
      <Shell title={`${tenant.name} — Executive summary`} subtitle="Not scoring yet">
        <div className="rounded-lg border-l-4 border-rust bg-surface p-5 text-sm">
          <div className="font-medium text-ink">Your dashboard opens as soon as a role has its KPIs</div>
          <p className="mt-1 text-ink-light">
            Every role needs two numbers per pillar — Safety, People, Earnings, Compliance. Set them for
            one role and this page fills in. Building the business and setting the KPIs is free.
          </p>
          <Link href="/setup/kpis" className="mt-3 inline-block rounded-full bg-rust px-4 py-2 text-sm text-cream hover:bg-rust-600">Set the KPIs</Link>
        </div>
      </Shell>
    );
  }
  // Scoped to what this viewer may see: their own role and everything beneath it.
  const scope = await getScope(user);
  const rollup = await getTeamRollupForRoles(scoredRolesInScope(scope), period.id);
  const g = await getGates(period.id);
  const baseline = rollup.scoredCount === 0;

  return (
    <Shell title={`${tenant.name} — Executive summary`} subtitle={`Period ${period.period} · ${period.status} · ${rollup.scoredCount} of ${rollup.roleCount} roles scored`}>
      {baseline && (
        <div className="mb-6 rounded-lg border border-rust-300 bg-rust-100 p-4 text-sm text-rust-800">
          Baseline month. No role has been scored yet, so there are no results to report — only the work still to do. Nothing below is a performance figure.
        </div>
      )}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {PILLARS.map(p => (
          <PillarTile key={p} pillar={p} score={rollup.team.pillars[p]} scored={!baseline}
            sub={`Target 90% · ${PILLAR_META[p].question} · scored roles only`} />
        ))}
      </section>

      <h2 className="mt-10 font-serif text-lg text-ink">Hard gates</h2>
      <p className="text-sm text-ink-light">Pass or fail, reported separately from scores. No partial credit.</p>
      <section className="mt-3 grid gap-4 md:grid-cols-2">
        <GateBadge label="Zero Harm" pass={g.zeroHarm ? g.zeroHarm.pass : null} value={g.zeroHarm ? `LTI / MTI / psychosocial: ${g.zeroHarm.value}` : undefined} reason={g.zeroHarm?.reason} />
        <GateBadge label="Clear to Work" pass={g.clearToWork ? g.clearToWork.pass : null} value={g.clearToWork ? `Training compliance ${pct(Number(g.clearToWork.value))} (must be 100%)` : undefined} reason={g.clearToWork?.reason} />
      </section>

      <h2 className="mt-10 font-serif text-lg text-ink">Roles this period</h2>
      <table className="mt-3 w-full overflow-hidden rounded-lg border bg-surface text-sm">
        <thead className="bg-cream text-left text-xs uppercase text-ink-light">
          <tr><th className="p-3">Role</th><th className="p-3">Holder</th>{PILLARS.map(p => <th key={p} className="p-3">{PILLAR_META[p].name}</th>)}<th className="p-3">Overall</th></tr>
        </thead>
        <tbody>
          {rollup.roles.map(({ role, rows, score }) => {
            const scored = rows.some(r => r.answer !== '');
            return (
              <tr key={role.id} className="border-t">
                <td className="p-3"><Link className="text-rust hover:underline" href={`/scorecard/${role.id}`}>{role.title}</Link></td>
                <td className="p-3 text-ink-light">{role.holder?.name ?? <span className="italic text-ink-light/60">vacant</span>}</td>
                {PILLARS.map(p => <td key={p} className="p-3">{scored ? pct(score.pillars[p]) : '—'}</td>)}
                <td className="p-3 font-medium">{scored ? pct(score.overall) : 'not scored'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-ink-light">The business is SPEC when all four pillars hold at 90%+ for two consecutive months.</p>

      {canManage(user.access) && period.status === 'open' && (
        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <form action={saveGates} className="rounded-lg border bg-surface p-4 text-sm">
            <input type="hidden" name="periodId" value={period.id} />
            <div className="font-medium">Enter this month's gates</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label>LTI<input name="lti" type="number" min={0} defaultValue={0} className="mt-1 w-full rounded border px-2 py-1" /></label>
              <label>MTI<input name="mti" type="number" min={0} defaultValue={0} className="mt-1 w-full rounded border px-2 py-1" /></label>
              <label>Psychosocial<input name="psychosocial" type="number" min={0} defaultValue={0} className="mt-1 w-full rounded border px-2 py-1" /></label>
            </div>
            <label className="mt-3 block">Training compliance %<input name="training" type="number" min={0} max={100} defaultValue={g.clearToWork ? Math.round(Number(g.clearToWork.value) * 100) : 0} className="mt-1 w-full rounded border px-2 py-1" /></label>
            <input name="zhReason" placeholder="Zero Harm note" className="mt-2 w-full rounded border px-2 py-1" />
            <input name="ctwReason" placeholder="Clear to Work note (what's expired, who fixes it, by when)" className="mt-2 w-full rounded border px-2 py-1" />
            <button className="mt-3 rounded-full bg-rust px-4 py-2 text-cream hover:bg-rust-600">Save gates</button>
          </form>
          <form action={lockPeriod} className="rounded-lg border bg-surface p-4 text-sm">
            <input type="hidden" name="periodId" value={period.id} />
            <div className="font-medium">Close the month</div>
            <p className="mt-1 text-ink-light">Locks {period.period} (no further edits), generates the board output from the data, and opens the next month. {rollup.scoredCount < rollup.roleCount ? `${rollup.roleCount - rollup.scoredCount} role(s) are still unscored — the output will say so.` : 'Every role is scored.'}</p>
            <button className="btn-secondary mt-3">Lock {period.period} and generate board output</button>
          </form>
        </section>
      )}
      {period.status === 'locked' && <p className="mt-6 text-sm"><Link className="underline" href={`/board/${period.id}`}>View board output for {period.period}</Link></p>}
    </Shell>
  );
}
