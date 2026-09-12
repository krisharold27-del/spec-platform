import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { ScorecardTabs } from '@/components/scorecard-tabs';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, getRoles, getScorecard, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { cadenceOf, CADENCE } from '@/lib/governance';
import { validateWeights } from '@/lib/scoring';
import { isScored } from '@/lib/today-data';
import { summarise, provenance, preparedBy, unexplained } from '@/lib/scorecard';
import { addComment, addKpi } from './actions';

export const dynamic = 'force-dynamic';

/**
 * My scorecard — one role, one month, with the working shown.
 *
 * Four pillars, each with its measures: what the target was, what happened, whether it is confirmed,
 * and where the number came from. The last column is the one most reports leave out and the one a
 * board actually needs.
 *
 * Marking the month happens on /scoring, which is where a month is closed. This page is the record.
 */
export default async function Scorecard({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const period = await currentPeriod(tenant.id);
  const role = (await getRoles(tenant.id)).find(r => r.id === roleId);
  if (!role) return <Shell title="Role not found"><p>No such role in this business.</p></Shell>;

  // You see your own board and everything below it — never above, never sideways.
  const scope = await getScope(user);
  if (!scope.canSee(roleId)) {
    return (
      <Shell title="Not your scorecard" subtitle="You can see your own SPEC board and those of your team.">
        <div className="callout max-w-2xl">
          <p className="text-sm text-ink-light">
            <b className="text-ink">{role.title}</b> sits outside your part of the org chart, so its scores
            are not yours to see.
          </p>
          <Link href="/me" className="btn-primary mt-4 inline-block">Go to my scorecard</Link>
        </div>
      </Shell>
    );
  }

  if (!period) {
    return (
      <Shell title={`${role.title} — scorecard`} subtitle="Not scoring yet">
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">The card opens as soon as the role has its KPIs</div>
          <p className="mt-1 text-sm text-ink-light">
            Every role needs two numbers per pillar — Safety, People, Earnings, Compliance. Setting them
            is free.
          </p>
          <Link href="/setup/kpis" className="btn-primary mt-4 inline-block">Set the KPIs</Link>
        </div>
      </Shell>
    );
  }

  const { rows, score } = await getScorecard(roleId, period.id);
  const scored = isScored(role.level, rows.length);
  const marks = rows.filter(r => r.answer !== '').length;
  const weightProblems = validateWeights(rows.map(r => ({ id: r.criterionId, pillar: r.pillar, text: r.text, weight: r.weight })));

  const comments = await db.select().from(schema.scorecardComments)
    .where(and(eq(schema.scorecardComments.roleId, roleId), eq(schema.scorecardComments.periodId, period.id)))
    .orderBy(asc(schema.scorecardComments.createdAt));

  // The roles beneath this one. Their numbers roll into this card.
  const below = scope.roles.filter(r => r.reportsToRoleId === roleId && scope.canSee(r.id));
  const staff = [];
  for (const r of below) {
    const { rows: theirRows, score: theirScore } = await getScorecard(r.id, period.id);
    staff.push({
      roleId: r.id, title: r.title,
      person: r.holder?.name ?? r.pencilled ?? null,
      scored: isScored(r.level, theirRows.length),
      score: theirScore,
    });
  }

  const signOff = role.reportsToRoleId ? scope.roles.find(r => r.id === role.reportsToRoleId) : null;
  const cadence = CADENCE[cadenceOf(tenant.boardCadence)];
  const summaries = PILLARS.map(p => summarise(rows, p, score.pillars[p]));
  const missing = unexplained(rows);

  return (
    <Shell
      title={`${role.title} — scorecard`}
      subtitle={`${period.period} · ${period.status === 'locked' ? 'locked' : 'open'} · ${cadence.label.toLowerCase()} board`}
    >
      <section className="card">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="label-caps">Prepared by</dt>
            <dd className="mt-1 text-sm text-ink">{preparedBy(role.holder?.name ?? role.pencilled ?? null, marks)}</dd>
          </div>
          <div>
            <dt className="label-caps">For sign-off by</dt>
            <dd className="mt-1 text-sm text-ink">
              {signOff ? `${signOff.holder?.name ?? 'Nobody yet'} · ${signOff.title}` : 'Top of the chart — signs its own month'}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Period</dt>
            <dd className="mt-1 text-sm text-ink">{period.period}</dd>
          </div>
          <div>
            <dt className="label-caps">Overall</dt>
            <dd className="mt-1 font-serif text-2xl text-ink">{scored ? pct(score.overall) : '—'}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ink-light">
          {period.status === 'locked'
            ? 'This month is locked. Nothing recalculates history — a correction is a dated amendment in the next month, shown beside the original.'
            : 'The month is marked and closed on monthly scoring. Locking keeps the structure, targets and chain it had.'}
        </p>
        {period.status !== 'locked' && (
          <Link href="/scoring" className="btn-secondary mt-3 inline-block">Open monthly scoring</Link>
        )}
      </section>

      {!scored && (
        <div className="callout mt-6">
          <p className="text-sm text-ink-light">
            This is a checklist role: it carries no individual KPI scorecard, so it has no score and is not
            rolled up on its own. It is not behind — it is measured through the role above it.
          </p>
        </div>
      )}

      {weightProblems.length > 0 && (
        <div className="mt-6 rounded-lg border border-rust-300 bg-rust-100 p-3 text-sm text-rust-800">
          Weights must sum to 100% in every pillar. Problem:{' '}
          {weightProblems.map(w => `${PILLAR_META[w.pillar].name} = ${pct(w.total)}`).join(', ')}.
        </div>
      )}

      {missing.length > 0 && period.status !== 'locked' && (
        <div className="mt-6 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm">
          <div className="font-serif text-base text-ink">
            {missing.length} {missing.length === 1 ? 'miss has' : 'misses have'} nothing written against{' '}
            {missing.length === 1 ? 'it' : 'them'}
          </div>
          <p className="mt-1 text-ink-light">
            {missing.map(r => r.text).join('; ')}. A miss with no reason reaches the board pack as exactly
            that, which is worse than the miss.
          </p>
        </div>
      )}

      <div className="mt-6">
        <ScorecardTabs
          scored={scored}
          summaries={summaries.map(s => ({
            pillar: s.pillar,
            name: PILLAR_META[s.pillar].name,
            question: PILLAR_META[s.pillar].question,
            score: s.score,
            line: s.line,
            tone: s.tone,
            rows: rows.filter(r => r.pillar === s.pillar),
          }))}
        />
      </div>

      {/*
        Adding a KPI belongs here, not only in the setup wizard.

        The measures worth having are the ones somebody thinks of in March, looking at a month that
        failed to measure the thing that actually went wrong. If the only way to add one is to walk
        back through setup, nobody does, and the card stays wrong for a year.

        Weights are not asked for. They must sum to 100% within a pillar, and making somebody do
        that arithmetic to add one row is how a card ends up invalid — so the new one takes an equal
        share and the rest are scaled to fit. See addKpi.
      */}
      {scored && period.status !== 'locked' && scope.canEdit(roleId) && (
        <section className="card mt-6">
          <h2 className="font-serif text-xl text-ink">Add a KPI</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-light">
            One measure, against one pillar. It joins {period.period} and every month after it —
            closed months keep exactly what they were signed with.
          </p>
          <form action={addKpi} className="mt-4 grid gap-2 sm:grid-cols-[1.4fr_1fr_auto_auto]">
            <input type="hidden" name="roleId" value={roleId} />
            <input className="input" name="text" required maxLength={200} placeholder="New KPI" aria-label="New KPI" />
            <input className="input" name="target" maxLength={80} placeholder="Target" aria-label="Target" />
            <select className="input" name="pillar" defaultValue="safety" aria-label="Which pillar">
              {PILLARS.map(p => <option key={p} value={p}>{PILLAR_META[p].name}</option>)}
            </select>
            <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add KPI</SubmitButton>
          </form>
          <p className="mt-3 text-xs text-ink-light">
            Weights inside that pillar re-balance themselves — the new one takes an equal share and
            the others keep their order of importance.
          </p>
        </section>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card">
          <h2 className="font-serif text-xl text-ink">Comments</h2>
          <p className="mt-1 text-sm text-ink-light">
            These travel with the month to sign-off and into the board pack. What was said in {period.period}{' '}
            belongs to {period.period}.
          </p>
          {comments.length > 0 ? (
            <ul className="mt-4 grid gap-3">
              {comments.map(c => (
                <li key={c.id} className="card-inset">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-base text-ink">{c.author}</span>
                    <span className="text-xs text-ink-light">{c.createdAt.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-light">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-light">Nothing has been said about this month yet.</p>
          )}
          {period.status !== 'locked' && (
            <form action={addComment} className="mt-4 grid gap-2">
              <input type="hidden" name="roleId" value={roleId} />
              <input type="hidden" name="periodId" value={period.id} />
              <textarea
                className="input min-h-[72px] rounded-lg"
                name="body"
                required
                placeholder="What is behind these numbers"
                aria-label="Comment"
              />
              <SubmitButton className="btn-primary justify-self-start" pending="Adding…">Add the comment</SubmitButton>
            </form>
          )}
        </section>

        <div className="grid gap-6">
          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">My staff</h2>
              <span className="text-sm text-ink-light">{staff.length} below</span>
            </div>
            {staff.length ? (
              <ul className="mt-3 grid gap-2">
                {staff.map(s => (
                  <li key={s.roleId} className="card-inset">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/scorecard/${s.roleId}`} className="font-serif text-base text-ink hover:text-rust">
                        {s.person ?? 'Nobody in this role'}
                      </Link>
                      <span className="text-sm text-ink-light">{s.scored ? pct(s.score.overall) : 'Checklist'}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-light">{s.title}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-light">Nobody reports to this role.</p>
            )}
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Where these numbers come from</h2>
            <p className="mt-1 text-sm text-ink-light">
              Every figure traces to a system or to the person who confirmed it.
            </p>
            <ul className="mt-3 grid gap-3">
              {provenance(rows).map(p => (
                <li key={p.source}>
                  <div className={`text-sm ${p.unbacked ? 'text-ink-light' : 'text-ink'}`}>{p.source}</div>
                  <div className="mt-0.5 text-xs text-ink-light">{p.measures.join(' · ')}</div>
                  {p.unbacked && (
                    <div className="mt-1 text-xs text-ink-light">
                      Reported as a gap rather than scored. Not tracked is not a failure — it is something the
                      business cannot measure yet.
                    </div>
                  )}
                </li>
              ))}
              {rows.length === 0 && <li className="text-sm text-ink-light">No measures on this card yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
