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
import { progressFor, verdict } from '@/lib/month';
import { getTeamRollupForRoles } from '@/lib/queries';
import { isScored } from '@/lib/today-data';
import { signPeriod, submitPeriod } from '@/app/scoring/actions';
import { NOTIFY_LEVELS, NOTIFY_ALWAYS, NOTIFY_SENDS_TODAY, notifyLevelOf } from '@/lib/notify';
import { LIGHT_COLOUR, pillTone } from '@/lib/today';
import { approve, decline, setNotifyLevel } from './actions';
import { Problems } from '@/components/problems';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';

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
export default async function Inbox({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Why SPEC said no, if it just did. See lib/refuse — a refusal is a rule working, not a fault.
  const cannot = refusedReason(await searchParams);
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const manage = canManage(user.access);
  const top = isTopOfChart(scope);

  const stored = await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId));

  /*
    ── The month, read ONCE, for both the queue and the pass ───────────────────────────────────

    Kris, 19 September, on what the sign-off felt like: *"having to visit three screens"* — KPIs on
    the org chart, marking on /scoring, approving here — and, asked what he actually wants to do in
    one sitting: *"just sign off what others have marked"*.

    Approvals already claimed to be "everything waiting on a person", and for the month it was
    lying by omission: it printed a card reading **Sign off September scoring** whose only action
    was a link to a different screen. Telling somebody a thing is waiting on them and then sending
    them elsewhere to do it is what makes one job feel like three.

    So the whole month is read here, not just the count. Every scored role, what is marked on it,
    what it comes to — the same `getScorecard` loop that was already running, with the rows kept
    instead of thrown away after counting.
  */
  const inScope = scoredRolesInScope(scope);
  const monthRoles = period
    ? await Promise.all(inScope.map(async r => {
      const { rows, score } = await getScorecard(r.id, period.id);
      return {
        roleId: r.id, title: r.title, holder: r.holder?.name ?? r.pencilled ?? null,
        rows, score, scored: isScored(r.level, rows.length, r.isTeam),
      };
    }))
    : [];
  /*
    `progressFor` is the same function /scoring draws its list from. The RULE about what "marked"
    means has to be one rule — two screens counting a month differently is how a business is told
    it is finished on one page and not on the other.
  */
  const progress = progressFor(monthRoles);
  const monthRollup = period ? await getTeamRollupForRoles(inScope, period.id) : null;

  let submittedPeriod: DerivedInputs['submittedPeriod'] = null;
  if (period && period.status === 'submitted') {
    submittedPeriod = {
      period: period.period, submittedBy: period.submittedBy, submittedAt: period.submittedAt,
      scoredRoles: monthRoles.filter(r => r.score.overall !== null).length,
      flagged: monthRoles.reduce((n, r) => n + r.rows.filter(x => x.status === 'not_tracked').length, 0),
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
      kicker="Approvals · everything waiting on a person"
      headline={items.length === 1 ? 'One thing is waiting on you' : items.length ? `${items.length} things are waiting on you` : 'Nothing is waiting on you'}
      subtitle="Everything in SPEC that needs a person to decide, in one place, oldest first."
    >
      <Refused reason={cannot} />

      {/*
        ── The month, signed off in one pass, on the screen that says it is waiting ────────────

        Kris: *"having to visit three screens"*, and what he wants in one sitting: *"just sign off
        what others have marked"*.

        This is the second half of that. Approvals listed the month as waiting on him and then sent
        him to /scoring to act on it; now the decision and the thing being decided are in the same
        place. Everything a person needs to sign: what the month comes to, which roles are marked
        and what each scored, which are not and who they are waiting on.

        ── What it deliberately does NOT do ─────────────────────────────────────────────────────

        It does not mark anything. Reviewing and entering are different jobs done by different
        people, and a screen that let the signer fill in the blanks would make the signature
        worthless — the whole point of the trail is that one person marks and another accepts.
        /scoring stays where marking happens, and the roles below link to it one at a time.

        It also never shows a Sign button to somebody who cannot sign. `signPeriod` refuses anybody
        who is not the top of the chart, and offering a control the server is going to refuse is
        how "I still cant" happens with nothing on screen to explain it.
      */}
      {period && progress.length > 0 && (
        <section className="card mb-6" data-month-pass>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="label-caps text-rust-700">This month</span>
              <p className="mt-1.5 font-serif text-xl text-ink">
                {period.period} &mdash; {progress.filter(p => p.done).length} of {progress.length} roles marked
              </p>
            </div>
            {monthRollup?.scoredCount ? (
              <span className="shrink-0 text-right">
                <span className="label-caps block text-ink-light">What the board sees</span>
                <span className="font-serif text-[22px] leading-none text-ink" data-month-figure>
                  {monthRollup.team.overall === null ? '—' : `${Math.round(monthRollup.team.overall * 100)}%`}
                </span>
              </span>
            ) : null}
          </div>

          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[22px] text-ink-light">
            {verdict(monthRollup?.scoredCount ? monthRollup.team : null).line}
          </p>

          {/*
            Every role, marked or not, with who is waiting. A list of what is DONE tells a signer
            nothing about whether they can sign; the outstanding ones are the decision.
          */}
          <ul className="mt-4 grid gap-1.5 border-t border-rust-200 pt-4">
            {progress.map(line => (
              <li key={line.roleId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-cream px-3.5 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5 text-sm text-ink">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: line.done ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending }}
                  />
                  <Link href={`/scorecard/${line.roleId}`} className="truncate hover:text-rust">
                    {line.title}
                  </Link>
                  <span className="truncate text-xs text-ink-light">{line.holder ?? 'Vacant'}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-ink-light" data-month-role={line.roleId}>
                  {line.done
                    ? (line.score === null ? 'Marked' : `${Math.round(line.score * 100)}%`)
                    : `${line.marked} of ${line.total} marked`}
                </span>
              </li>
            ))}
          </ul>

          {/*
            One action, and only the one that is actually available right now. Three states, and
            each of the other two says who it is waiting on rather than leaving a dead button.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/*
              Only while it is submitted AND unsigned.

              `signPeriod` records `signedBy` and `signedAt`; it does NOT set the status to locked,
              because locking is its own act. So after signing, the status is still `submitted` —
              and a button keyed on status alone stayed on screen, offering to sign a month that had
              just been signed, above a sentence that still read "Signing accepts it". Press,
              nothing visibly happens, press again.
            */}
            {period.status === 'submitted' && !period.signedBy && top && (
              <form action={signPeriod}>
                <input type="hidden" name="periodId" value={period.id} />
                <SubmitButton className="btn-primary" pending="Signing…">
                  Sign off {period.period}
                </SubmitButton>
              </form>
            )}
            {period.status === 'open' && top && progress.every(p => p.done) && (
              <form action={submitPeriod}>
                <input type="hidden" name="periodId" value={period.id} />
                <SubmitButton className="btn-primary" pending="Submitting…">
                  Submit {period.period} for sign-off
                </SubmitButton>
              </form>
            )}
            <p className="text-[13px] leading-5 text-ink-light">
              {period.status === 'locked'
                ? `Signed by ${period.signedBy ?? 'the board'}. Nothing recalculates a locked month.`
                : period.signedBy
                  ? `Signed by ${period.signedBy}. The business has accepted the month.`
                : period.status === 'submitted'
                  ? (top
                    ? `Submitted by ${period.submittedBy ?? 'the top of the chart'}. Signing accepts it and closes the month.`
                    : `Waiting on ${period.submittedBy ? 'the board' : 'the top of the chart'} to sign. Signing is never delegable.`)
                  : progress.every(p => p.done)
                    ? (top
                      ? 'Every role is marked, so the month can go up.'
                      : 'Every role is marked. The top of the chart submits it.')
                    : `${progress.filter(p => !p.done).length} still to mark — each manager marks their own reports.`}
            </p>
            <Link href="/scoring" className="text-[13px] text-rust-700 underline-offset-2 hover:underline">
              Open scoring
            </Link>
          </div>
        </section>
      )}

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
                  <Link href={i.href} className="mt-4 link-go">
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
