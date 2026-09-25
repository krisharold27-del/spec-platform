import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnSystemLine } from '@/components/own-system-line';
import { ownSystemFor } from '@/lib/coverage-data';
import { connectHref } from '@/lib/coverage';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser, canManage } from '@/lib/auth';
import { getScorecard, getTenantById, PILLARS } from '@/lib/queries';
import { currentPeriod } from '@/lib/period';
import { getScope } from '@/lib/scope';
import { isScored } from '@/lib/today-data';
import { dueDateFor, dueState } from '@/lib/training';
import { PILLAR_META } from '@/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import {
  stateOf, stateNote, blockingReasons, STATE_LABEL,
  leaveLine, leaveKindLabel, impactOf, upcoming, LEAVE_KINDS,
} from '@/lib/obligations';
import {
  clearToWork, onboarding, costOfVacancy, parseRatings, candidateScore,
  STAGES, HIRING_CHECKS, INTERVIEW_PROMPTS, draftAd, type PersonRow,
} from '@/lib/people';
import { addCandidate, setStage, rateCandidate, addObligation, bookLeave, decideLeave } from './actions';
import { Problems } from '@/components/problems';
import type { Pillar } from '@/lib/scoring';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import { HR_TABS, tabOf, hrefOf, lastThree, lastPayWeek, exitsFrom, trainingStateOf, trainingSummary } from '@/lib/hr';
import { ConductTab, PayTab, type ReviewPerson, type TrainingRow, type ContractRow, type ExitRow } from './hr-tabs';
import { StaffListTab } from './staff-list';
import { SubbiesTab, type SubbieRow } from './subbies-tab';
import { SetupTab } from './setup-tab';
import { LeaversTab } from './leavers-tab';
import { seatKindFor } from '@/lib/chart-seats';
import { planStateFor } from '@/lib/plan';
import type { Person, SeatKind } from '@/lib/onboarding';
import { SwitchCards } from '@/components/recommends';

export const dynamic = 'force-dynamic';

const CLEAR_COLOUR = {
  clear: LIGHT_COLOUR.green,
  blocked: LIGHT_COLOUR.red,
  unknown: LIGHT_COLOUR.pending,
} as const;

/*
  A document's state, in the same four signal colours as everything else — and using LIGHT_INK
  rather than LIGHT_COLOUR, because these are read as words. Three of the four signal colours fail
  WCAG AA as text; the two-weight palette exists so nothing is ever both coloured and unreadable.
*/
const DOC_COLOUR = {
  current: LIGHT_INK.green,
  expiring: LIGHT_INK.amber,
  expired: LIGHT_INK.red,
  missing: LIGHT_INK.pending,
} as const;

/** Worst first. An expired ticket is the most important row on that list. */
const ORDER = { expired: 0, missing: 1, expiring: 2, current: 3 } as const;

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
export default async function People({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;
  const mode = typeof sp.mode === 'string' ? sp.mode : undefined;
  // Why SPEC said no, if it just did. See lib/refuse.
  const cannot = refusedReason(sp);
  const tab = tabOf(mode);
  const own = await ownSystemFor(user.tenantId, 'people', tab);
  const hiring = tab === 'hiring';

  const scope = await getScope(user);
  const period = await currentPeriod(user.tenantId);
  const manage = canManage(user.access);
  // The business's own name, for the advertisement drafted from each open role's KPIs.
  const tenant = (await getTenantById(user.tenantId))!;

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

  /*
    The papers, and who is away.

    Obligations are read for the whole business and matched below by person or by role, because a
    licence belongs to a PERSON and travels with them, while what a job requires belongs to the ROLE
    and whoever holds it inherits it — the same split the training path already keeps.
  */
  const obligationRows = await db.select().from(schema.obligations)
    .where(eq(schema.obligations.tenantId, user.tenantId));
  const leaverRows = await db.select().from(schema.leavers)
    .where(eq(schema.leavers.tenantId, user.tenantId))
    .orderBy(schema.leavers.lastDay);

  const leaveRows = await db.select().from(schema.leaveEntries)
    .where(eq(schema.leaveEntries.tenantId, user.tenantId));
  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  const seatRows = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
  const nameOf = (staffId: string | null, userId: string | null): string =>
    staffRows.find(s => s.id === staffId)?.name
    ?? seatRows.find(u => u.id === userId)?.name
    ?? 'Somebody';

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  /*
    Subcontractors and their six checks, read only for the tab that shows them. A business with
    forty subbies has 240 check rows, and every other tab on this screen would carry that read for
    nothing.
  */
  /*
    Everybody, for the setup list. Read only for that tab: it is the widest read on this screen —
    the staff rows, their roles, their licences and their training all at once — and every other tab
    would carry it for nothing.

    The chart's own guess at each seat comes from `seatKindFor`, which is what billing uses. The
    tick on the row beats it; until somebody ticks, the guess stands and the screen says so.
  */
  const setupPeople: (Person & { chartSeat: SeatKind; setupToken: string | null })[] = await (async () => {
    /*
      Loaded for the leavers tab too, which needs the same staff-backed list: a leaver IS a staff
      record, and the chart's rows carry a role id rather than a person. Still skipped on every
      other tab, because this is four queries nobody else is asking for.
    */
    if (tab !== 'setup' && tab !== 'leavers') return [];
    const [staffRows, assignments, licences, trainingDone] = await Promise.all([
      db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId))
        .orderBy(schema.staff.name),
      db.select().from(schema.roleAssignments).where(isNull(schema.roleAssignments.toDate)),
      db.select().from(schema.obligations).where(eq(schema.obligations.tenantId, user.tenantId)),
      db.select().from(schema.trainingRecords).where(eq(schema.trainingRecords.tenantId, user.tenantId)),
    ]);
    const roleById = new Map(scope.roles.map(r => [r.id, r]));
    const leads = new Set(scope.roles.map(r => r.reportsToRoleId).filter((x): x is string => Boolean(x)));

    return staffRows.map(st => {
      const held = assignments.find(a => a.staffId === st.id);
      const role = held ? roleById.get(held.roleId) : undefined;
      return {
        id: st.id,
        name: st.name,
        email: st.email,
        roleTitle: role?.title ?? null,
        seatKind: st.seatKind,
        isSubcontractor: Boolean(st.isSubcontractor),
        inductedAt: st.inductedAt,
        licences: licences.filter(o => o.staffId === st.id)
          .map(o => ({ what: o.what, expiresAt: o.expiresAt })),
        trainingDone: trainingDone.filter(t => t.completedAt && (t.staffId === st.id || (t.userId && t.userId === st.userId))).length,
        trainingNeeded: 0,
        invited: Boolean(st.userId),
        setupToken: st.setupToken,
        chartSeat: (role
          ? seatKindFor({ title: role.title, hasDirectReports: leads.has(role.id) })
          : 'team') as SeatKind,
      };
    });
  })();

  const setupPlan = tab === 'setup' ? await planStateFor(user.tenantId) : null;
  const setupCurrency = setupPlan?.currency ?? 'aud';
  const setupSubscribed = Boolean(setupPlan?.billing);

  /* Apprentice claims, read only for the tab that shows them. */
  const claimRows = tab === 'pay'
    ? (await db.select().from(schema.apprenticeClaims)
        .where(eq(schema.apprenticeClaims.tenantId, user.tenantId))
        .orderBy(schema.apprenticeClaims.opensAt))
      .map(c => ({
        id: c.id, who: c.who, what: c.what, opensAt: c.opensAt, closesAt: c.closesAt,
        amountCents: c.amountCents, claimedAt: c.claimedAt, receivedAt: c.receivedAt,
      }))
    : [];

  const subbieRows: SubbieRow[] = await (async () => {
    if (tab !== 'subbies') return [];
    const [subs, checks] = await Promise.all([
      db.select().from(schema.subcontractors)
        .where(eq(schema.subcontractors.tenantId, user.tenantId))
        .orderBy(schema.subcontractors.business),
      db.select().from(schema.subbieChecks)
        .where(eq(schema.subbieChecks.tenantId, user.tenantId)),
    ]);
    return subs.map(s => ({
      id: s.id, business: s.business, contact: s.contact, mobile: s.mobile, status: s.status,
      checks: checks.filter(c => c.subbieId === s.id)
        .map(c => ({ kind: c.kind, expiresAt: c.expiresAt, state: c.state })),
    }));
  })();
  const people: (PersonRow & { scored: boolean; hasPath: boolean; pathComplete: boolean; signedOff: boolean })[] = [];
  for (const r of visible) {
    const own = criteria.filter(c => c.roleId === r.id && c.active);
    const scored = isScored(r.level, own.length, r.isTeam);
    const assignment = assignments.find(a => a.roleId === r.id);
    const name = r.holder?.name ?? r.pencilled ?? null;

    let blocking: string[] = [];
    if (period && scored) {
      const { rows } = await getScorecard(r.id, period.id);
      blocking = rows.filter(x => x.pillar === 'compliance' && x.answer === 'N').map(x => x.text);
    }

    /*
      An expired ticket fails Clear to Work by exactly the same path an overdue module does.

      Before this, the gate could only be failed by training — so a business could pass it with an
      expired forklift licence sitting in a drawer, which is the precise situation the gate exists
      to catch. Merged into `blocking` rather than reported separately, because one gate that means
      two slightly different things in two places is not a hard gate.
    */
    const theirs = obligationRows.filter(o =>
      o.roleId === r.id
      || (assignment?.userId && o.userId === assignment.userId)
      || (assignment?.staffId && o.staffId === assignment.staffId));
    blocking = [...blocking, ...blockingReasons(theirs.map(o => ({ what: o.what, expiresAt: o.expiresAt, who: name ?? r.title })), now)];

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

  /*
    Shaped for display once, here, rather than inside the markup.

    Leave that finished last month is history, not availability — it is dropped rather than shown
    greyed out, because a list that keeps everything is a list nobody scrolls to the bottom of.
    Documents keep everything, including the expired ones: an expired ticket is the single most
    important row on that list.
  */
  const leave = leaveRows
    .filter(l => upcoming(l, now))
    .map(l => ({ ...l, who: nameOf(l.staffId, l.userId) }))
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  const documents = obligationRows
    .map(o => ({
      ...o,
      who: o.roleId
        ? `The role: ${visible.find(r => r.id === o.roleId)?.title ?? 'a role'}`
        : nameOf(o.staffId, o.userId),
    }))
    // Worst first: expired, then nothing recorded, then expiring, then the ones that are fine.
    .sort((a, b) => ORDER[stateOf(a, now)] - ORDER[stateOf(b, now)]);

  const vacancies = people.filter(p => p.placement === 'vacant');

  /*
    Reviews & conduct, and Pay & exits — SPEC People.dc.html, 23 September. Loaded only for the tab
    that is open: three months of scorecards per person is the heaviest read on this page, and the
    other tabs never show it. Everything here is read from what SPEC already holds; see lib/hr.
  */
  const held = people.filter(p => p.placement !== 'vacant' && p.name);
  const reviews: ReviewPerson[] = [];
  const trainingRows: TrainingRow[] = [];
  if (tab === 'conduct') {
    const months = lastThree(await db.select().from(schema.periods).where(eq(schema.periods.tenantId, user.tenantId)));
    for (const p of held.filter(x => x.scored)) {
      const scores = [];
      for (const m of months) {
        const { score } = await getScorecard(p.roleId, m.id);
        scores.push({ period: m.period, score: score.overall, status: m.status });
      }
      reviews.push({ roleId: p.roleId, name: p.name!, roleTitle: p.roleTitle, months: scores });
    }
    for (const p of held) {
      const assignment = assignments.find(a => a.roleId === p.roleId);
      const path = curriculum.filter(x => x.roleId === p.roleId).sort((a, b) => a.sortOrder - b.sortOrder);
      if (!path.length) continue;
      const lines = path.map(c => {
        const record = records.find(x => x.userId === assignment?.userId && x.moduleId === c.moduleId);
        const due = dueDateFor(assignment?.fromDate ?? null, c.dueDays);
        const complete = (record?.progress ?? 0) >= 100;
        return {
          module: modules.find(m => m.id === c.moduleId)?.title ?? 'A module',
          state: trainingStateOf(record?.progress ?? null, dueState(due, complete, now) === 'overdue'),
          due,
        };
      });
      trainingRows.push({ key: p.roleId, name: p.name!, roleTitle: p.roleTitle, ...trainingSummary(lines) });
    }
  }

  /* The file actually held on a person — contracts and conduct processes, and the last pay run. */
  const personRecords = (tab === 'conduct' || tab === 'pay')
    ? await db.select().from(schema.peopleRecords).where(eq(schema.peopleRecords.tenantId, user.tenantId))
    : [];
  const payRunRows = tab === 'pay'
    ? await db.select().from(schema.payRuns).where(eq(schema.payRuns.tenantId, user.tenantId))
    : [];

  const contracts: ContractRow[] = [];
  const exits: ExitRow[] = [];
  let accountingConnected = false;
  if (tab === 'pay') {
    for (const p of held) {
      const role = visible.find(r => r.id === p.roleId);
      const boss = role?.reportsToRoleId ? visible.find(r => r.id === role.reportsToRoleId)?.title ?? null : null;
      contracts.push({
        roleId: p.roleId, roleTitle: p.roleTitle, businessName: tenant.name, reportsTo: boss, person: p.name,
        startDate: assignments.find(a => a.roleId === p.roleId)?.fromDate?.slice(0, 10) ?? null,
        kpis: criteria.filter(c => c.roleId === p.roleId && c.active && c.kpi).map(c => ({ pillar: c.pillar as Pillar, text: c.text })),
      });
    }
    // Every placement on the visible roles, open and closed — the chart's own history of who left.
    const history = roleIds.length
      ? await db.select().from(schema.roleAssignments).where(inArray(schema.roleAssignments.roleId, roleIds))
      : [];
    for (const e of exitsFrom(history)) {
      exits.push({
        key: `${e.roleId}:${e.userId ?? e.staffId}`,
        name: nameOf(e.staffId, e.userId),
        roleTitle: visible.find(r => r.id === e.roleId)?.title ?? 'A role',
        left: e.left.slice(0, 10),
      });
    }
    const connections = await db.select().from(schema.systemConnections)
      .where(and(
        eq(schema.systemConnections.tenantId, user.tenantId),
        eq(schema.systemConnections.category, 'financials'),
        // The business's connections only — a person's own mailbox is never on a business list.
        isNull(schema.systemConnections.personalFor),
      ));
    accountingConnected = connections.some(c => c.status === 'live');
  }
  const candidates = await db.select().from(schema.candidates)
    .where(eq(schema.candidates.tenantId, user.tenantId));

  return (
    <Shell
      title="People"
      kicker="People · one stop shop"
      headline={hiring ? 'Recruit against the scorecard they will hold' : 'The HR system for people businesses'}
      subtitle={hiring ? 'The roles you need filled, and who is in front of you.' : 'Who is where, who is clear to work, and what each of them is measured on.'}
    >
      <Refused reason={cannot} />
      {/*
        The two lines the design carries above this page and the product did not.

        Found on 16 September by the deep coverage check, which had them as "2 not found" and then
        printed 100% underneath — 470 of 472 rounds up. The claim that the product says what the
        designs say was very nearly true and was being reported as exactly true.

        Both say what this page IS, which is the part a leader has to believe before the tabs below
        mean anything: not a list of staff, the one place the whole of people is run from.
      */}
      <p className="label-caps mb-2">People · one stop shop</p>
      <section className="card mb-6">
        <h2 className="font-serif text-xl text-ink">Your people agent runs this, end to end</h2>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-ink-light">
          A vacancy in the org chart becomes an ad, a shortlist, an interview scorecard against the
          four pillars, an offer, an onboarding plan and a training path — without you opening another
          system. For a people business, this is the system.
        </p>
      </section>

      {/* Switch when ready — payroll where pay is run, HR here. Only shown when it applies. */}
      <div className="mb-6 grid gap-3">
        {mode === 'pay' && <SwitchCards areas={['payroll']} back="/people?mode=pay" />}
        <SwitchCards areas={['people']} back="/people" />
      </div>

      <div className="flex flex-wrap gap-2">
        {HR_TABS.map(t => (
          <Link
            key={t.tab}
            href={hrefOf(t.tab)}
            className={`rounded-full px-4 py-2 text-sm ${tab === t.tab ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <OwnSystemLine line={own.line} connected={own.connected} className="mt-6" />

      {tab === 'staff' ? (
        <StaffListTab user={user} q={typeof sp.q === 'string' ? sp.q.slice(0, 80) : ''} />
      ) : tab === 'setup' ? (
        <SetupTab
          people={setupPeople} roles={visible.map(r => ({ id: r.id, title: r.title }))}
          today={todayIso} currency={setupCurrency} canPay={scope.canAdminister} subscribed={setupSubscribed}
          business={tenant.name} appUrl={process.env.APP_URL ?? ''}
        />
      ) : tab === 'leavers' ? (
        <LeaversTab
          leavers={leaverRows.map(l => ({
            staffId: l.id, name: l.name, lastDay: l.lastDay,
            done: l.done.split(',').filter(Boolean),
          }))}
          /* Staff rows, because a leaver IS a staff record — the chart's rows carry a role id. */
          people={setupPeople.map(p => ({ id: p.id, name: p.name }))}
          manage={manage} today={todayIso}
        />
      ) : tab === 'subbies' ? (
        <SubbiesTab rows={subbieRows} manage={manage} today={todayIso} business={tenant.name} />
      ) : tab === 'conduct' ? (
        <ConductTab
          reviews={reviews}
          training={trainingRows}
          conduct={personRecords.filter(r => r.kind === 'conduct')}
          people={held.map(p => p.name).filter((n): n is string => Boolean(n))}
          manage={manage}
        />
      ) : tab === 'pay' ? (
        <PayTab
          signed={personRecords.filter(r => r.kind === 'contract')}
          roles={visible.map(r => ({ id: r.id, title: r.title }))}
          people={held.map(p => p.name).filter((n): n is string => Boolean(n))}
          run={[...payRunRows].sort((a, b) => b.fromDate.localeCompare(a.fromDate))[0] ?? null}
          manage={manage}
          contracts={contracts}
          payWeek={lastPayWeek(now)}
          inRoles={held.length}
          accountingConnected={accountingConnected}
          exits={exits}
          claims={claimRows}
          today={todayIso}
        />
      ) : !hiring ? (
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

          {/*
            Who is away, and what that leaves uncovered.

            Deliberately not a leave management system — SPEC holds no balances and calculates no
            entitlements, because the business already has something that does. What it holds is the
            one thing the four questions need and payroll will not tell them: a supervisor away for
            a fortnight with nobody signed off to cover is a gap in the chart, and the chart is what
            SPEC reasons about.
          */}
          <section className="card mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Leave and availability</h2>
              <span className="text-sm text-ink-light">{leaveLine(leave, now)}</span>
            </div>
            {leave.length > 0 && (
              <div className="mt-4 grid gap-3">
                {leave.map(l => (
                  <div key={l.id} className="card-inset">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="grid gap-0.5">
                        <span className="font-serif text-base text-ink">{l.who}</span>
                        <span className="text-xs text-ink-light">
                          {leaveKindLabel(l.kind)} · {l.fromDate} to {l.toDate}
                        </span>
                      </span>
                      {l.state === 'requested' && manage ? (
                        <span className="flex gap-2">
                          {/* Two forms rather than one with two submit values: a decline is a
                              separate decision, not a variant of approving. */}
                          <form action={decideLeave}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="state" value="approved" />
                            <SubmitButton className="btn-secondary" pending="Saving…">Approve</SubmitButton>
                          </form>
                          <form action={decideLeave}>
                            <input type="hidden" name="id" value={l.id} />
                            <input type="hidden" name="state" value="declined" />
                            <SubmitButton className="btn-ghost" pending="Saving…">Decline</SubmitButton>
                          </form>
                        </span>
                      ) : (
                        <span className="text-xs text-ink-light">
                          {l.state === 'approved' ? `Approved${l.decidedBy ? ` by ${l.decidedBy}` : ''}` :
                            l.state === 'declined' ? 'Declined' : 'Waiting on a decision'}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-ink-light">{impactOf(l)}</p>
                  </div>
                ))}
              </div>
            )}
            {manage && (
              <form action={bookLeave} className="mt-4 grid gap-2 sm:grid-cols-[1.2fr_auto_auto_auto_auto]">
                <select className="input" name="person" aria-label="Who" defaultValue="">
                  <option value="">Who is away?</option>
                  {staffRows.map(s => <option key={s.id} value={`staff:${s.id}`}>{s.name}</option>)}
                  {seatRows.filter(u => !staffRows.some(s => s.userId === u.id))
                    .map(u => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                </select>
                <select className="input" name="kind" aria-label="What kind" defaultValue="annual">
                  {LEAVE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <input className="input" type="date" name="fromDate" required aria-label="From" />
                <input className="input" type="date" name="toDate" required aria-label="To" />
                <SubmitButton className="btn-secondary shrink-0" pending="Booking…">Book it</SubmitButton>
              </form>
            )}
            <p className="mt-3 text-xs text-ink-light">
              SPEC holds no balances and works out no entitlements — payroll does that. This is only
              who is not here, and whether the job is covered.
            </p>
          </section>

          {/*
            The evidence under the hard gate. Anything expired appears in Clear to Work above by the
            same path an overdue module does — see lib/obligations for why an EXPIRING ticket is
            loud but does not block.
          */}
          <section className="card mt-6">
            <h2 className="font-serif text-xl text-ink">Documents and obligations</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-light">
              Held against the person and the role. Anything expiring feeds the Clear to Work gate.
            </p>
            {documents.length > 0 && (
              <div className="mt-4 grid gap-3">
                {documents.map(d => (
                  <div key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/10 pb-3 last:border-0 last:pb-0">
                    <span className="grid gap-0.5">
                      <span className="text-sm text-ink">{d.what}</span>
                      <span className="text-xs text-ink-light">
                        {d.who}
                        {d.evidence ? ` · ${d.evidence}` : ''}
                      </span>
                    </span>
                    <span className="grid justify-items-end gap-0.5">
                      <span
                        className="pill"
                        style={{
                          background: `color-mix(in srgb, ${DOC_COLOUR[stateOf(d, now)]} 14%, transparent)`,
                          color: DOC_COLOUR[stateOf(d, now)],
                        }}
                      >
                        {STATE_LABEL[stateOf(d, now)]}
                      </span>
                      <span className="text-xs text-ink-light">{stateNote(d, now)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {manage && (
              <form action={addObligation} className="mt-4 grid gap-2 sm:grid-cols-[1.3fr_1fr_auto_auto]">
                <input className="input" name="what" required maxLength={120} placeholder="White card" aria-label="What it is" />
                <select className="input" name="holder" aria-label="Whose it is" defaultValue="">
                  <option value="">Whose is it?</option>
                  {staffRows.map(s => <option key={s.id} value={`staff:${s.id}`}>{s.name}</option>)}
                  {seatRows.filter(u => !staffRows.some(s => s.userId === u.id))
                    .map(u => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                  {visible.map(r => <option key={r.id} value={`role:${r.id}`}>The role: {r.title}</option>)}
                </select>
                <input className="input" type="date" name="expiresAt" aria-label="Expires" />
                <SubmitButton className="btn-secondary shrink-0" pending="Adding…">Add it</SubmitButton>
              </form>
            )}
            <p className="mt-3 text-xs text-ink-light">
              Leave the date empty for anything that does not expire — a signed contract, an
              induction that stands. SPEC never invents an expiry.
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
                      {/*
                        The ad, written from the role's own numbers.

                        This screen claims that SPEC answers "cannot attract great people" by drafting
                        the ad from the eight numbers the role is measured on. It said so and did not
                        do it, which is the worst combination available. An applicant now reads the
                        same numbers they will be scored against in month one, before they apply —
                        and anybody who does not want to be measured on them screens themselves out,
                        which is the cheapest screening there is.
                      */}
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-rust-700 hover:underline">
                          Drafted from the role&rsquo;s KPIs
                        </summary>
                        <pre className="card-inset mt-2 whitespace-pre-wrap font-body text-xs leading-5 text-ink">
                          {draftAd({
                            roleTitle: v.roleTitle,
                            businessName: tenant.name,
                            reportsTo: visible.find(r => r.id === v.roleId)?.reportsToRoleId
                              ? visible.find(r => r.id === visible.find(x => x.id === v.roleId)?.reportsToRoleId)?.title ?? null
                              : null,
                            kpis: own.filter(c => c.kpi)
                              .map(c => ({ pillar: c.pillar as Pillar, text: c.text, target: c.target })),
                          })}
                        </pre>
                        <p className="mt-2 text-xs text-ink-light">
                          A draft. Pay, licences and the award belong to your business and your region —
                          SPEC does not invent them.
                        </p>
                      </details>

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
      {/*
        The way out to an HR system somebody already pays for.

        The design offers this and the page did not, which left the impression that SPEC wants to be
        a second place to keep staff records. It does not: a business already running an HR system
        can connect it and choose it on Coverage, and a business without one should be told plainly
        that this IS the system. Named by category, never by product — CLAUDE.md's never list, held
        by tests/coverage.test.ts.
      */}
      <section className="mt-12 rounded-2xl bg-surface p-6">
        <h2 className="font-serif text-xl text-ink">Already have an HR system?</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Connect your HR system and choose it on Coverage — up to you. If you do not have one, this is
          it — no second system to buy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={connectHref('payroll')} className="btn-secondary inline-block">
            Connect your HR system
          </Link>
          <Link href="/coverage#hr" className="btn-secondary inline-block">
            Open Coverage
          </Link>
        </div>
      </section>

      <Problems screen="people" />

    </Shell>
  );
}
