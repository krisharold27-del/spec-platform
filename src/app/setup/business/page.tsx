import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell, PILLAR_META } from '@/components/ui';
import { planStateFor, SEAT_PRICE_MONTHLY } from '@/lib/plan';
import { pencilled, roleChangeFor, type AssignmentRow, type RoleRow, type StaffRow } from '@/lib/staff';
import templates from '../../../../seed/criteria_templates.json';
import { addRole, removeRole } from '../roles/actions';
import { nameRole, unplaceStaff, resolveRoleChange, invite } from '../people/actions';

export const dynamic = 'force-dynamic';

const ERROR: Record<string, string> = {
  duplicate_head: 'That stream already has a head. A stream has one owner — that is what makes "who owns the numbers" answerable. Add a supervisor or team member under them instead.',
  duplicate_title: 'There is already a role with that name in this stream. Give this one a name that tells them apart — "Supervisor, north crew" rather than a second "Supervisor".',
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
  const error = ERROR[String(sp.error ?? '')];

  const roleRows = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, user.tenantId), eq(schema.roles.active, true)))
    .orderBy(schema.roles.sortOrder);
  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  const allAssignments = await db.select().from(schema.roleAssignments);
  const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));

  const roleIds = new Set(roleRows.map(r => r.id));
  const roles = roleRows as unknown as RoleRow[];
  const staff = staffRows as unknown as StaffRow[];
  const assignments = allAssignments.filter(a => roleIds.has(a.roleId)) as unknown as AssignmentRow[];

  const plan = await planStateFor(user.tenantId);
  const gm = roleRows.find(r => r.level === 'gm');
  const waiting = pencilled(assignments, staff);

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
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${holder.hasAccount ? 'bg-emerald-100 text-emerald-900' : 'bg-cream text-ink-light'}`}>
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
            <button className="text-xs text-ink-light/60 hover:text-red-700">delete role</button>
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
      {error && <div className="mb-4 rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm">{error}</div>}

      {/* Same title twice is legitimate below manager level, but the owner has to be able to tell them apart. */}
      {roleRows.some((r, i) => roleRows.findIndex(x => x.title === r.title && x.stream === r.stream) !== i) && (
        <div className="mb-4 rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm">
          Two roles here share a name, so neither you nor anyone you invite can tell which is which.
          Rename one, or delete it if it was added twice by accident.
        </div>
      )}

      {change && (
        <section className="mb-6 rounded-lg border-l-4 border-rust bg-white p-5">
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
        <section className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 p-4 label-caps">Leadership</div>
          <ul className="divide-y divide-ink/10"><RoleRowItem r={gm} /></ul>
        </section>
      )}

      {/* ---------- The three streams ---------- */}
      {STREAMS.map(stream => {
        const inStream = roleRows.filter(r => r.stream === stream.id && r.level !== 'gm');
        const proposal = missingHeads.find(t => t.stream === stream.id);
        return (
          <section key={stream.id} className="mt-6 rounded-lg border border-ink/10 bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/10 p-4">
              <div>
                <div className="label-caps">{stream.name}</div>
                <div className="text-sm text-ink-light">{stream.owns}</div>
              </div>
              {inStream.length > 0 && <span className="text-xs text-ink-light">{inStream.length} role{inStream.length === 1 ? '' : 's'}</span>}
            </div>

            {inStream.length > 0 && <ul className="divide-y divide-ink/10">{inStream.map(r => <RoleRowItem key={r.id} r={r} />)}</ul>}

            <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 bg-cream/40 p-4">
              {proposal ? (
                <form action={addRole} className="flex items-center gap-3">
                  <input type="hidden" name="template" value={proposal.template_id} />
                  <input type="hidden" name="reportsTo" value={gm?.id ?? ''} />
                  <button className="btn-primary text-sm">Add {proposal.title}</button>
                  <span className="text-xs text-ink-light">Comes with two KPIs per pillar, ready to tune.</span>
                </form>
              ) : (
                <form action={addRole} className="flex flex-wrap items-center gap-2">
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
      <section className="mt-6 rounded-lg border border-ink/10 bg-white p-5">
        <div className="label-caps">What every role here will be measured on</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(['safety', 'people', 'earnings', 'compliance'] as const).map(p => (
            <div key={p} className="rounded-lg border border-ink/10 p-3" style={{ borderLeftColor: PILLAR_META[p].colour, borderLeftWidth: 5 }}>
              <div className="label-caps">{PILLAR_META[p].name}</div>
              <div className="mt-1 text-xs text-ink-light">Two numbers per role, which you tune next.</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Invites: last, deliberate, priced ---------- */}
      <details className="mt-6 rounded-lg border border-ink/10 bg-white" open={waiting.length > 0 && named >= roleRows.length}>
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-ink hover:text-rust">
          Invite them in
          <span className="ml-2 font-normal text-ink-light">
            {waiting.length ? `— ${waiting.length} ${waiting.length === 1 ? 'person is' : 'people are'} waiting` : '— nobody is waiting on an invite'}
          </span>
        </summary>
        <div className="border-t border-ink/10 p-5">
          <p className="text-sm text-ink-light">
            An invite emails a login link and starts that person&apos;s seat at ${SEAT_PRICE_MONTHLY} a month.
            {plan.free ? ' You have not been charged anything yet.' : ` You are currently at $${plan.monthlyCost} a month for ${plan.seats} ${plan.seats === 1 ? 'person' : 'people'}.`}
          </p>
          {waiting.length === 0 ? (
            <p className="mt-3 text-sm text-ink">Everyone on the chart already has an account.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink/10">
              {waiting.map(w => (
                <li key={w.person.id} className="py-3">
                  <form action={invite} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="staffId" value={w.person.id} />
                    <div className="w-48">
                      <b className="text-ink">{w.person.name}</b>
                      <div className="text-xs text-ink-light">{roleRows.find(r => r.id === w.roleId)?.title}</div>
                    </div>
                    <input name="email" type="email" required autoComplete="off" placeholder="Their work email"
                      className="min-w-0 flex-1 rounded-lg border border-ink/20 px-3 py-2 text-sm" />
                    <button className="btn-primary shrink-0 text-sm">Send invite</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <p className="mt-6 text-sm"><a href="/journey" className="underline">Back to the journey</a></p>
    </Shell>
  );
}
