import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/ui';
import { planStateFor, SEAT_PRICE_MONTHLY } from '@/lib/plan';
import { placementOf, pencilled, structureLooksReady, roleChangeFor, type AssignmentRow, type RoleRow, type StaffRow } from '@/lib/staff';
import { addStaff, placeStaff, unplaceStaff, resolveRoleChange, invite } from './actions';

export const dynamic = 'force-dynamic';

const ERROR: Record<string, string> = {
  name: 'Type a name first.',
  email: 'An invite needs an email address to go to.',
};

/**
 * Names, then roles, then — separately — invites.
 *
 * The order is the point. A leader drafting their business needs to move names around without
 * anything happening, so the email fields stay folded away until every role has someone pencilled
 * into it. Entering an email is the one action on this page that emails a colleague and starts a
 * charge, so it says both, in plain words, right next to the button.
 */
export default async function People({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/signin');
  const sp = await searchParams;
  const error = ERROR[String(sp.error ?? '')];

  const roleRows = await db.select().from(schema.roles)
    .where(and(eq(schema.roles.tenantId, user.tenantId), eq(schema.roles.active, true)));
  const staffRows = await db.select().from(schema.staff).where(eq(schema.staff.tenantId, user.tenantId));
  const allAssignments = await db.select().from(schema.roleAssignments);
  const users = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));

  const roleIds = new Set(roleRows.map(r => r.id));
  const roles = roleRows as unknown as RoleRow[];
  const staff = staffRows as unknown as StaffRow[];
  const assignments = allAssignments.filter(a => roleIds.has(a.roleId)) as unknown as AssignmentRow[];

  const plan = await planStateFor(user.tenantId);
  const ready = structureLooksReady(roles, assignments);
  const waiting = pencilled(assignments, staff);
  const unplaced = staff.filter(s => !assignments.some(a => !a.toDate && a.staffId === s.id));

  // A pending move-or-merge question, if one was just triggered.
  const change = sp.change && sp.to
    ? roleChangeFor(String(sp.change), String(sp.to), roles, assignments, staff)
    : null;

  const holderOf = (roleId: string) => {
    const a = assignments.find(x => x.roleId === roleId && !x.toDate);
    if (!a) return null;
    const person = staff.find(s => s.id === a.staffId);
    const account = a.userId ? users.find(u => u.id === a.userId) : null;
    return { name: person?.name ?? account?.name ?? 'Someone', email: account?.email ?? null, staffId: a.staffId };
  };

  return (
    <Shell
      title="Who sits where"
      subtitle="Write the names in first. Nobody is emailed and nothing is charged until you send an invite — that is a separate step further down."
    >
      {error && <div className="mb-4 rounded-lg border-l-4 border-amber-400 bg-white p-4 text-sm">{error}</div>}
      {sp.invited && (
        <div className="mb-4 rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-4 text-sm text-emerald-900">
          Invite sent. They&apos;ll land on their own scorecard when they sign in.
        </div>
      )}

      {/* The move-or-merge question. Asked, never guessed. */}
      {change && (
        <section className="mb-6 rounded-lg border-l-4 border-rust bg-white p-5">
          <div className="label-caps">One question first</div>
          <p className="mt-1 text-ink">
            <b>{change.personName}</b> already holds <b>{change.fromRoleTitle}</b>. Putting them into{' '}
            <b>{change.toRoleTitle}</b> could mean two different things.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <form action={resolveRoleChange} className="rounded-lg border border-ink/10 p-4">
              <input type="hidden" name="staffId" value={change.staffId} />
              <input type="hidden" name="fromRoleId" value={change.fromRoleId} />
              <input type="hidden" name="toRoleId" value={change.toRoleId} />
              <input type="hidden" name="decision" value="move" />
              <div className="font-medium text-ink">They&apos;ve moved</div>
              <p className="mt-1 text-sm text-ink-light">
                {change.fromRoleTitle} becomes vacant and goes back on the chart as open, keeping its KPIs
                for whoever comes next.
              </p>
              <button className="btn-secondary mt-3 w-full">Move them</button>
            </form>
            <form action={resolveRoleChange} className="rounded-lg border border-ink/10 p-4">
              <input type="hidden" name="staffId" value={change.staffId} />
              <input type="hidden" name="fromRoleId" value={change.fromRoleId} />
              <input type="hidden" name="toRoleId" value={change.toRoleId} />
              <input type="hidden" name="decision" value="merge" />
              <div className="font-medium text-ink">They&apos;re doing both</div>
              <p className="mt-1 text-sm text-ink-light">
                They keep {change.fromRoleTitle} and take on {change.toRoleTitle} as well, carrying
                oversight of both.
              </p>
              <button className="btn-secondary mt-3 w-full">Merge the roles</button>
            </form>
          </div>
          <p className="mt-3 text-sm"><a href="/setup/people" className="underline text-ink-light hover:text-rust">Neither — cancel</a></p>
        </section>
      )}

      {/* ---------- 1. The directory ---------- */}
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <div className="label-caps">Your people</div>
        <p className="mt-1 text-sm text-ink-light">Just names for now. Add everyone you want on the chart.</p>
        {staff.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {staff.map(s => {
              const held = assignments.filter(a => !a.toDate && a.staffId === s.id);
              return (
                <li key={s.id} className="rounded-full border border-ink/15 px-3 py-1 text-sm">
                  {s.name}
                  <span className="ml-1.5 text-xs text-ink-light">
                    {s.userId ? 'has an account' : held.length ? `${held.length} role${held.length > 1 ? 's' : ''}` : 'not placed'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <form action={addStaff} className="mt-4 flex gap-2">
          <input name="name" placeholder="Name" autoComplete="off" className="flex-1 rounded-lg border border-ink/20 p-3 text-base" />
          <button className="btn-secondary shrink-0">Add</button>
        </form>
      </section>

      {/* ---------- 2. Put them in roles ---------- */}
      <section className="mt-6 rounded-lg border border-ink/10 bg-white">
        <div className="border-b border-ink/10 p-4">
          <div className="label-caps">The chart</div>
          <p className="mt-1 text-sm text-ink-light">
            A role with nobody in it is fine and always free — leave it open if the business needs it but you
            haven&apos;t filled it yet.
          </p>
        </div>
        <ul className="divide-y divide-ink/10">
          {roles.map(r => {
            const placement = placementOf(r.id, assignments);
            const holder = holderOf(r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="w-56">
                  <b className="text-ink">{r.title}</b>
                  <div className="text-xs text-ink-light">{r.level} · {r.level === 'staff' ? 'sees their own scorecard' : 'full access'}</div>
                </div>
                {placement === 'empty' ? (
                  staff.length ? (
                    <form action={placeStaff} className="flex flex-1 flex-wrap gap-2">
                      <input type="hidden" name="roleId" value={r.id} />
                      <select name="staffId" className="flex-1 rounded-lg border border-ink/20 px-3 py-2 text-sm">
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button className="btn-secondary shrink-0 text-sm">Put them here</button>
                    </form>
                  ) : <span className="flex-1 text-sm text-ink-light">Add a name above first.</span>
                ) : (
                  <div className="flex flex-1 items-center gap-3">
                    <span className="text-ink">{holder?.name}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${placement === 'invited' ? 'bg-emerald-100 text-emerald-900' : 'bg-cream text-ink-light'}`}>
                      {placement === 'invited' ? 'Has an account' : 'Pencilled in'}
                    </span>
                    {holder?.email && <span className="text-xs text-ink-light">{holder.email}</span>}
                    <form action={unplaceStaff} className="ml-auto">
                      <input type="hidden" name="roleId" value={r.id} />
                      <button className="text-xs text-ink-light underline hover:text-rust">Take off this role</button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {unplaced.length > 0 && (
        <p className="mt-3 text-sm text-ink-light">
          Not on the chart yet: {unplaced.map(s => s.name).join(', ')}.
        </p>
      )}

      {/* ---------- 3. Invites — folded away until the structure is settled ---------- */}
      <details className="mt-6 rounded-lg border border-ink/10 bg-white" open={ready}>
        <summary className="cursor-pointer list-none p-4 text-sm font-medium text-ink hover:text-rust">
          {ready ? 'Ready to invite them in' : 'Invite people in'}
          <span className="ml-2 font-normal text-ink-light">
            {ready
              ? '— the chart is filled, so this is the moment'
              : '— you can, but it is easier once the chart is settled'}
          </span>
        </summary>
        <div className="border-t border-ink/10 p-5">
          <p className="text-sm text-ink-light">
            An invite emails a login link and starts that person&apos;s seat at ${SEAT_PRICE_MONTHLY} a month.
            Everything up to this point is free and stays free — {plan.free
              ? 'you have not been charged anything yet'
              : `you are currently at $${plan.monthlyCost} a month for ${plan.seats} ${plan.seats === 1 ? 'person' : 'people'}`}.
          </p>

          {waiting.length === 0 ? (
            <p className="mt-4 text-sm text-ink">Nobody is waiting on an invite — everyone on the chart already has an account.</p>
          ) : (
            <ul className="mt-4 divide-y divide-ink/10">
              {waiting.map(w => {
                const role = roles.find(r => r.id === w.roleId)!;
                return (
                  <li key={w.person.id} className="py-3">
                    <form action={invite} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="staffId" value={w.person.id} />
                      <div className="w-52">
                        <b className="text-ink">{w.person.name}</b>
                        <div className="text-xs text-ink-light">{role.title}</div>
                      </div>
                      <input
                        name="email" type="email" required autoComplete="off"
                        placeholder="Their work email"
                        className="flex-1 rounded-lg border border-ink/20 px-3 py-2 text-sm"
                      />
                      <button className="btn-primary shrink-0 text-sm">Send invite</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 text-xs text-ink-light">
            When they sign in they see the chart, click their own name, and land on their scorecard with
            baseline KPIs for their role already filled in — which they can adjust before confirming.
            They can see their own scorecard and anyone reporting up to them, and nothing else.
          </p>
        </div>
      </details>

      <p className="mt-6 text-sm"><a href="/journey" className="underline">Back to the journey</a></p>
    </Shell>
  );
}
