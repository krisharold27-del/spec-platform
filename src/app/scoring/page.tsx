import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell, PILLAR_META, GateBadge, pct } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { ScoreRoles } from '@/components/score-roles';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getTenantById, getScorecard, getGates, getTeamRollupForRoles, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope, scoredRolesInScope, isTopOfChart } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { saveGates, lockPeriod } from '@/app/period/actions';
import { submitPeriod, reopenPeriod, signPeriod } from './actions';
import {
  flagsFor, blocking, groupFlags, progressFor, signoffTrail, verdict, viewRow, type PeriodStatus,
} from '@/lib/month';
import { LIGHT_COLOUR } from '@/lib/today';

export const dynamic = 'force-dynamic';

/**
 * Monthly scoring — close the month, then nobody argues about it.
 *
 * August closes during September, because that is when the P&L lands. Everything here is about
 * provenance: which numbers a system produced, which a person confirmed, and which the business
 * cannot measure at all. The last group is reported as a gap and excluded from the score, because a
 * business that scores what it cannot measure is not measuring.
 */
export default async function MonthlyScoring() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const period = await currentPeriod(tenant.id);

  if (!period) {
    return (
      <Shell title="Monthly scoring" subtitle="Not scoring yet">
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">A month opens once a role has its KPIs</div>
          <p className="mt-1 text-sm text-ink-light">
            Nothing is opened for an empty business, because an empty month would score zero and read as
            a failure rather than as a business not yet built.
          </p>
          <Link href="/setup/kpis" className="btn-primary mt-4 inline-block">Set the KPIs</Link>
        </div>
      </Shell>
    );
  }

  const scope = await getScope(user);
  const manage = canManage(user.access);
  const top = isTopOfChart(scope);
  const status = period.status as PeriodStatus;

  const inScope = scoredRolesInScope(scope);
  const roles = [];
  for (const r of inScope) {
    const { rows, score } = await getScorecard(r.id, period.id);
    roles.push({
      roleId: r.id, title: r.title, holder: r.holder?.name ?? r.pencilled ?? null,
      rows, score, scored: isScored(r.level, rows.length),
      canEdit: scope.canEdit(r.id) && status !== 'locked',
    });
  }

  // The business's systems only — a person's own mailbox is theirs and never appears in a list
  // the rest of the business reads. See PERSONAL_CATEGORIES in lib/systems.
  const connections = await db.select().from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));
  const liveSources = connections.filter(c => c.status === 'live').map(c => c.name);

  const rollup = await getTeamRollupForRoles(inScope, period.id);
  const gates = await getGates(period.id);
  const flags = flagsFor(roles, liveSources);
  const blockers = blocking(flags);
  const grouped = groupFlags(flags);
  const progress = progressFor(roles);
  const v = verdict(rollup.scoredCount ? rollup.team : null);

  const gm = scope.roles.find(r => r.level === 'gm')?.holder?.name ?? null;
  const directors = await db.select().from(schema.directors).where(eq(schema.directors.tenantId, user.tenantId));
  const trail = signoffTrail(status, progress, {
    gm,
    director: directors.find(d => d.active)?.name ?? null,
    submittedBy: period.submittedBy,
    signedBy: period.signedBy,
  });

  const done = progress.filter(p => p.done).length;

  return (
    <Shell
      title={`Monthly scoring · ${period.period}`}
      subtitle="Close the month. Then nobody argues about it."
    >
      {/*
        What closing the month changes, said BEFORE they do it. Locking is irreversible and files a
        performance record against every person in the business — a leader should meet that fact
        here rather than discover it afterwards.
      */}
      <section className="callout mb-6 max-w-3xl">
        <div className="font-serif text-lg text-ink">What closing the month changes</div>
        <ul className="mt-2 grid gap-1 text-sm text-ink-light">
          <li>Every card becomes a dated performance record — what was expected, what happened, and who marked it.</li>
          <li>Nothing can be quietly rewritten afterwards. A correction is an amendment, shown beside the original.</li>
          <li>The board pack is generated from it, and the next month opens with the same roles, KPIs and targets.</li>
          <li>Lock what you know. A number still waiting on the P&amp;L stays pending and arrives later as an amendment.</li>
        </ul>
      </section>
      <section className="card">
        <div className="flex flex-wrap items-center gap-3">
          {(['open', 'submitted', 'locked'] as PeriodStatus[]).map(s => {
            const reached = s === 'open' || (s === 'submitted' && status !== 'open') || (s === 'locked' && status === 'locked');
            return (
              <span
                key={s}
                className="pill"
                style={{
                  background: `color-mix(in srgb, ${reached ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending} 14%, transparent)`,
                  color: reached ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending,
                }}
              >
                {s === 'open' ? 'Open' : s === 'submitted' ? 'Submitted' : 'Locked'}
              </span>
            );
          })}
          <span className="text-sm text-ink-light">{done} of {progress.length} roles scored</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress.length ? Math.max((done / progress.length) * 100, 2) : 2}%`,
              background: done === progress.length && progress.length ? LIGHT_COLOUR.green : LIGHT_COLOUR.amber,
            }}
          />
        </div>
        <p className="mt-3 text-sm text-ink-light">
          {status === 'locked'
            ? `${period.period} is locked. Nothing recalculates history — a correction is a dated amendment in the next month, shown beside the original.`
            : status === 'submitted'
              ? `Handed up by ${period.submittedBy ?? 'the top of the chart'}. Anything wrong is corrected before the signature, not after it.`
              : 'Fed numbers are already in. Manual numbers need confirming by the person accountable for them.'}
        </p>

        {top && status !== 'locked' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {status === 'open' ? (
              <form action={submitPeriod}>
                <input type="hidden" name="periodId" value={period.id} />
                <SubmitButton className="btn-primary" pending="Submitting…">Submit for sign-off</SubmitButton>
              </form>
            ) : (
              <>
                <form action={reopenPeriod}>
                  <input type="hidden" name="periodId" value={period.id} />
                  <SubmitButton className="btn-secondary" pending="Reopening…">Reopen the month</SubmitButton>
                </form>
                {!period.signedBy && (
                  <form action={signPeriod}>
                    <input type="hidden" name="periodId" value={period.id} />
                    <SubmitButton className="btn-primary" pending="Signing…">Sign the month</SubmitButton>
                  </form>
                )}
                {period.signedBy && (
                  <form action={lockPeriod}>
                    <input type="hidden" name="periodId" value={period.id} />
                    <SubmitButton className="btn-primary" pending="Locking…">Lock &amp; archive</SubmitButton>
                  </form>
                )}
              </>
            )}
          </div>
        )}
        {blockers.length > 0 && status === 'open' && (
          <p className="mt-3 text-xs text-ink-light">
            {blockers.length} {blockers.length === 1 ? 'thing needs' : 'things need'} attention below before this
            month is worth handing up.
          </p>
        )}
      </section>

      <h2 className="mt-10 font-serif text-xl text-ink">Hard gates</h2>
      <p className="text-sm text-ink-light">
        Pass or fail, reported separately from every score. No partial credit, and never averaged into a pillar.
      </p>
      <section className="mt-3 grid gap-4 md:grid-cols-2">
        <GateBadge
          label="Zero Harm"
          pass={gates.zeroHarm ? gates.zeroHarm.pass : null}
          value={gates.zeroHarm ? `LTI / MTI / psychosocial: ${gates.zeroHarm.value}` : undefined}
          reason={gates.zeroHarm?.reason}
        />
        <GateBadge
          label="Clear to Work"
          pass={gates.clearToWork ? gates.clearToWork.pass : null}
          value={gates.clearToWork ? `Training compliance ${pct(Number(gates.clearToWork.value))} (must be 100%)` : undefined}
          reason={gates.clearToWork?.reason}
        />
      </section>

      {manage && top && status !== 'locked' && (
        <form action={saveGates} className="card mt-4">
          <input type="hidden" name="periodId" value={period.id} />
          <div className="font-serif text-base text-ink">Enter this month&rsquo;s gates</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-ink-light">LTI
              <input name="lti" type="number" min={0} defaultValue={0} className="input mt-1" />
            </label>
            <label className="text-sm text-ink-light">MTI
              <input name="mti" type="number" min={0} defaultValue={0} className="input mt-1" />
            </label>
            <label className="text-sm text-ink-light">Psychosocial
              <input name="psychosocial" type="number" min={0} defaultValue={0} className="input mt-1" />
            </label>
            <label className="text-sm text-ink-light">Training compliance %
              <input
                name="training" type="number" min={0} max={100}
                defaultValue={gates.clearToWork ? Math.round(Number(gates.clearToWork.value) * 100) : 0}
                className="input mt-1"
              />
            </label>
          </div>
          <input name="zhReason" placeholder="Zero Harm note" className="input mt-3" />
          <input name="ctwReason" placeholder="Clear to Work note — what expired, who fixes it, by when" className="input mt-2" />
          <SubmitButton className="btn-primary mt-3 justify-self-start" pending="Saving…">Save the gates</SubmitButton>
        </form>
      )}

      <h2 className="mt-10 font-serif text-xl text-ink">Score a role</h2>
      <p className="text-sm text-ink-light">
        A fed number is read-only — it came from a system, and hand-editing it would break the trace back.
      </p>
      <div className="mt-4">
        <ScoreRoles
          periodId={period.id}
          locked={status === 'locked'}
          liveSources={liveSources}
          roles={roles.map(r => ({
            roleId: r.roleId,
            title: r.title,
            holder: r.holder,
            canEdit: r.canEdit,
            score: r.score,
            rows: r.rows.map(row => {
              const v = viewRow(row, liveSources);
              return {
                criterionId: row.criterionId,
                pillar: row.pillar,
                text: row.text,
                target: row.target,
                proposed: row.proposedTarget,
                result: row.result,
                note: row.note,
                status: row.status,
                state: v.state,
                readOnly: v.readOnly,
                sourceLine: v.sourceLine,
                tone: v.tone,
              };
            }),
          }))}
        />
      </div>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-ink">Flagged before sign-off</h2>
            <span className="text-sm text-ink-light">
              {blockers.length} blocking · {flags.length - blockers.length} noted
            </span>
          </div>
          {grouped.length ? (
            <ul className="mt-4 grid gap-3">
              {grouped.map(f => (
                <li
                  key={f.id}
                  className="rounded-lg bg-cream p-3"
                  style={{ borderLeft: `4px solid ${f.severity === 'blocking' ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending}` }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ink">{f.title}</span>
                    <span className="label-caps">{f.severity === 'blocking' ? 'Blocking' : 'Noted'}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-light">{f.detail}</p>
                  {/* The measures stay named. A count on its own tells somebody they have a problem
                      without telling them where it is. */}
                  {f.measures.length > 1 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-ink-light hover:text-ink">
                        Which measures
                      </summary>
                      <ul className="mt-2 grid gap-1 pl-4 text-xs text-ink-light">
                        {f.measures.map(m => <li key={m} className="list-disc">{m}</li>)}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-light">
              Nothing is flagged. Every miss has a reason against it and every manual number carries a name.
            </p>
          )}
        </section>

        <div className="grid gap-6">
          <section className="card">
            <h2 className="font-serif text-xl text-ink">Where the month lands</h2>
            <p className="mt-1 text-xs text-ink-light">Live as you score. This is the figure the board sees.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PILLARS.map(p => {
                const value = rollup.scoredCount ? rollup.team.pillars[p] : null;
                const tone = value === null ? LIGHT_COLOUR.pending : value >= 0.9 ? LIGHT_COLOUR.green : value >= 0.75 ? LIGHT_COLOUR.amber : LIGHT_COLOUR.red;
                return (
                  <div key={p} className="card-inset" style={{ borderTop: `4px solid ${tone}` }}>
                    <div className="label-caps">{PILLAR_META[p].name}</div>
                    <div className="mt-1 font-serif text-2xl text-ink">{pct(value)}</div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm" style={{ color: v.met ? LIGHT_COLOUR.green : undefined }}>{v.line}</p>
            <p className="mt-2 text-xs text-ink-light">
              Averaged across the {rollup.scoredCount} scored {rollup.scoredCount === 1 ? 'role' : 'roles'} of{' '}
              {rollup.roleCount}. An unscored role is missing data, not a zero, so it is left out rather than
              dragging the figure down.
            </p>
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Sign-off</h2>
            <ol className="mt-3 grid gap-3">
              {trail.map(s => (
                <li key={s.step} className="flex items-start gap-3">
                  <span
                    className="mt-1 block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: s.done ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending }}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className={`text-sm ${s.done ? 'text-ink' : 'text-ink-light'}`}>{s.step}</span>
                      <span className="text-xs text-ink-light">{s.state}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-light">{s.who}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </Shell>
  );
}
