import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell, PILLAR_META } from '@/components/ui';
import { planStateFor } from '@/lib/plan';
import { seatLabel, moneyLabel } from '@/lib/pricing';
import { requestCurrency } from '@/lib/request-currency';
import { pencilled, roleChangeFor, type AssignmentRow, type RoleRow, type StaffRow } from '@/lib/staff';
import { getScope } from '@/lib/scope';
import { seatKindFor } from '@/lib/chart-seats';
import templates from '../../../../seed/criteria_templates.json';
import { addRole, removeRole } from '../roles/actions';
import { nameRole, unplaceStaff, resolveRoleChange, invite, addEveryone } from '../people/actions';
import { readyForMonth, PASTE_LABEL, PASTE_HELP, addedSays } from '@/lib/ready-for-october';
import { SeatLink } from '@/components/seat-link';
import { seatUrl } from '@/lib/seat';
import { currentOrigin } from '@/lib/origin';
import { nextStepAfter } from '@/lib/journey';
import { NextStepCallout } from '@/components/next-step';

export const dynamic = 'force-dynamic';

const ERROR: Record<string, string> = {
  duplicate_head: 'That stream already has a head. A stream has one owner — that is what makes "who owns the numbers" answerable. Add a supervisor or team member under them instead.',
  duplicate_title: 'There is already a role with that name in this stream. Give this one a name that tells them apart — "Supervisor, north crew" rather than a second "Supervisor".',
  not_leader: 'Only somebody on a leadership seat can invite people onto the chart.',
};

type TemplateRole = { template_id: string; title: string; stream: string; level: string };

const STREAMS = [
  { id: 'commercial', name: 'Commercial', owns: 'The numbers are right and on time' },
  { id: 'operations', name: 'Operations', owns: 'The work gets done safely and profitably' },
  { id: 'growth', name: 'Growth', owns: 'Keep the clients we have, win more' },
] as const;

/**
 * The business, on one page.
 *
 * This replaces three screens — draw the roles, look at the chart, assign the people — that were one
 * thought in the owner's head all along: "this is my business, and this is who runs each part of it."
 * Splitting it made a person navigate a product instead of describing their company.
 *
 * The order on the page is the order of the decision: what does the business need, who does it, and
 * only then, separately and deliberately, who gets told about it.
 */
export default async function Business({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const currency = await requestCurrency();
  const error = ERROR[String(sp.error ?? '')];

  const roleRows = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, user.tenantId), eq(schema.roles.active, true)))
    .orderBy(schema.roles.sortOrder);
  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  /*
    Scoped through this business's own roles rather than read whole and filtered afterwards.

    The filter that used to follow was correct, but "read everything, then keep ours" is the exact
    shape that leaked in boards-data — one clause written slightly wrong and another company's rows
    are in the result. It also grows with every customer SPEC ever signs.
  */
  const ourRoleIds = roleRows.map(r => r.id);
  const allAssignments = ourRoleIds.length
    ? await db.select().from(schema.roleAssignments).where(inArray(schema.roleAssignments.roleId, ourRoleIds))
    : [];
  const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));

  const roleIds = new Set(roleRows.map(r => r.id));
  const roles = roleRows as unknown as RoleRow[];
  const staff = staffRows as unknown as StaffRow[];
  const assignments = allAssignments.filter(a => roleIds.has(a.roleId)) as unknown as AssignmentRow[];

  const plan = await planStateFor(user.tenantId, currency);
  const gm = roleRows.find(r => r.level === 'gm');
  const waiting = pencilled(assignments, staff);
  /*
    Only somebody on a leadership seat may invite at all, and the same rule is what lets them
    choose which seat the person they invite lands on — see `mayInvite` in lib/scope.
  */
  const scope = await getScope(user);
  const leadsSet = new Set(roleRows.map(r => r.reportsToRoleId).filter((x): x is string => Boolean(x)));

  /*
    People who have been invited and have not yet come in, with the link that lets them.

    Read here rather than handed back from the action, because a seat token in a redirect ends up in
    the browser's address bar and history. This shows it only to somebody who could have invited
    them in the first place, on a page they signed in to reach — and it keeps working, so the link
    can be sent again a week later without inviting anybody twice.
  */
  const pending = (await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    token: schema.users.seatToken,
  }).from(schema.users).where(and(
    eq(schema.users.tenantId, user.tenantId),
    isNotNull(schema.users.seatToken),
    isNull(schema.users.acceptedAt),
  ))).filter(p => p.token);

  /*
    The address this page is being read on, so a copied link lands where the business already is.

    It used to be APP_URL, one fixed address. SPEC answers on more than one, and a browser keeps its
    sign-in per address — so a link copied off www handed somebody a seat on app, signed in nowhere,
    while the rest of their business was on www. Same fault that sent the first real payment back to
    the wrong business. See lib/origin.
  */
  const appUrl = await currentOrigin();
  // Whether this deployment can actually send email. Never promise a send that will not happen.
  const emailOn = Boolean(process.env.RESEND_API_KEY?.trim());

  const change = sp.change && sp.to
    ? roleChangeFor(String(sp.change), String(sp.to), roles, assignments, staff)
    : null;

  const have = new Set(roleRows.map(r => `${r.stream}:${r.level}`));
  const missingHeads = (templates.roles as TemplateRole[])
    .filter(t => t.level === 'manager' && !have.has(`${t.stream}:${t.level}`));

  const holderOf = (roleId: string) => {
    const a = assignments.find(x => x.roleId === roleId && !x.toDate);
    if (!a) return null;
    const person = staff.find(s => s.id === a.staffId);
    const account = a.userId ? users.find(u => u.id === a.userId) : null;
    return { name: person?.name ?? account?.name ?? 'Someone', email: account?.email ?? null, hasAccount: !!a.userId };
  };

  const named = roleRows.filter(r => holderOf(r.id)).length;

  /*
    ── Ready for the start of October ─────────────────────────────────────────────────────────────

    Kris, 26 September: *"add everyone into the system and then make sure they all have a place on
    the org chart - then set everyones kpis and be ready for the start of october."*

    A month that starts with half the crew off the chart cannot be scored honestly afterwards — the
    numbers would be about whoever happened to be set up in time. So this NAMES what is left rather
    than giving a percentage: see lib/ready-for-october for why `startHere` was not enough.

    One query for every criterion, counted in memory. Not one per role.
  */
  const criteriaRows = roleIds.size
    ? await db.select({ roleId: schema.criteria.roleId, active: schema.criteria.active })
        .from(schema.criteria).where(inArray(schema.criteria.roleId, [...roleIds]))
    : [];
  const kpiCount = new Map<string, number>();
  for (const c of criteriaRows) {
    if (c.active) kpiCount.set(c.roleId, (kpiCount.get(c.roleId) ?? 0) + 1);
  }
  const placed = new Set(assignments.filter(a => !a.toDate).map(a => a.staffId));
  const readiness = readyForMonth(
    'October',
    staff.map(p => ({ id: p.id, name: p.name, roleId: placed.has(p.id) ? 'on' : null })),
    roleRows
      .filter(r => r.level !== 'staff')
      .map(r => ({ id: r.id, title: r.title, kpis: kpiCount.get(r.id) ?? 0, vacant: !holderOf(r.id) })),
  );
  const pasted = { added: Number(sp.added ?? NaN), already: Number(sp.already ?? NaN) };
  const nextStep = await nextStepAfter(user.tenantId, '/setup/business');

  function RoleRowItem({ r }: { r: typeof roleRows[number] }) {
    const holder = holderOf(r.id);
    return (
      <li className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-[13rem] flex-1">
          <div className="font-medium text-ink">{r.title}</div>
          <div className="text-xs text-ink-light">
            {r.level === 'gm' ? 'Top of the chart' : `Reports to ${roleRows.find(x => x.id === r.reportsToRoleId)?.title ?? '—'}`}
            {r.level === 'staff' && ' · sees only their own scorecard'}
          </div>
        </div>

        {holder ? (
          <div className="flex flex-1 items-center gap-3">
            <span className="text-ink">{holder.name}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${holder.hasAccount ? 'bg-sage-200 text-sage-900' : 'bg-cream text-ink-light'}`}>
              {holder.hasAccount ? 'Has an account' : 'Pencilled in'}
            </span>
            <form action={unplaceStaff} className="ml-auto">
              <input type="hidden" name="roleId" value={r.id} />
              <button className="text-xs text-ink-light underline hover:text-rust">Remove</button>
            </form>
          </div>
        ) : (
          // A name written straight onto the chart. One field, one thought.
          <form action={nameRole} className="flex flex-1 gap-2">
            <input type="hidden" name="roleId" value={r.id} />
            <input
              name="name" placeholder="Who does this?" autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-ink/20 px-3 py-2 text-sm"
            />
            <button className="btn-secondary shrink-0 text-sm">Add</button>
          </form>
        )}

        {r.level !== 'gm' && (
          <form action={removeRole}>
            <input type="hidden" name="roleId" value={r.id} />
            <button className="text-xs text-ink-light/60 hover:text-rust-700">delete role</button>
          </form>
        )}
      </li>
    );
  }

  return (
    <Shell
      title="Your business on one page"
      subtitle="Add the roles the business needs, then write in who does each one. Nothing is emailed and nothing is charged until you send invites, which is the last section."
    >
      {error && <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm">{error}</div>}

      {/*
        ── Add everybody at once ─────────────────────────────────────────────────────────────────

        The form below this one takes ONE name per role, which is right for filling a gap and wrong
        for a business going live: thirty-five people meant thirty-five round trips. That is the
        friction that gets a rollout postponed rather than reported as a problem.

        Nothing is emailed and nothing is charged. A name is just a name until somebody is
        deliberately invited, which is what makes it safe to paste the whole company in before
        anybody has decided who gets a login.
      */}
      <section className="card mb-6" data-add-everyone>
        <h2 className="font-serif text-lg text-ink">{PASTE_LABEL}</h2>
        <p className="mt-1 max-w-[68ch] text-sm text-ink-light">{PASTE_HELP}</p>
        <form action={addEveryone} className="mt-3">
          <textarea
            name="names"
            rows={4}
            aria-label={PASTE_LABEL}
            placeholder={'Kris Harold\nDan Reilly\nMel Tran'}
            className="w-full rounded-lg border border-ink/20 p-3 font-mono text-sm"
          />
          <div className="mt-2">
            <SubmitButton pending="Adding&hellip;">Add them all</SubmitButton>
          </div>
        </form>
        {Number.isFinite(pasted.added) && (
          <p className="mt-3 text-sm text-ink" data-added-says>{addedSays(pasted.added, pasted.already || 0)}</p>
        )}
      </section>

      {/*
        What is still between this business and a month it can score. Named, not counted — see the
        note where `readiness` is worked out.
      */}
      <section className={`mb-6 rounded-lg p-4 ${readiness.ready ? 'bg-sage-200 text-sage-900' : 'bg-cream text-ink'}`} data-ready-for-october>
        <h2 className="font-serif text-lg">{readiness.ready ? 'Ready for October' : 'Not ready for October yet'}</h2>
        <p className="mt-1 max-w-[68ch] text-sm">{readiness.says}</p>
        {readiness.offChart.length > 0 && (
          <div className="mt-3">
            <h3 className="label-caps">Nobody has put these people on the chart</h3>
            <p className="mt-1 text-sm" data-off-chart>{readiness.offChart.map(p => p.name).join(', ')}</p>
          </div>
        )}
        {readiness.short.length > 0 && (
          <div className="mt-3">
            <h3 className="label-caps">These roles need their KPIs</h3>
            <ul className="mt-1 grid gap-1 text-sm" data-short-kpis>
              {readiness.short.map(r => (
                <li key={r.id}>
                  <Link href={`/setup/kpis?role=${r.id}`} className="underline hover:text-rust">{r.title}</Link>
                  {' '}&mdash; {r.kpis} of {r.need}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/*
        The seat is real and the email did not go.

        Both halves matter. The account, the link and the charge all happened, so saying "that
        failed" would be wrong — but so is "invited", which is what this used to say however the
        send went. The link is in the list further down, which is the thing that actually gets them
        in; email was never the product.
      */}
      {sp.notsent && (
        <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm">
          <b>The seat is ready, but the email did not send.</b> {String(sp.notsent)} has their seat and
          their link — we just could not deliver it. Scroll to <i>Anybody invited who has not come in
          yet</i> below, copy their link, and send it however you normally would.
        </div>
      )}

      {/* Same title twice is legitimate below manager level, but the owner has to be able to tell them apart. */}
      {roleRows.some((r, i) => roleRows.findIndex(x => x.title === r.title && x.stream === r.stream) !== i) && (
        <div className="mb-4 rounded-lg border-l-4 border-rust-400 bg-surface p-4 text-sm">
          Two roles here share a name, so neither you nor anyone you invite can tell which is which.
          Rename one, or delete it if it was added twice by accident.
        </div>
      )}

      {change && (
        <section className="mb-6 rounded-lg border-l-4 border-rust bg-surface p-5">
          <div className="label-caps">One question first</div>
          <p className="mt-1 text-ink">
            <b>{change.personName}</b> already holds <b>{change.fromRoleTitle}</b>. Putting them into{' '}
            <b>{change.toRoleTitle}</b> could mean two different things.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(['move', 'merge'] as const).map(d => (
              <form key={d} action={resolveRoleChange} className="rounded-lg border border-ink/10 p-4">
                <input type="hidden" name="staffId" value={change.staffId} />
                <input type="hidden" name="fromRoleId" value={change.fromRoleId} />
                <input type="hidden" name="toRoleId" value={change.toRoleId} />
                <input type="hidden" name="decision" value={d} />
                <div className="font-medium text-ink">{d === 'move' ? "They've moved" : "They're doing both"}</div>
                <p className="mt-1 text-sm text-ink-light">
                  {d === 'move'
                    ? `${change.fromRoleTitle} becomes open again, keeping its KPIs for whoever comes next.`
                    : `They keep ${change.fromRoleTitle} and take on ${change.toRoleTitle} as well.`}
                </p>
                <button className="btn-secondary mt-3 w-full">{d === 'move' ? 'Move them' : 'Merge the roles'}</button>
              </form>
            ))}
          </div>
          <p className="mt-3 text-sm"><a href="/setup/business" className="underline text-ink-light hover:text-rust">Neither — cancel</a></p>
        </section>
      )}

      {/* ---------- Leadership ---------- */}
      {gm && (
        <section className="rounded-lg border border-ink/10 bg-surface">
          <div className="border-b border-ink/10 p-4 label-caps">Leadership</div>
          <ul className="divide-y divide-ink/10"><RoleRowItem r={gm} /></ul>
        </section>
      )}

      {/* ---------- The three streams ---------- */}
      {STREAMS.map(stream => {
        const inStream = roleRows.filter(r => r.stream === stream.id && r.level !== 'gm');
        const proposal = missingHeads.find(t => t.stream === stream.id);
        return (
          <section key={stream.id} className="mt-6 rounded-lg border border-ink/10 bg-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/10 p-4">
              <div>
                <div className="label-caps">{stream.name}</div>
                <div className="text-sm text-ink-light">{stream.owns}</div>
              </div>
              {inStream.length > 0 && <span className="text-xs text-ink-light">{inStream.length} role{inStream.length === 1 ? '' : 's'}</span>}
            </div>

            {inStream.length > 0 && <ul className="divide-y divide-ink/10">{inStream.map(r => <RoleRowItem key={r.id} r={r} />)}</ul>}

            <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 bg-cream/40 p-4">
              {/*
                The keys matter. These two forms sit at the same position in the tree, so without
                them React reconciles them as ONE form and reuses the first <input> — whose `value`
                prop exists in one branch and not the other. That is a controlled input turning
                uncontrolled: React warns in the console, and whatever the person had typed in the
                box is left behind. Found by a journey watching for page errors after a role is
                deleted, which is exactly when this branch flips.
              */}
              {proposal ? (
                <form key="from-template" action={addRole} className="flex items-center gap-3">
                  <input type="hidden" name="template" value={proposal.template_id} />
                  <input type="hidden" name="reportsTo" value={gm?.id ?? ''} />
                  <button className="btn-primary text-sm">Add {proposal.title}</button>
                  <span className="text-xs text-ink-light">Comes with two KPIs per pillar, ready to tune.</span>
                </form>
              ) : (
                <form key="by-hand" action={addRole} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="stream" value={stream.id} />
                  <input name="title" placeholder={`Another ${stream.name.toLowerCase()} role`} autoComplete="off" className="rounded-lg border border-ink/20 px-3 py-2 text-sm" />
                  <select name="level" className="rounded-lg border border-ink/20 px-3 py-2 text-sm">
                    <option value="supervisor">Supervisor</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Team member</option>
                  </select>
                  <select name="reportsTo" className="rounded-lg border border-ink/20 px-3 py-2 text-sm">
                    {roleRows.filter(r => r.stream === stream.id || r.level === 'gm').map(r => (
                      <option key={r.id} value={r.id}>reports to {r.title}</option>
                    ))}
                  </select>
                  <button className="btn-secondary text-sm">Add</button>
                </form>
              )}
            </div>
          </section>
        );
      })}

      {/* ---------- What the four pillars will measure ---------- */}
      <section className="mt-6 rounded-lg border border-ink/10 bg-surface p-5">
        <div className="label-caps">What every role here will be measured on</div>
        {/* Nothing is scored during setup, so nothing here is coloured — colour is only ever the
            score. The letter is what identifies the pillar. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['safety', 'people', 'earnings', 'compliance'] as const).map(p => (
            <div key={p} className="rounded-lg border border-ink/10 p-3">
              <div className="label-caps">{PILLAR_META[p].letter} · {PILLAR_META[p].name}</div>
              <div className="mt-1 text-xs text-ink-light">Two numbers per role, which you tune next.</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Invites: last, deliberate, priced ---------- */}
      <details className="mt-6 rounded-lg border border-ink/10 bg-surface" open={waiting.length > 0 && named >= roleRows.length}>
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-ink hover:text-rust">
          Invite them in
          <span className="ml-2 font-normal text-ink-light">
            {waiting.length ? `— ${waiting.length} ${waiting.length === 1 ? 'person is' : 'people are'} waiting` : '— nobody is waiting on an invite'}
          </span>
        </summary>
        <div className="border-t border-ink/10 p-5">
          <p className="text-sm text-ink-light">
            {/*
              Says what actually happens on THIS deployment. The old wording promised an email
              unconditionally, and on a deployment with no email service that was simply untrue —
              the send was skipped, the screen said success, and nobody could work out why the
              person never arrived.
            */}
            An invite creates a login link{emailOn ? ', emails it to them,' : ' for you to send them,'} and starts that
            person&apos;s seat at {seatLabel(currency)} a month — {plan.seats === 0 ? 'and the first seat is free' : 'after the first, which is free'}.
            {plan.free
              ? ' You have not been charged anything yet.'
              : ` You are currently at ${moneyLabel(plan.currency, plan.monthlyCost)} a month: ${plan.seats} ${plan.seats === 1 ? 'person' : 'people'}, ${plan.billable} charged for.`}
          </p>
          {/*
            Anybody invited who has not come in yet, with their link.

            This is what stops an email service being a hard dependency for the one thing a business
            must be able to do — put its people in. The send is best effort; the link is the product.
          */}
          {pending.length > 0 && (
            <div className="mt-4 rounded-lg border border-ink/10 bg-surface-raised p-4">
              <p className="text-sm font-medium text-ink">
                {pending.length === 1 ? 'One person has been invited and has not come in yet' : `${pending.length} people have been invited and have not come in yet`}
              </p>
              <p className="mt-1 text-xs text-ink-light">
                We email each of them a link. If it has not arrived — junk mail, a typo, or email not
                switched on here — send it yourself. It is the same link either way.
              </p>
              {pending.map(p => (
                <SeatLink key={p.id} name={p.name} href={seatUrl(appUrl, p.token!)} />
              ))}
            </div>
          )}

          {waiting.length === 0 ? (
            <p className="mt-3 text-sm text-ink">Everyone on the chart already has an account.</p>
          ) : !scope.canInvite ? (
            <p className="mt-3 text-sm text-ink-light">
              Only somebody on a leadership seat can invite people onto the chart. Ask whoever leads
              here to send these.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ink/10">
              {waiting.map(w => {
                const role = roleRows.find(r => r.id === w.roleId);
                const defaultKind = role ? seatKindFor({ title: role.title, hasDirectReports: leadsSet.has(w.roleId) }) : 'team';
                return (
                  <li key={w.person.id} className="py-3">
                    <form action={invite} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="staffId" value={w.person.id} />
                      <div className="w-48">
                        <b className="text-ink">{w.person.name}</b>
                        <div className="text-xs text-ink-light">{role?.title}</div>
                      </div>
                      {/* The staff list may already have their email — never asked for twice. */}
                      <input name="email" type="email" required autoComplete="off" placeholder="Their work email"
                        defaultValue={staffRows.find(s => s.id === w.person.id)?.email ?? ''}
                        className="min-w-0 flex-1 rounded-lg border border-ink/20 px-3 py-2 text-sm" />
                      <label className="sr-only" htmlFor={`seatKind-${w.person.id}`}>Which seat</label>
                      <select
                        id={`seatKind-${w.person.id}`}
                        name="seatKind"
                        defaultValue={defaultKind}
                        className="shrink-0 rounded-lg border border-ink/20 px-2 py-2 text-sm"
                        title="Which seat they are joining on — billed differently. The chart already suggests one; change it if this one is not right."
                      >
                        <option value="leadership">Leadership seat</option>
                        <option value="team">Team seat</option>
                      </select>
                      <button className="btn-primary shrink-0 text-sm">Send invite</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>

      <NextStepCallout step={nextStep} />
    </Shell>
  );
}
