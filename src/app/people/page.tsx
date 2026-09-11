import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScorecard, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { dueDateFor, dueState } from '@/lib/training';
import { PILLAR_META } from '@/lib/pillars';
import { LIGHT_COLOUR } from '@/lib/today';
import {
  clearToWork, onboarding, costOfVacancy, parseRatings, candidateScore,
  STAGES, HIRING_CHECKS, INTERVIEW_PROMPTS, type PersonRow,
} from '@/lib/people';
import { addCandidate, setStage, rateCandidate } from './actions';

export const dynamic = 'force-dynamic';

const CLEAR_COLOUR = {
  clear: LIGHT_COLOUR.green,
  blocked: LIGHT_COLOUR.red,
  unknown: LIGHT_COLOUR.pending,
} as const;

/**
 * People — looking after the ones you have, and finding the ones you need.
 *
 * Both are answered from the org chart rather than from a separate HR silo: the role is what the
 * business needs, the person is who is in it, and a vacancy is a hole in the chart before it is a
 * job ad.
 *
 * Records held against a PERSON — pay, personal documents — sit outside the scorecard. They gate
 * Clear to Work; they never become a score.
 */
export default async function People({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const { mode } = await searchParams;
  const hiring = mode === 'hiring';

  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const manage = canManage(user.access);

  // Only the part of the chart this person is entitled to see, as everywhere else.
  const visible = scope.roles.filter(r => scope.canSee(r.id));
  const roleIds = visible.map(r => r.id);

  const criteria = roleIds.length
    ? await db.select().from(schema.criteria).where(inArray(schema.criteria.roleId, roleIds))
    : [];
  const assignments = roleIds.length
    ? await db.select().from(schema.roleAssignments)
        .where(and(inArray(schema.roleAssignments.roleId, roleIds), isNull(schema.roleAssignments.toDate)))
    : [];
  const curriculum = roleIds.length
    ? await db.select().from(schema.roleCurriculum).where(inArray(schema.roleCurriculum.roleId, roleIds))
    : [];
  const modules = await db.select().from(schema.trainingModules)
    .where(eq(schema.trainingModules.tenantId, user.tenantId));
  const userIds = assignments.map(a => a.userId).filter((id): id is string => !!id);
  const records = userIds.length
    ? await db.select().from(schema.trainingRecords)
        .where(and(eq(schema.trainingRecords.tenantId, user.tenantId), inArray(schema.trainingRecords.userId, userIds)))
    : [];

  const now = new Date();
  const people: (PersonRow & { scored: boolean; hasPath: boolean; pathComplete: boolean; signedOff: boolean })[] = [];
  for (const r of visible) {
    const own = criteria.filter(c => c.roleId === r.id && c.active);
    const scored = isScored(r.level, own.length);
    const assignment = assignments.find(a => a.roleId === r.id);
    const name = r.holder?.name ?? r.pencilled ?? null;

    let blocking: string[] = [];
    if (period && scored) {
      const { rows } = await getScorecard(r.id, period.id);
      blocking = rows.filter(x => x.pillar === 'compliance' && x.answer === 'N').map(x => x.text);
    }

    const path = curriculum.filter(c => c.roleId === r.id);
    const done = new Set(records.filter(x => x.userId === assignment?.userId && x.progress >= 100).map(x => x.moduleId));
    const overdue = path
      .filter(c => dueState(dueDateFor(assignment?.fromDate ?? null, c.dueDays), done.has(c.moduleId), now) === 'overdue')
      .map(c => modules.find(m => m.id === c.moduleId)?.title ?? 'A module')
      .filter(Boolean);

    people.push({
      roleId: r.id, roleTitle: r.title, name,
      placement: r.holder ? 'held' : r.pencilled ? 'pencilled' : 'vacant',
      seated: !!assignment?.userId,
      blocking, overdue, scored,
      hasPath: path.length > 0,
      pathComplete: path.length > 0 && path.every(c => done.has(c.moduleId)),
      signedOff: !!assignment?.trainedAt,
    });
  }

  const vacancies = people.filter(p => p.placement === 'vacant');
  const candidates = await db.select().from(schema.candidates)
    .where(eq(schema.candidates.tenantId, user.tenantId));

  return (
    <Shell
      title="People"
      subtitle={hiring ? 'The roles you need filled, and who is in front of you.' : 'Who is where, and who is clear to work.'}
    >
      <div className="flex flex-wrap gap-2">
        <Link href="/people" className={`rounded-full px-4 py-2 text-sm ${!hiring ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}>
          Who you have
        </Link>
        <Link href="/people?mode=hiring" className={`rounded-full px-4 py-2 text-sm ${hiring ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}>
          Who you need
        </Link>
      </div>

      {!hiring ? (
        <>
          <section className="card mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Everyone in your part of the chart</h2>
              <span className="text-sm text-ink-light">
                {people.filter(p => p.placement !== 'vacant').length} in roles · {vacancies.length} vacant
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="table-clean min-w-[720px]">
                <thead>
                  <tr>
                    <th>Person</th><th>Role</th><th>Basis</th><th>Clear to work</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(p => {
                    const clear = clearToWork(p);
                    return (
                      <tr key={p.roleId}>
                        <td className="text-ink">{p.name ?? <span className="text-ink-light">Nobody yet</span>}</td>
                        <td>
                          <Link href={`/scorecard/${p.roleId}`} className="text-ink hover:text-rust">{p.roleTitle}</Link>
                          {!p.scored && <span className="mt-0.5 block text-xs text-ink-light">Checklist role</span>}
                        </td>
                        <td className="text-xs">
                          {p.placement === 'vacant' ? 'Open' : p.seated ? 'Has a seat' : 'Pencilled in, not invited'}
                        </td>
                        <td>
                          <span
                            className="pill"
                            style={{
                              background: `color-mix(in srgb, ${CLEAR_COLOUR[clear.state]} 14%, transparent)`,
                              color: CLEAR_COLOUR[clear.state],
                            }}
                          >
                            {clear.label}
                          </span>
                          <span className="mt-1 block text-xs text-ink-light">{clear.note}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-ink-light">
              Pay and personal documents are held against the person rather than the role, so they sit
              outside the scorecard entirely. They gate Clear to Work; they never become a score.
            </p>
          </section>

          <section className="card mt-6">
            <h2 className="font-serif text-xl text-ink">Getting started</h2>
            <p className="mt-1 text-sm text-ink-light">
              Nobody ticks anything here. Each step is done when the thing itself is done.
            </p>
            <ul className="mt-4 grid gap-3">
              {people.filter(p => p.placement !== 'vacant' && !(p.seated && p.pathComplete && p.signedOff)).map(p => {
                const steps = onboarding(p, p.hasPath, p.pathComplete, p.signedOff);
                const at = steps.findIndex(s => !s.done);
                return (
                  <li key={p.roleId} className="card-inset">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-serif text-base text-ink">{p.name}</span>
                      <span className="text-xs text-ink-light">{p.roleTitle}</span>
                    </div>
                    <ol className="mt-2 flex flex-wrap gap-2">
                      {steps.map(s => (
                        <li
                          key={s.key}
                          className="pill"
                          style={{
                            background: `color-mix(in srgb, ${s.done ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending} 14%, transparent)`,
                            color: s.done ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending,
                          }}
                        >
                          {s.label}
                        </li>
                      ))}
                    </ol>
                    {at >= 0 && <p className="mt-2 text-xs text-ink-light">{steps[at].note}</p>}
                  </li>
                );
              })}
              {people.every(p => p.placement === 'vacant' || (p.seated && p.pathComplete && p.signedOff)) && (
                <li className="text-sm text-ink-light">Everybody in a role is in, trained and signed off.</li>
              )}
            </ul>
          </section>
        </>
      ) : (
        <>
          <section className="card mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Open roles</h2>
              <span className="text-sm text-ink-light">{vacancies.length} from the chart</span>
            </div>
            {vacancies.length ? (
              <ul className="mt-4 grid gap-3">
                {vacancies.map(v => {
                  const own = criteria.filter(c => c.roleId === v.roleId && c.active);
                  const pillars = PILLARS.filter(p => own.some(c => c.pillar === p));
                  const orphaned = visible.filter(r => r.reportsToRoleId === v.roleId).length;
                  return (
                    <li key={v.roleId} className="card-inset">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-serif text-base text-ink">{v.roleTitle}</span>
                        <Link href={`/scorecard/${v.roleId}`} className="text-xs text-rust-700 hover:underline">
                          What it is measured on →
                        </Link>
                      </div>
                      <p className="mt-1 text-xs text-ink-light">
                        {costOfVacancy({ roleId: v.roleId, title: v.roleTitle, scored: v.scored, pillars, orphaned })}
                      </p>
                      {manage && (
                        <form action={addCandidate} className="mt-3 flex flex-wrap gap-2">
                          <input type="hidden" name="roleId" value={v.roleId} />
                          <input className="input flex-1" name="name" required placeholder="Somebody you are considering" aria-label="Candidate name" />
                          <SubmitButton className="btn-secondary shrink-0 px-3 py-1.5 text-xs" pending="…">Add</SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-light">
                Every role in your part of the chart has somebody in it. A vacancy shows up here the moment
                one does not — it is a hole in the chart before it is a job ad.
              </p>
            )}
          </section>

          <section className="card mt-6">
            <h2 className="font-serif text-xl text-ink">Before anybody starts</h2>
            <p className="mt-1 text-sm text-ink-light">
              What has to have an answer. The specifics — which licence, which award, which band — belong to
              your business and your region; SPEC does not pretend to know them.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {HIRING_CHECKS.map(c => (
                <li key={c.key} className="card-inset">
                  <div className="text-sm text-ink">{c.label}</div>
                  <div className="mt-1 text-xs text-ink-light">{c.note}</div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Who is in front of you</h2>
              <span className="text-sm text-ink-light">{candidates.length} being considered</span>
            </div>
            {candidates.length ? (
              <ul className="mt-4 grid gap-3">
                {candidates.map(c => {
                  const ratings = parseRatings(c.ratings);
                  const mean = candidateScore(ratings);
                  const role = visible.find(r => r.id === c.roleId);
                  return (
                    <li key={c.id} className="card-inset">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-serif text-base text-ink">{c.name}</span>
                          <span className="block text-xs text-ink-light">{role?.title ?? 'Role no longer on the chart'}</span>
                        </span>
                        <span className="text-sm text-ink-light">
                          {mean === null ? 'Not rated yet' : `${mean.toFixed(1)} of 5`}
                        </span>
                      </div>

                      {manage && (
                        <form action={rateCandidate} className="mt-3 grid gap-2 sm:grid-cols-[repeat(4,1fr)_auto]">
                          <input type="hidden" name="candidateId" value={c.id} />
                          {PILLARS.map(p => (
                            <label key={p} className="text-xs text-ink-light">
                              {PILLAR_META[p].name}
                              <input
                                className="input mt-1"
                                type="number" min={1} max={5}
                                name={`rating:${p}`}
                                defaultValue={ratings[p] ?? ''}
                                aria-label={`${PILLAR_META[p].name} rating out of 5`}
                              />
                            </label>
                          ))}
                          <SubmitButton className="btn-secondary shrink-0 self-end px-3 py-1.5 text-xs" pending="…">Rate</SubmitButton>
                        </form>
                      )}

                      {manage && (
                        <form action={setStage} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="candidateId" value={c.id} />
                          <select className="input flex-1" name="stage" defaultValue={c.stage} aria-label="Stage">
                            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                          <SubmitButton className="btn-secondary shrink-0 px-3 py-1.5 text-xs" pending="…">Move</SubmitButton>
                        </form>
                      )}
                      <p className="mt-2 text-xs text-ink-light">
                        {STAGES.find(s => s.key === c.stage)?.note}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-light">Nobody is being considered yet.</p>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {PILLARS.map(p => (
                <div key={p} className="card-inset">
                  <div className="label-caps">{PILLAR_META[p].name}</div>
                  <p className="mt-1 text-sm text-ink-light">{INTERVIEW_PROMPTS[p]}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-light">
              Rated against the same four pillars the role is scored on, so the interview asks the questions
              the scorecard will. An unrated pillar is left out rather than counted as a zero.
            </p>
          </section>
        </>
      )}
    </Shell>
  );
}
