import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { planStateFor, costLabel, TIER, tierOf } from '@/lib/plan';
import { moneyLabel } from '@/lib/pricing';
import { PERMISSIONS, LEVELS, stateOf, STATE_LABEL, levelOf } from '@/lib/permissions';
import { cadenceOf, CADENCE } from '@/lib/governance';
import { LIGHT_COLOUR } from '@/lib/today';
import { setCadence, setTier } from './actions';

export const dynamic = 'force-dynamic';

const STATE_COLOUR = {
  always: LIGHT_COLOUR.green,
  never: LIGHT_COLOUR.pending,
  grant: LIGHT_COLOUR.amber,
} as const;

/**
 * Administration — seats, settings, who may do what, and the record of what was changed.
 *
 * Administration is not management. An administrator adds seats and sets the financial year; their
 * scope still decides what they can actually see and manage, and no setting here widens that. The
 * permission table is a description of rules the server already enforces, laid out so it can be
 * read in one go — hiding a button was never access control.
 */
export default async function Settings() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const scope = await getScope(user);
  const plan = await planStateFor(user.tenantId);
  const tier = tierOf(tenant.tier);

  const seats = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
  const directors = await db.select().from(schema.directors).where(eq(schema.directors.tenantId, user.tenantId));
  const decided = await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId))
    .orderBy(desc(schema.approvals.requestedAt));

  const billable = seats.filter(u => u.invitedAt || u.acceptedAt || u.authUserId);
  const chartOnly = scope.roles.filter(r => {
    const holder = r.holder?.email;
    return !holder || !billable.some(b => b.email === holder);
  });

  if (!scope.canAdminister) {
    return (
      <Shell title="Administration" subtitle="Seats, settings and who may do what">
        <div className="callout max-w-2xl">
          <p className="text-sm text-ink-light">
            This screen belongs to an administrator. Everything it changes — seats, the financial year,
            the cadence, whether SPEC reads your systems — affects the whole business rather than one
            person&rsquo;s month.
          </p>
        </div>
        <section className="card mt-6">
          <h2 className="font-serif text-xl text-ink">What each level may do</h2>
          <PermissionTable />
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Administration" subtitle="Administration, not management — your scope still decides what you manage.">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-serif text-xl text-ink">Seats and billing</h2>
          <p className="mt-1 text-sm text-ink-light">{costLabel(plan)}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card-inset">
              <dt className="label-caps">Paid seats</dt>
              <dd className="mt-1 font-serif text-2xl text-ink">{plan.seats}</dd>
              <dd className="mt-1 text-xs text-ink-light">Anyone with a way in: invited, accepted or signed up.</dd>
            </div>
            <div className="card-inset">
              <dt className="label-caps">Free</dt>
              <dd className="mt-1 font-serif text-2xl text-ink">{chartOnly.length}</dd>
              <dd className="mt-1 text-xs text-ink-light">
                Roles on the chart with nobody in them, and people nobody has invited. Always free.
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-light">
            {moneyLabel(plan.currency, 0).replace(/[\d.,]+/, '')}
            {' '}per seat per month in your own currency — decided per region, never converted. Drawing the
            whole business costs nothing; the meter starts when a real person is invited in.
          </p>
        </section>

        <section className="card">
          <h2 className="font-serif text-xl text-ink">Company settings</h2>
          <p className="mt-1 text-sm text-ink-light">
            None of these is a preference. Each one changes how a month is read.
          </p>

          <form action={setCadence} className="mt-4">
            <label className="label-caps" htmlFor="cadence">How often the board sits</label>
            <div className="mt-1 flex flex-wrap gap-2">
              <select id="cadence" name="cadence" className="input flex-1" defaultValue={cadenceOf(tenant.boardCadence)}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save</SubmitButton>
            </div>
            <p className="mt-2 text-xs text-ink-light">{CADENCE[cadenceOf(tenant.boardCadence)].note}</p>
          </form>

          <form action={setTier} className="mt-6">
            <label className="label-caps" htmlFor="tier">Connectors and the assistant</label>
            <div className="mt-1 flex flex-wrap gap-2">
              <select id="tier" name="tier" className="input flex-1" defaultValue={tier}>
                <option value="basic">SPEC Basic</option>
                <option value="advanced">SPEC Advanced</option>
              </select>
              <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save</SubmitButton>
            </div>
            <p className="mt-2 text-xs text-ink-light">{TIER[tier].consequence}</p>
          </form>
        </section>
      </div>

      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">The board</h2>
          <span className="text-sm text-ink-light">{directors.filter(d => d.active).length} sitting</span>
        </div>
        <p className="mt-1 text-sm text-ink-light">
          Every business reports to a board, whether or not it has one — a bank, an owner, an investor, a
          franchisor, a major customer. Board seats are free and board roles are not scored.
        </p>
        {directors.length ? (
          <ul className="mt-4 grid gap-2">
            {directors.map(d => (
              <li key={d.id} className="card-inset flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{d.name}</span>
                <span className="text-xs text-ink-light">{d.title ?? 'Director'}{d.active ? '' : ' · no longer sitting'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-light">
            Nobody is recorded yet. A board that cannot say who its directors are has a compliance gap
            whatever the safety numbers say.{' '}
            <Link href="/setup/board" className="text-rust-700 hover:underline">Record the board</Link>.
          </p>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">What each level may do</h2>
        <p className="mt-1 text-sm text-ink-light">
          A description of what the server enforces, not a set of switches. Two of these are never
          delegable by anybody, including an administrator acting for themselves.
        </p>
        <PermissionTable />
      </section>

      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">What SPEC keeps, and what it never does</h2>
        <ul className="mt-3 grid gap-2 text-sm text-ink-light">
          <li>· Nothing is emailed with business content in it. No attachment, no link, no public page. The board reads the pack inside SPEC on a free seat.</li>
          <li>· A locked month is never recalculated. Corrections are dated amendments shown beside the original.</li>
          <li>· No AI path writes a score, a target, a KPI or a structural change — ever. No key reaches a browser.</li>
          <li>· SPEC as a company cannot read what is in here. There is no support tool that renders it and no break-glass; every recovery is one this screen owes you.</li>
          <li>· A lapsed subscription goes read-only. Nothing is deleted, and export always works.</li>
        </ul>
      </section>

      {decided.length > 0 && (
        <section className="card mt-6">
          <h2 className="font-serif text-xl text-ink">Activity</h2>
          <p className="mt-1 text-sm text-ink-light">Who asked for what, and who decided it.</p>
          <ul className="mt-4 grid gap-2">
            {decided.slice(0, 12).map(a => (
              <li key={a.id} className="card-inset">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-ink">{a.title}</span>
                  <span
                    className="text-xs"
                    style={{ color: a.state === 'approved' ? LIGHT_COLOUR.green : a.state === 'declined' ? LIGHT_COLOUR.pending : LIGHT_COLOUR.amber }}
                  >
                    {a.state === 'waiting' ? 'Waiting' : a.state === 'approved' ? 'Approved' : 'Declined'}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-ink-light">
                  {a.requestedBy} · {a.requestedAt.slice(0, 10)}
                  {a.decidedBy && ` → ${a.decidedBy} · ${a.decidedAt?.slice(0, 10)}`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

function PermissionTable() {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="table-clean min-w-[820px]">
        <thead>
          <tr>
            <th>Permission</th>
            {LEVELS.map(l => <th key={l.key}>{l.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map(p => (
            <tr key={p.id}>
              <td>
                <span className="text-ink">{p.label}</span>
                <span className="mt-0.5 block text-xs text-ink-light">{p.note}</span>
                {p.undelegable && (
                  <span className="mt-1 block text-xs text-rust-700">Never delegable, by anybody.</span>
                )}
              </td>
              {LEVELS.map(l => {
                const state = stateOf(p, l.key);
                return (
                  <td key={l.key}>
                    <span
                      className="pill"
                      style={{
                        background: `color-mix(in srgb, ${STATE_COLOUR[state]} 14%, transparent)`,
                        color: STATE_COLOUR[state],
                      }}
                    >
                      {STATE_LABEL[state]}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
