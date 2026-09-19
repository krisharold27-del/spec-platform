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
import { Problems } from '@/components/problems';
import { AceWatch } from '@/components/ace-watch';
import { GoalsPanel } from '@/components/goals-panel';
import { goalsFor } from '@/lib/goals-data';
import { aceWatch } from '@/lib/ace-watch-data';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';

export const dynamic = 'force-dynamic';

/**
 * Monthly scoring — close the month, then nobody argues about it.
 *
 * August closes during September, because that is when the P&L lands. Everything here is about
 * provenance: which numbers a system produced, which a person confirmed, and which the business
 * cannot measure at all. The last group is reported as a gap and excluded from the score, because a
 * business that scores what it cannot measure is not measuring.
 */
export default async function MonthlyScoring({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Why SPEC said no, if it just did. See lib/refuse — a refusal is a rule working, not a fault.
  const cannot = refusedReason(await searchParams);
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
  // Scope-bounded: aceWatch never widens the set it is given, so this is the only place the
  // visibility decision is made.
  const aces = await aceWatch(tenant.id, period.id, inScope.map(r => r.id));
  // "This stays visible on the board pack and the monthly scoring page, so the goals are never lost
  // under the numbers." This is the page where a month is judged, so it is the page that needs it.
  const goals = await goalsFor(tenant.id);
  const roles = [];
  for (const r of inScope) {
    const { rows, score } = await getScorecard(r.id, period.id);
    roles.push({
      roleId: r.id, title: r.title, holder: r.holder?.name ?? r.pencilled ?? null,
      rows, score, scored: isScored(r.level, rows.length, r.isTeam),
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
      title="Monthly scoring"
      kicker={`Monthly scoring · ${period.period}`}
      headline="Close the month. Then nobody argues about it."
      subtitle="Every number confirmed against what it was supposed to be, with the reason written down beside anything that missed. Then it locks, and nobody re-litigates it in March."
    >
      <Refused reason={cannot} />
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

      {/*
        ── Two columns, because the right one is what you score AGAINST ──────────────────────────

        The design puts the work on the left and the context on the right: where the month lands,
        who is on an Ace run, what is still to sign. The product stacked all of it underneath, so
        the figure a leader is trying to move was two screens below the boxes they were typing in
        and nobody looked at it until they had finished.
      */}
      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="grid gap-6">
      <div>
      <h2 className="font-serif text-xl text-ink">Score a role</h2>
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
      </div>

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
        </div>

        <div className="grid gap-6">
          <section className="card">
            <h2 className="font-serif text-xl text-ink">Where the month lands</h2>
            <p className="mt-1 text-xs text-ink-light">Live as you score. This is the figure the board sees.</p>
            {/*
              Four labelled bars, which is how the design draws it — not four small boxes with a
              coloured rule on top. A bar says how far along the pillar is at a glance and they can
              be compared down the column; four boxes have to be read one at a time.
            */}
            <div className="mt-4 grid gap-3.5">
              {PILLARS.map(p => {
                const value = rollup.scoredCount ? rollup.team.pillars[p] : null;
                const tone = value === null ? LIGHT_COLOUR.pending : value >= 0.9 ? LIGHT_COLOUR.green : value >= 0.75 ? LIGHT_COLOUR.amber : LIGHT_COLOUR.red;
                return (
                  <div key={p}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5 text-sm text-ink">
                        <span aria-hidden className="block h-3 w-3 shrink-0 rounded-full" style={{ background: tone }} />
                        {PILLAR_META[p].name}
                      </span>
                      <span className="font-serif text-lg leading-none text-ink">{pct(value)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.round((value ?? 0) * 100)}%`, background: tone }}
                      />
                    </div>
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

          {/*
            Every role's run, beside the month it is being scored in.

            The Ace was only ever visible on the one scorecard whose roleId was in the URL, which
            meant the person on their third month could see it and the director APPROVING the
            doubled payment could not see it anywhere at all. It belongs here, in the column you
            score against.
          */}
          <AceWatch rows={aces} period={period.period} />
        </div>
      </div>

      <GoalsPanel goals={goals} />

      {/*
        What closing the month changes — at the FOOT of the page, not the head of it.

        It opened the screen as a full-width wall of four bullet points, so the first thing a leader
        met on the page they use every month was a paragraph about the page. The facts matter and
        are kept word for word; they belong where the design puts its explaining, which is under the
        work rather than in front of it.
      */}
      <section className="mt-14 border-t border-ink/10 pt-10">
        <h2 className="font-serif text-xl text-ink">What closing the month changes</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['A dated record', 'Every card becomes a performance record — what was expected, what happened, and who marked it.'],
            ['Nothing rewritten quietly', 'A correction afterwards is an amendment, shown beside the original rather than replacing it.'],
            ['The board pack follows', 'It is generated from this, and the next month opens with the same roles, KPIs and targets.'],
            ['Lock what you know', 'A number still waiting on the P&L stays pending and arrives later as an amendment.'],
          ].map(([head, body]) => (
            <article key={head} className="rounded-2xl bg-surface p-6">
              <h3 className="font-serif text-[17px] leading-6 text-ink">{head}</h3>
              <p className="mt-3 text-sm leading-[22px] text-ink/70">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <Problems screen="scoring" />

    </Shell>
  );
}
