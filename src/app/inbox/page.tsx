import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScorecard } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope, scoredRolesInScope, isTopOfChart } from '@/lib/scope';
import { queue, ageLabel, type DerivedInputs } from '@/lib/inbox';
import { LIGHT_COLOUR, pillTone } from '@/lib/today';
import { approve, decline } from './actions';

export const dynamic = 'force-dynamic';

const TONE = {
  red: LIGHT_COLOUR.red, amber: LIGHT_COLOUR.amber, green: LIGHT_COLOUR.green, grey: LIGHT_COLOUR.pending,
} as const;

/**
 * Approvals — one queue of everything waiting on a person.
 *
 * Most of it is worked out rather than filed: a month waiting to be signed, a finished training
 * path with no signature, a role nobody holds. Only decisions that need a record of their own are
 * stored. Everything says what it blocks, because an approval with no consequence is not urgent.
 */
export default async function Inbox() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const manage = canManage(user.access);
  const top = isTopOfChart(scope);

  const stored = await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId));

  // Everything below is worked out from state this person is already entitled to see.
  const inScope = scoredRolesInScope(scope);
  let submittedPeriod: DerivedInputs['submittedPeriod'] = null;
  if (period && period.status === 'submitted') {
    let scored = 0;
    let flagged = 0;
    for (const r of inScope) {
      const { rows, score } = await getScorecard(r.id, period.id);
      if (score.overall !== null) scored += 1;
      flagged += rows.filter(x => x.status === 'not_tracked').length;
    }
    submittedPeriod = {
      period: period.period, submittedBy: period.submittedBy, submittedAt: period.submittedAt,
      scoredRoles: scored, flagged,
    };
  }

  // Finished training paths with nobody's signature against them, for roles this person manages.
  const managed = scope.roles.filter(r => scope.canEdit(r.id) && r.id !== scope.myRoleId);
  const trainingSignoffs: DerivedInputs['trainingSignoffs'] = [];
  if (managed.length) {
    const curriculum = await db.select().from(schema.roleCurriculum)
      .where(inArray(schema.roleCurriculum.roleId, managed.map(r => r.id)));
    const assignments = await db.select().from(schema.roleAssignments)
      .where(and(inArray(schema.roleAssignments.roleId, managed.map(r => r.id)), isNull(schema.roleAssignments.toDate)));
    const userIds = assignments.map(a => a.userId).filter((id): id is string => !!id);
    const records = userIds.length
      ? await db.select().from(schema.trainingRecords)
          .where(and(eq(schema.trainingRecords.tenantId, user.tenantId), inArray(schema.trainingRecords.userId, userIds)))
      : [];

    for (const a of assignments) {
      if (a.trainedAt || !a.userId) continue;
      const path = curriculum.filter(c => c.roleId === a.roleId);
      if (!path.length) continue;
      const done = new Set(records.filter(r => r.userId === a.userId && r.progress >= 100).map(r => r.moduleId));
      if (!path.every(c => done.has(c.moduleId))) continue;
      const role = managed.find(r => r.id === a.roleId)!;
      trainingSignoffs.push({
        roleId: role.id, title: role.title,
        person: role.holder?.name ?? role.pencilled ?? 'Whoever holds it',
        completedModules: path.length,
      });
    }
  }

  const vacancies = scope.roles
    .filter(r => r.reportsToRoleId === scope.myRoleId && !r.holder && !r.pencilled)
    .map(r => ({ roleId: r.id, title: r.title, since: null }));

  const targetChanges = [];
  if (scope.myRoleId) {
    const criteria = await db.select().from(schema.criteria).where(eq(schema.criteria.roleId, scope.myRoleId));
    for (const c of criteria) {
      if (!c.active || !c.proposedTarget || !c.target || c.proposedTarget === c.target) continue;
      targetChanges.push({ criterionId: c.id, roleId: c.roleId, text: c.text, proposed: c.proposedTarget, agreed: c.target });
    }
  }

  const items = queue(stored, { submittedPeriod, trainingSignoffs, vacancies, targetChanges });
  const decided = stored.filter(a => a.state !== 'waiting')
    .sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
    .slice(0, 8);

  return (
    <Shell
      title="Approvals"
      subtitle={items.length ? `${items.length} waiting on you` : 'Nothing is waiting on you'}
    >
      {items.length ? (
        <ul className="grid gap-4">
          {items.map(i => {
            const canDecide = i.approvalId
              ? manage && (i.level === 'board' ? top : i.level === 'administrator' ? scope.canAdminister : true)
              : false;
            return (
              <li key={i.id} className="card" style={{ borderLeft: `4px solid ${TONE[i.tone]}` }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="label-caps">{i.kind}</span>
                    <span
                      className="pill"
                      style={pillTone(i.tone)}
                    >
                      {ageLabel(i.age)}
                    </span>
                  </span>
                  <span className="text-xs text-ink-light">
                    {i.level === 'board' ? 'Board decision' : i.level === 'administrator' ? 'Administrator' : 'Manager sign-off'}
                  </span>
                </div>

                <Link href={i.href} className="mt-2 block font-serif text-lg text-ink hover:text-rust">{i.title}</Link>
                <p className="mt-1 text-sm text-ink-light">{i.detail}</p>
                <p className="mt-1 text-xs text-ink-light">{i.from}</p>
                <p className="mt-2 text-xs" style={{ color: i.blocks ? TONE[i.tone] : undefined }}>
                  {i.blocks ?? 'Blocks: nothing. It is recorded here so it is not a surprise later.'}
                </p>

                {canDecide ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={approve}>
                      <input type="hidden" name="approvalId" value={i.approvalId!} />
                      <SubmitButton className="btn-primary" pending="Approving…">Approve</SubmitButton>
                    </form>
                    <form action={decline}>
                      <input type="hidden" name="approvalId" value={i.approvalId!} />
                      <SubmitButton className="btn-secondary" pending="Declining…">Decline</SubmitButton>
                    </form>
                  </div>
                ) : (
                  <Link href={i.href} className="mt-4 inline-block text-sm text-rust-700 hover:underline">
                    {i.approvalId ? 'Waiting on somebody else →' : 'Deal with it where it lives →'}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">Nothing is waiting on you</div>
          <p className="mt-1 text-sm text-ink-light">
            No month to sign, no path to countersign, no connection asking for approval and no role reporting
            to you that nobody holds.
          </p>
        </div>
      )}

      {decided.length > 0 && (
        <section className="card mt-10">
          <h2 className="font-serif text-xl text-ink">Recently decided</h2>
          <p className="mt-1 text-sm text-ink-light">
            Every decision keeps the name and the date, approvals and declines alike. A decline is a real
            outcome, not a request left open.
          </p>
          <ul className="mt-4 grid gap-2">
            {decided.map(a => (
              <li key={a.id} className="card-inset flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{a.title}</span>
                  <span className="block text-xs text-ink-light">{a.detail}</span>
                </span>
                <span
                  className="text-xs"
                  style={{ color: a.state === 'approved' ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending }}
                >
                  {a.state === 'approved' ? 'Approved' : 'Declined'} · {a.decidedBy} · {a.decidedAt?.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
