import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getScope } from '@/lib/scope';
import { planStateFor, costLabel } from '@/lib/plan';
import { moneyLabel } from '@/lib/pricing';
import { PERMISSIONS, LEVELS, stateOf, STATE_LABEL, levelOf } from '@/lib/permissions';
import { cadenceOf, CADENCE } from '@/lib/governance';
import { LIGHT_COLOUR } from '@/lib/today';
import { adminActivity } from '@/lib/admin-activity';
import { setCadence, setCeilings, resetCeilings, revokeRights, setAdministrator } from './actions';
import { isAdministrator, administratorNote } from '@/lib/administrators';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import { LADDER, MOST_A_CEILING_MAY_BE, ceilingsFor, usesOwnCeilings } from '@/lib/ceilings';
import { DEDUCTION_PER_FAILED_PILLAR, DEDUCTION_CAP, FAILED_AT_OR_BELOW } from '@/lib/incentive';
import { AccessPanel } from './access-panel';
import { fromSeat } from '@/lib/money-sight';
import { seatFor } from '@/lib/seat-of';
import { setBenchmarks } from './actions';

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
export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  /*
    ── This screen used to throw its refusals away ────────────────────────────────────────────────

    `await searchParams;` — awaited for the side effect and discarded. Every action on this page
    that refuses does it through `refuseTo`, which redirects with the reason on the address, and
    there was nothing here to read it. So a refusal arrived as a page that looked identical to the
    one you left: you press the button, the address changes, and nothing whatever is said.

    That is the failure mode `refuseTo`'s own doc names — *"a refusal that looks like a success is
    worse than either"* — sitting on the screen where the refusals matter most, because this is
    where seats, billing and who administers the business are changed.
  */
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  /*
    Which money seat this viewer is in. Read from the coarse seat rather than guessed: a screen that
    decided this for itself would be a second opinion about permissions, and the day the two
    disagreed nobody would know which was right.
  */
  const moneySeat = fromSeat(await seatFor(user));
  const scope = await getScope(user);
  const plan = await planStateFor(user.tenantId);
  const ceilings = ceilingsFor(tenant.ceilings);
  const ownCeilings = usesOwnCeilings(tenant.ceilings);
  // Written from the engine's own constants so the explanation cannot drift from the arithmetic.
  const DEDUCTION_NOTE = `${Math.round(DEDUCTION_PER_FAILED_PILLAR * 100)}% for each quadrant at or under `
    + `${Math.round(FAILED_AT_OR_BELOW * 100)}% anywhere beneath somebody, capped at ${Math.round(DEDUCTION_CAP * 100)}%.`;

  const seats = await db.select().from(schema.users).where(eq(schema.users.tenantId, user.tenantId));
  const directors = await db.select().from(schema.directors).where(eq(schema.directors.tenantId, user.tenantId));
  const decided = await db.select().from(schema.approvals)
    .where(eq(schema.approvals.tenantId, user.tenantId))
    .orderBy(desc(schema.approvals.requestedAt));

  /*
    Read from the rows that already carry the marks, rather than from an audit table SPEC does not
    keep. See lib/admin-activity for why a second copy of the truth is the wrong thing to build.
  */
  const packs = await db.select({
    period: schema.periods.period,
    approvedBy: schema.boardOutputs.approvedBy,
    sentBackBy: schema.boardOutputs.sentBackBy,
    sentBackAt: schema.boardOutputs.sentBackAt,
    createdAt: schema.boardOutputs.createdAt,
  })
    .from(schema.boardOutputs)
    .innerJoin(schema.periods, eq(schema.periods.id, schema.boardOutputs.periodId))
    .where(eq(schema.periods.tenantId, user.tenantId));
  const months = await db.select().from(schema.periods).where(eq(schema.periods.tenantId, user.tenantId));
  // The business's connections only. A person's own mailbox is theirs, and an activity feed the
  // whole business reads is exactly the place it must not appear. See PERSONAL_CATEGORIES.
  const connections = await db.select().from(schema.systemConnections)
    .where(and(
      eq(schema.systemConnections.tenantId, user.tenantId),
      isNull(schema.systemConnections.personalFor),
    ));

  /*
    Live grants, with the person and the branch named. Read here rather than in a helper because it
    is three joins on small tables and a helper would only hide that.
  */
  const grantRows = await db.select().from(schema.roleGrants)
    .where(and(eq(schema.roleGrants.tenantId, user.tenantId), isNull(schema.roleGrants.revokedAt)));
  const grants = grantRows.map(g => ({
    id: g.id,
    who: seats.find(s => s.id === g.userId)?.name ?? 'Somebody',
    branch: scope.roles.find(r => r.id === g.roleId)?.title ?? 'a role that has since gone',
    grantedBy: g.grantedBy,
    grantedAt: g.grantedAt,
  }));

  const activity = adminActivity({
    seats, directors, packs, connections,
    approvals: decided,
    periods: months,
  });

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
        {/*
        Design 19: who sees which money, two-step sign-in, and the promise that the data is theirs.
        Together on one screen because an owner deciding whether to trust a system asks all three
        in the same five minutes.
      */}
      <div className="mt-12" id="access">
        <AccessPanel seat={moneySeat} benchmarksOn={tenant.benchmarksOptIn} toggleBenchmarks={setBenchmarks} />
      </div>
    </Shell>
    );
  }

  return (
    <Shell
      title="Administration"
      kicker="Admin · who can do what"
      headline="Permissions follow the role, not the person"
      subtitle="Administration, not management — your scope still decides what you manage."
    >
      {/* First thing on the page, because a refusal nobody sees is a button that looks broken. */}
      <Refused reason={refusedReason(sp)} />

      {/*
        The sentence that stops the most common misunderstanding: people ask for "access for Jo",
        and what they mean is a seat on a role. Move Jo and what she can see moves with her.
      */}
      <p className="-mt-4 mb-6 max-w-2xl text-base text-ink-light">
        <b className="text-ink">Permissions follow the role, not the person.</b> What somebody can
        see is decided by where they sit on the chart — move them and it moves with them, the same
        minute, in both directions.
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-serif text-xl text-ink">Seats and billing</h2>
          <p className="mt-1 text-sm text-ink-light">{costLabel(plan)}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card-inset">
              <dt className="label-caps">Paid seats</dt>
              {/* `billable`, not `seats`. This box is headed "Paid seats" and the first one is not
                  paid, so printing the head count here would be the invoice contradicting itself
                  two lines under the price. */}
              <dd className="mt-1 font-serif text-2xl text-ink">{plan.billable}</dd>
              <dd className="mt-1 text-xs text-ink-light">
                Anyone with a way in — invited, accepted or signed up — after the first, who is free.
                {plan.seats > 0 && ` ${plan.seats} ${plan.seats === 1 ? 'person has' : 'people have'} a way in.`}
              </dd>
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
            whole business costs nothing; the meter starts when the second person is invited in — the
            first seat is free.
          </p>

          {/*
            SPEC's training material moved to its own door on 22 September — Kris asked for a
            dedicated training area rather than a control buried inside Seats and billing. Who is on
            the training seat, and putting somebody on or off it, now lives on /training itself,
            beside the material it unlocks.
          */}
          <div className="mt-6 border-t border-ink/10 pt-5">
            <div className="label-caps">SPEC&apos;s training material</div>
            <p className="mt-1 text-sm text-ink-light">
              A leadership seat can be upgraded, person by person, to unlock SPEC&apos;s own training
              material for the role.{' '}
              <Link href="/training" className="text-rust-700 hover:underline">Manage it from Training →</Link>
            </p>
          </div>
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

        </section>
      </div>

      {/*
        What each level can earn IN INCENTIVES — never base pay, and the heading has to say so.
        Kris, looking at the built screen: "this needs to be clear we are talking about incentives."
        The ladder is a SUGGESTION — "Ceilings are defaults, not law" — and until now there was
        nowhere to keep a business's own numbers, so every customer was silently held to SPEC's. A
        trade business and a services business do not pay the same.
      */}
      <section className="card mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">What a month can earn in incentives</h2>
          <span className="text-sm text-ink-light">
            {ownCeilings ? 'Your own figures' : 'SPEC’s suggested ladder'}
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          The most anybody at each level can earn from the <b className="text-ink">incentive scheme</b> in
          a month, before their percentage is applied — on top of base pay, never instead of it. Each
          step is half the one above it — that halving is what makes the ladder explainable in a pay
          conversation. These are <b className="text-ink">suggestions, not law</b>: set your own
          and SPEC uses yours everywhere.
        </p>
        <form action={setCeilings} className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {LADDER.map(l => (
              <div key={l.level}>
                <label htmlFor={`ceiling_${l.level}`} className="label-caps">{l.label}</label>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-sm text-ink-light">$</span>
                  <input
                    id={`ceiling_${l.level}`}
                    name={`ceiling_${l.level}`}
                    type="number"
                    min={0}
                    max={MOST_A_CEILING_MAY_BE}
                    step={50}
                    defaultValue={ceilings[l.level] ?? 0}
                    className="input w-full"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SubmitButton className="btn-primary" pending="Saving…">Save the incentive ceilings</SubmitButton>
          </div>
          <p className="mt-3 text-xs text-ink-light">
            A director is not in the incentive scheme — the people who set the standard are not paid
            against it. Deductions are separate and never change here: {DEDUCTION_NOTE}
          </p>
        </form>

        {/* Its own form, deliberately. Restoring the ladder is a real change to what people are paid
            and must never be one stray Enter key away from the boxes above it. */}
        {ownCeilings && (
          <form action={resetCeilings} className="mt-4 border-t border-ink/10 pt-4">
            <SubmitButton className="btn-secondary" pending="Restoring…">Back to SPEC’s ladder</SubmitButton>
            <p className="mt-2 text-xs text-ink-light">
              Clears your incentive figures and follows the published ladder again, including any future revision of it.
            </p>
          </form>
        )}
      </section>

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
            whatever the safety numbers say.
          </p>
        )}
        {/*
          ── The way in is always here, not only while the list is empty ──────────────────────

          Kris, 19 September: *"how do i add directors - above me as the GM - added in board
          area?"*. He could add them, at /setup/board, and the only link to it was inside the
          EMPTY-state sentence — so the route existed until the moment you used it once and then
          vanished, and adding a second director meant typing the address.

          That is the same fault as the KPI screen in September: *"its too complicated where i go
          to enter kpi's"*, where every route in was an empty state that disappeared the moment it
          had served its purpose. A door that closes behind you is not a door.
        */}
        <p className="mt-3 text-sm">
          <Link href="/setup/board" className="text-rust-700 hover:underline">
            {directors.length ? 'Add a director, or stand one down' : 'Record the board'}
          </Link>
        </p>
      </section>

      {/*
        ── Who administers the business ───────────────────────────────────────────────────────────

        Kris, 24 September: *"original person to sign up begins as an admin but they can change that
        to someone else if they wish."* The first half was already true — signing up puts you in the
        General Manager seat, and that role carries administrator. The second half had no path at
        all: access was written once when a person was created, and nothing in SPEC could change it
        afterwards. See lib/administrators.

        It sits directly above "What each level may do" on purpose. That table describes the levels;
        this is where somebody is actually moved between them, and a description with no door beside
        it is how a screen teaches people it cannot help them.
      */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Who administers this business</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{administratorNote(seats)}</p>

        <ul className="mt-4 grid gap-2">
          {seats.map(s => {
            const admin = isAdministrator(s);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-raised px-4 py-3 ring-1 ring-black/5"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{s.name}</span>
                  {s.id === user.id && <span className="text-ink-light"> (you)</span>}
                  <span className="block text-sm text-ink-light">{s.email}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-ink-light">
                    {admin ? 'Administrator' : s.access === 'full' ? 'Manager' : 'Read only'}
                  </span>
                  <form action={setAdministrator}>
                    <input type="hidden" name="userId" value={s.id} />
                    {!admin && <input type="hidden" name="make" value="on" />}
                    <SubmitButton className="btn-secondary px-4 py-1.5 text-sm">
                      {admin ? 'Step down' : 'Make an administrator'}
                    </SubmitButton>
                  </form>
                </span>
              </li>
            );
          })}
        </ul>
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
          <h2 className="font-serif text-xl text-ink">Waiting on a decision</h2>
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

      {/*
        Always shown, including when it is empty.

        An activity list that appears only once there is activity is useless for the question people
        actually bring to it — "did somebody change something?" — because the answer "no" looks
        identical to the feature not existing. Saying nothing has happened is an answer.
      */}
      {/*
        ── Rights over somebody else's branch ────────────────────────────────────────────────────

        Kris's rule, 19 September: *"managers only have rights to their staff - if rights are needed
        then the admin must approve this"*.

        The approving happens in the queue, where the request arrives. This is the other half, and
        without it the feature would be a one-way door: rights that can be given and never taken
        back are worse than rights that were never given, because everybody assumes somebody is
        keeping track. This is the list, in one place, with the name of whoever granted each one and
        the day they did.

        Revoking stamps a date rather than deleting the row — "who could see the Cobram scorecards
        in March" is a question a business eventually has to answer, and a deleted row cannot.
      */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Rights over another branch</h2>
        <p className="mt-1 text-sm text-ink-light">
          Everybody reaches their own role and the people under it without being given anything.
          These are the people who were granted more, and who granted it.
        </p>
        {grants.length === 0 ? (
          <p className="mt-4 text-sm text-ink-light">
            Nobody has been given rights beyond their own part of the chart.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {grants.map(g => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-cream p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <b>{g.who}</b> manages <b>{g.branch}</b> and everybody under it
                  </p>
                  <p className="mt-0.5 text-xs text-ink-light">
                    Granted by {g.grantedBy} on {g.grantedAt.slice(0, 10)}
                  </p>
                </div>
                <form action={revokeRights}>
                  <input type="hidden" name="grantId" value={g.id} />
                  <SubmitButton className="btn-secondary">Take it back</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Recent admin activity</h2>
        <p className="mt-1 text-sm text-ink-light">
          Every change to who is in this business, what it reports, and what it is connected to —
          taken from the records themselves, so it cannot disagree with them.
        </p>
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-ink-light">Nothing has been changed yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {activity.map((a, i) => (
              <li key={`${a.when}-${i}`} className="grid gap-0.5 border-b border-ink/10 pb-3 last:border-0 last:pb-0">
                <span className="text-sm text-ink">{a.what}</span>
                <span className="text-xs text-ink-light">{a.who} · {a.when.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
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
