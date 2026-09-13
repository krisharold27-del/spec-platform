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
import { queue, ageLabel, handled, type DerivedInputs } from '@/lib/inbox';
import { NOTIFY_LEVELS, NOTIFY_ALWAYS, NOTIFY_SENDS_TODAY, notifyLevelOf } from '@/lib/notify';
import { LIGHT_COLOUR, pillTone } from '@/lib/today';
import { approve, decline, setNotifyLevel } from './actions';
import { Problems } from '@/components/problems';

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

  /*
    What SPEC did without asking. Read from what actually happened — a problem that carries a
    reading, a pack whose author was Claude — never from a log of intentions. See lib/inbox.
  */
  const readings = await db.select({
    text: schema.registerEntries.text,
    createdAt: schema.registerEntries.createdAt,
    errorLine: schema.registerEntries.errorLine,
  }).from(schema.registerEntries).where(eq(schema.registerEntries.tenantId, user.tenantId));
  const packs = await db.select({
    period: schema.periods.period,
    generatedBy: schema.boardOutputs.generatedBy,
    approvedBy: schema.boardOutputs.approvedBy,
    createdAt: schema.boardOutputs.createdAt,
  })
    .from(schema.boardOutputs)
    .innerJoin(schema.periods, eq(schema.periods.id, schema.boardOutputs.periodId))
    .where(eq(schema.periods.tenantId, user.tenantId));
  const byClaude = handled({ readings, packs });
  // Read from the row rather than from the session: the loudness is a setting, not an identity, and
  // CurrentUser is deliberately the four things every page needs and nothing else.
  const [me] = await db.select({ notifyLevel: schema.users.notifyLevel })
    .from(schema.users).where(eq(schema.users.id, user.id));
  const notify = notifyLevelOf(me?.notifyLevel);

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

      {/*
        The queue's opposite number. Everything above needs a person; this is what did not.

        Shown even when empty, because "SPEC has done nothing on its own" is the answer to the
        question people bring here, and an absent section reads as a hidden one.
      */}
      <section className="card mt-10">
        <h2 className="font-serif text-xl text-ink">What Claude handled</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Routine things that did not need a person. None of it changed a score, moved money or told
          anybody anything — each one is an opinion or a draft, and the line beneath says what
          overrides it.
        </p>
        {byClaude.length === 0 ? (
          <p className="mt-4 text-sm text-ink-light">
            Nothing yet. SPEC does not act on its own until there is something to read.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {byClaude.map((h, i) => (
              <li key={`${h.when}-${i}`} className="card-inset">
                <Link href={h.href} className="text-sm text-ink hover:text-rust">{h.what}</Link>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs text-ink-light">{h.supersededBy}</span>
                  <span className="text-xs text-ink-light">{h.when.slice(0, 10)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        One choice, three positions, and one thing that is not adjustable.

        Twenty switches means everything is on, everything is ignored, and the message that mattered
        went the same way as the other forty. What SPEC actually sends today is listed underneath so
        the setting is not a promise about mail that does not exist yet.
      */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">How you are notified</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          SPEC does not send everything everywhere. Pick the loudness once.
        </p>
        <form action={setNotifyLevel} className="mt-4 grid gap-2">
          {NOTIFY_LEVELS.map(l => (
            <label
              key={l.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                notify === l.id ? 'border-rust bg-rust-100/40' : 'border-ink/10 bg-surface'
              }`}
            >
              <input type="radio" name="level" value={l.id} defaultChecked={notify === l.id} className="mt-1" />
              <span className="grid gap-0.5">
                <span className="text-sm text-ink">{l.label}</span>
                <span className="text-xs text-ink-light">{l.note}</span>
              </span>
            </label>
          ))}
          <SubmitButton className="btn-secondary mt-1 justify-self-start" pending="Saving…">Save</SubmitButton>
        </form>
        <p className="mt-4 text-xs text-ink-light">{NOTIFY_ALWAYS}</p>
        <p className="mt-3 text-xs text-ink-light">
          What SPEC sends by email today, in full: {NOTIFY_SENDS_TODAY.join(' ')} Everything else is
          on this page, where you come to look.
        </p>
      </section>

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
      <Problems screen="inbox" />

    </Shell>
  );
}
