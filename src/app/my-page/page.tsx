import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { redirect } from 'next/navigation';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { TodoList, AskPanel, ChangeList, MeetingLog, TrainingPath } from '@/components/today-blocks';
import { ImprovementBox, ImprovementRegister } from '@/components/improvement-register';
import { MailBlock } from '@/components/mail-block';
import { WhereYouSit, NobodyBelow, MyWeek, AskBar, WhoAndWhen } from '@/components/my-page-blocks';
import { rhythm, rhythmLine } from '@/lib/rhythm';
import { myMail } from '@/lib/mail';
import { registerFor } from '@/lib/register-data';
import { snapScore } from '@/lib/register';
import { currentLook } from '@/lib/look';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, PILLARS } from '@/lib/queries';
import { getToday } from '@/lib/today-data';
import { doors } from '@/lib/doors';
import { isAdminEmail } from '@/lib/admin';
import { myBusinesses } from '@/lib/auth';
import { doSignOut } from '@/app/signin/actions';
import { light, pillarNote, clearToWork, LIGHT_COLOUR, LIGHT_LABEL, type Light } from '@/lib/today';
import type { Pillar, RoleScore } from '@/lib/scoring';
import { Problems } from '@/components/problems';
import { PowerMeter, PowerBreakdown } from '@/components/power-meter';
import { powerMeterFor } from '@/lib/power-meter-data';
import { getScope, isTopOfChart } from '@/lib/scope';
import { startHere } from '@/lib/start-here';

export const dynamic = 'force-dynamic';

/**
 * My Page — the one screen a person logs into, and the only one they need to open.
 *
 * The whole day, in the order a person needs it: their four lights, what needs them, the roles
 * reporting to them, the numbers arriving from the systems they have connected, somewhere to ask,
 * what has changed under them, and where their compliance stands. Every block is read from what the
 * business has actually recorded, so a business that has just started sees a short honest page
 * rather than a full one made of nothing.
 *
 * **This is home.** The landing page brings somebody in, sign-up brings them here, and from
 * tomorrow morning this is the address that opens. Everything else in SPEC branches out of it.
 */
export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; kept?: string; power?: string }>;
}) {
  const arrival = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const tenant = (await getTenantById(user.tenantId))!;
  const data = await getToday(user);

  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const firstName = user.name.split(' ')[0];

  // Today is built from the role a person holds. Without one there is nothing here that belongs to
  // them, and the journey is where they actually are — the same rule /me already follows.
  if (!data.myRole) redirect('/journey');

  // The role exists but the business is not scoring yet. Say so plainly and hand over the next step,
  // rather than drawing an empty page that reads like a bad month.
  if (!data.period) {
    return (
      <Shell title={`Good morning, ${firstName}.`} subtitle={`${today} · your page`}>
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">Your day fills in as soon as a role has its KPIs</div>
          <p className="mt-1 text-sm text-ink-light">
            Every role needs two numbers per pillar — Safety, People, Earnings, Compliance. Set them for one
            role and this page fills in. Building the business and setting the KPIs is free.
          </p>
          <Link href="/setup/kpis" className="btn-primary mt-4 inline-block">Set the KPIs</Link>
        </div>
      </Shell>
    );
  }

  const { myRows, myScore, team, reportsTo, feeds, todos, changes, meetingLogged, training, ace, scored } = data;

  // A visitor looking around never writes. `assertWritable` refuses them anyway, but showing a form
  // that cannot work is a worse way to find that out than being told.
  const canWrite = !(await currentLook().catch(() => null));
  const teamNames = team.map(m => m.holder).filter((n): n is string => !!n);
  const register = await registerFor(user.tenantId, user.name, teamNames);
  const mail = await myMail(user.tenantId, user.id);

  // Every door out of this page. The group view only appears for somebody actually in a group, and
  // the cockpit only for whoever runs SPEC itself — its absence is the answer for everybody else.
  /*
    What this business has not done yet. The org chart is the foundation everything hangs off, and it
    was reachable only from a one-time banner and a list at the bottom of this page — so a customer
    who came back the next morning had to scroll past their whole day to find the thing they were
    meant to do first. See lib/start-here.
  */
  const onChart = (await db.select({ id: schema.staff.id }).from(schema.staff)
    .where(eq(schema.staff.tenantId, user.tenantId))).length;
  const scoredTeam = team.filter(m => m.scored).length;
  const next = startHere({
    onChart,
    scoredRoles: scoredTeam + (scored ? 1 : 0),
    rolesWithKpis: myRows.filter(r => r.kpi).length > 0 ? 1 : 0,
  });

  /*
    ── The Virtual GM Power Meter ────────────────────────────────────────────────────────────────

    Kris, 19 September: *"add the Virtual GM power meter - HACC your power - to the my page - this
    is the power meter gathering information through the spec system to give an instant percentage
    to the business leaders and the board on how well the business is tracking"*.

    Read over this person's own scope, so a manager's meter is their branch and the top of the
    chart gets the business. That is not a nicety: this is a reading of a whole part of an
    organisation, and the rule the product is sold on is that nobody sees above or sideways.

    The percentage is for people who manage somebody. An electrician shown a red number for a
    business they cannot move is being handed a worry rather than a lever — so they get the ring,
    the name and their own four pillars, which are the things they can actually act on.
  */
  const scope = await getScope(user);
  /*
    The Snap Score goes IN to the meter as the twenty-fifth measure rather than sitting beside it
    as a second opinion — Kris, 19 September: *"snap score can be added to the Virtual GM power
    meter and be the 25th data point"*. Computed from the same register read the page draws below,
    so the two can never disagree.
  */
  const power = await powerMeterFor({
    tenantId: user.tenantId,
    visible: scope.visible,
    snap: snapScore(register),
  });
  // Manages somebody: their scope reaches past their own role. The same population the design gives
  // the number to, worked out from the chart rather than from a flag anybody sets.
  const runsAnything = scope.visible.size > 1;
  const showing = arrival.power === 'all' ? 'all' : arrival.power === 'open' ? 'open' : 'closed';
  const meterHref = (next: 'closed' | 'open' | 'all') =>
    (next === 'closed' ? '/my-page#power' : `/my-page?power=${next}#power`);

  const ways = doors({
    businesses: (await myBusinesses().catch(() => [])).length,
    runsSpec: isAdminEmail(user.email),
  });

  // My week: the handful of beats the business runs on, never a diary. See lib/rhythm.
  const unmarked = myRows.filter(r => r.kpi && !r.answer).length;
  const beats = rhythm({
    meetingLogged,
    leadsPeople: team.length > 0,
    openPeriod: data.period?.period ?? null,
    daysToClose: daysLeftInMonth(),
    unmarked,
    canManage: data.canManage,
  });
  /*
    The first visit, before a single number has been marked.

    Kris, 16 September, on the page a brand-new business meets: *"when someone starts they want to
    enjoy the journey in — remember they are here because problems are overwhelming them — if we make
    it too much info then that's another problem they don't understand which will make them quit — we
    need a beautifully simple start"*.

    He was looking at five thousand pixels of page. Twenty blocks, four identical grey cards reading
    "Not measured yet", a week with nothing in it, a training path with nothing on it, a mail block
    for mail nobody has connected. Every one of them correct and every one of them empty, offered to
    somebody who came here because they already have more than they can hold.

    The design never drew this. `rag()` in SPEC My Page.dc.html is
    `v >= 80 ? GREEN : v > 50 ? AMBER : RED` — there is no branch for "no score", and its prototype
    shows 92, 85, 89 and 100. A business on day one was territory the drawings simply do not cover,
    so the product filled it by rendering everything at once.

    So: until there is one mark, the page is the greeting, the one next step, the problem you came
    with, the list of what to do, and the doors. Everything else arrives when it has something in it,
    which is also when it starts being worth reading.
  */
  const nothingMarkedYet = PILLARS.every(p => myScore.pillars[p] === null);
  // A supervisor's reports are on the tools, not running scorecards of their own. Calling that
  // "my team" is the language of an office; "my crew" is what they actually say.
  const crew = team.length > 0 && team.every(m => !m.scored);
  const compliance = clearToWork(myRows);
  const live = feeds.filter(f => f.status === 'live');

  return (
    <Shell title="" subtitle="">
      {/*
        The design's header: who this is, which role, and what day — with the page named out loud.
        It replaced "Good morning, Kris." over a grey line of context. This page is opened by
        everybody in the business, and the first question it has to answer is which of my roles am I
        looking at.
      */}
      {/*
        ── The header line, as the design draws it ───────────────────────────────────────────────

        Kris, 19 September: *"just use this as an example - i gave you this"*, with
        `SPEC My Page.dc.html` open beside the built page.

        The meter is `margin-left: auto` on this row — a corner instrument beside the page's own
        heading, not a banner above it. The first version was a full-width block, which made the
        meter the subject of the page. The four pillar cards are the subject.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <WhoAndWhen name={user.name} role={data.myRole.title} businessName={tenant.name} date={today} />
        <PowerMeter
          reading={power.reading}
          canRead={runsAnything}
          period={power.period}
          showing={showing}
          hrefFor={meterHref}
        />
      </div>

      {/* Full width, above the pillars — `grid-column: 1 / -1; order: -1` in the design. */}
      <PowerBreakdown
        reading={power.reading}
        canRead={runsAnything}
        topOfChart={isTopOfChart(scope)}
        period={power.period}
        stale={power.stale}
        showing={showing}
        hrefFor={meterHref}
      />

      <p className="mb-8 max-w-2xl text-sm text-ink-light">
        {scored
          ? standing(todos.length, myScore)
          : 'Checklist view · this role is not individually scored. You keep people safe, log your hours and finish your training; the numbers are carried by the role above you.'}
      </p>

      {/*
        ── One reading of the business per page ──────────────────────────────────────────────────

        Kris, 19 September: *"the snap score shouldn't be there on the my page"*.

        It was worse than one score too many. This band was a promoted COPY of a pill that is still
        on the improvement register further down — so the page said that number twice before the
        Power Meter arrived, and three readings deep afterwards: a percentage at the top, a grey 0
        in the middle, and the same 0 again below. Somebody opening this to find out how they are
        doing had to work out which of three numbers was about them.

        The Snap Score is a read of the improvement REGISTER — how fast problems get closed — and it
        belongs on that register, where it says what it is about. A band at the top of the page made
        it look like a reading of the business, which it is not.

        The band also carried a jump link to the Improvement opportunity box. That box is still here
        at #improvement under its own heading, so what went is a shortcut, not a capability.
      */}

      {/*
        The first thirty seconds of being a customer.

        Shown once, on arrival from sign-up, and never again — it hangs off a query parameter rather
        than anything stored, so it disappears the moment they navigate and cannot become furniture.
        The front door promised this page would be waiting with their problem in it; this is the page
        saying so out loud rather than leaving them to notice.
      */}
      {(arrival.welcome || arrival.kept) && (
        <div className="mb-8 rounded-lg border-l-4 border-rust bg-surface p-5">
          <p className="font-serif text-lg text-ink">
            {arrival.kept
              ? `This is your page now, ${firstName} — and it is the business you were just looking at.`
              : `This is your page, ${firstName}. You will open it every morning.`}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-ink-light">
            Anything you told us on the way in is in the improvement register below, already read and
            ranked. Everything else in SPEC opens from here.
          </p>
        </div>
      )}

      {/*
        The first thing, while there is a first thing.

        Above the lights, because a business with no chart has no lights worth looking at — and a
        leader opening this on a phone must not have to scroll to find the step that makes the rest
        of the product work. It disappears the moment the step is done.
      */}
      {next && (
        <section className="mb-8 rounded-lg border-l-4 border-rust bg-surface p-5">
          <p className="font-serif text-lg text-ink">{next.title}</p>
          <p className="mt-2 max-w-2xl text-sm text-ink-light">{next.why}</p>
          <Link href={next.href} className="btn-primary mt-4 inline-block">{next.action}</Link>
        </section>
      )}

      {/*
        The four lights, once there is light in them.

        On the first visit they are four large cards saying nothing four times, in the best position
        on the page. They become the design's own compact four-slot marker instead: the letters, in
        order, in the neutral grey, and one line saying what turns them on. The full cards come back
        the moment a month is marked, which is the moment they are worth the room.
      */}
      {/*
        ── The four cards, on day one as well ───────────────────────────────────────────────────

        These used to collapse to a compact grey strip until a month was marked, on the reasoning
        that four large cards saying nothing four times is worse than one line. That reasoning was
        wrong, and Kris found it by opening the product beside his own design: the four pillar cards
        ARE SPEC. Day one is the only day a new customer ever sees, and it was the one day the most
        recognisable thing on the page was missing.

        An unmarked card is not empty. It carries the pillar, what it will measure, and the way in to
        set it — which is more use on day one than at any other time.
      */}
      {scored && (
      <section aria-label="My four pillars" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(p => {
          const v = myScore.pillars[p];
          const l = light(v);
          return (
            <Link
              key={p}
              href={`/scorecard/${data.myRole!.id}`}
              className="card transition-colors hover:border-rust/40"
              style={{ borderTopColor: LIGHT_COLOUR[l], borderTopWidth: 4 }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="label-caps">{PILLAR_META[p].name}</span>
                <Dot light={l} size={14} />
              </div>
              {/*
                The design's number is the anchor of the card, not a line in it.

                A pillar with nothing marked reads **0%**, not a dash. Kris, 18 September: *"i dont
                like the dashes they should 0's percent"*. He is right for a reason worth keeping: a
                dash asks the reader what happened, and the honest answer on an unmarked month is
                that nothing has been scored — which IS nought. The line underneath still says "Not
                marked yet", so nought is never mistaken for a month that was marked and failed.
              */}
              <div className="mt-3 font-serif text-5xl leading-none text-ink">{v === null ? '0%' : pct(v)}</div>
              <div className="mt-2 text-sm" style={{ color: l === 'pending' ? undefined : LIGHT_COLOUR[l] }}>
                {v === null ? 'Not marked yet' : LIGHT_LABEL[l]}
              </div>
              <p className="mt-2 text-xs text-ink-light">{pillarNote(myRows, p)}</p>
              <span className="mt-3 block text-xs text-rust-700">Open my KPIs →</span>
            </Link>
          );
        })}
      </section>
      )}

      {/*
        ── The ask bar, under the scoreboard ─────────────────────────────────────────────────────

        Kris, 19 September: *"this ask spec should be under the scoreboard for kpi's"*.

        It was above the four cards, which put the question before the thing being asked about. The
        two example questions it offers — *"Why is my People light amber?"*, *"What do I take to the
        weekly meeting?"* — only mean anything once somebody has seen the lights. Underneath, it
        reads as the next move after looking at them; above, it was furniture between the header and
        the point of the page.

        This is what retires the separate chat screen: two screens both claiming to be where you
        start is the most reliable way a product gets called confusing. The page is the scoreboard;
        the conversation is how you work it.
      */}
      <AskBar available href={`/mirrors?ask=1`} />

      {/*
        The improvement register, directly under the lights and above everything the day asks.

        Its position is the argument. A problem somebody has been carrying for months outranks
        today's list, because today's list is this month's numbers and this is the thing that will
        still be here next year if nobody names it. It is also the same box the front door offers a
        stranger — so a problem raised before anybody had an account lands in exactly this list.
      */}
      <div id="improvement" className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <ImprovementBox canWrite={canWrite} read />
        <ImprovementRegister
          entries={register}
          me={user.name}
          people={[user.name, ...teamNames]}
          canWrite={canWrite}
        />
      </div>

      {/*
        Where you sit, under the register. The three facts that decide everything else on the page,
        including what this person is allowed to see — said plainly rather than left to be worked
        out by poking at the product and drawing the wrong conclusion.
      */}
      <div className="mt-8">
        <WhereYouSit
          role={data.myRole.title}
          reportsTo={reportsTo ? reportsTo.title : null}
          score={pct(myScore.overall)}
          scored={scored}
        />
      </div>

      {/*
        Two columns of comparable weight. What the day asks of you on the left — the list, what moved
        under you, where the Ace run stands, your team, the numbers arriving. Everything you reach
        for rather than read on the right.
      */}
      {/*
        On the first visit, this is the ONLY thing under the register: what to do today.

        Everything else in these two columns — the week, the meeting, the training path, the mail
        block, the Ace run, the team, where the numbers come from — is a true and empty box on day
        one. Held back until it has something in it. See nothingMarkedYet above.
      */}
      {nothingMarkedYet && (
        /*
          ── Day one, revised ─────────────────────────────────────────────────────────────────────

          Kris, 18 September: *"the first seat should have all tools working"*, and in the brief:
          *"System opens at full capacity, nothing locked."*

          The rule above is still right about the boxes it was written for — an Ace run with no
          closed month, a mail block with nothing connected, a week with nothing in it are true and
          empty, and offering eight of those to somebody who came here already overwhelmed is worse
          than offering none.

          But it was applied to the whole column, and two of the things inside it are not empty on
          day one at all:

            ASK ANYTHING works from the first minute. It is the box the brief calls the do-anything
            box — where somebody types "connect me to Xero" — and holding it back until a month has
            been marked meant the one tool that could have HELPED them start was hidden until after
            they had started.

          My team is the other one — the roles are there the moment the chart is — but it is forty
          lines of markup inside the branch below rather than a component, and copying it would give
          this page two versions of the same block to keep in step. Left for when that block becomes
          a component; noted here so it is a deferral rather than an oversight.

          So the rule narrows from "nothing until a mark" to "nothing that would be EMPTY". A box
          that works on day one is shown on day one.
        */
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <div className="grid gap-6">
            <section className="card">
              <h2 className="font-serif text-xl text-ink">What needs me today</h2>
              <TodoList items={todos} />
            </section>
          </div>
          <div className="grid gap-6">
            <section className="rounded-lg bg-sage-100 p-4">
              <h2 className="font-serif text-xl text-ink">Ask anything</h2>
              <AskPanel rows={myRows} score={myScore} meetingLogged={meetingLogged} />
            </section>
          </div>
        </div>
      )}

      {!nothingMarkedYet && (
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <section className="card">
            <h2 className="font-serif text-xl text-ink">What needs me today</h2>
            <TodoList items={todos} />
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Changes you should know about</h2>
              <span className="text-sm text-ink-light">{changes.length} {changes.length === 1 ? 'item' : 'items'}</span>
            </div>
            <ChangeList items={changes} />
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">{scored ? `${aceName(data.myRole.stream)} run` : 'Ace'}</h2>
              {scored && (
                <span className="text-sm text-ink-light">{ace.months} of {ace.required} months</span>
              )}
            </div>
            {scored && ace.run.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {ace.run.map(m => (
                  <span
                    key={m.period}
                    className="pill"
                    style={{
                      background: `color-mix(in srgb, ${m.held ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending} 14%, transparent)`,
                      color: m.held ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending,
                    }}
                  >
                    {m.period} {m.held ? '✓' : '—'}
                  </span>
                ))}
              </div>
            )}
            <ul className="mt-4 grid gap-3">
              {ace.steps.map(s => (
                <li key={s.label} className="flex items-start gap-3">
                  <Dot light={s.done ? 'green' : 'pending'} size={11} />
                  <span className="min-w-0">
                    <span className={`block text-sm ${s.done ? 'text-ink' : 'text-ink-light'}`}>{s.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-light">{s.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            {scored && ace.run.length === 0 && (
              <p className="mt-3 text-xs text-ink-light">
                No month has closed yet, so the run has not started. Only closed months count — an open
                month is not a result.
              </p>
            )}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">{crew ? 'My crew' : 'My team'}</h2>
              <Link href="/org" className="text-sm text-rust-700 hover:underline">Open the org chart</Link>
            </div>
            {team.length ? (
              <>
                <p className="mt-1 text-sm text-ink-light">
                  {team.length} {team.length === 1 ? 'role reports' : 'roles report'} to you.{' '}
                  {crew
                    ? 'They are not scored individually — their numbers are carried by your card.'
                    : 'The four dots are Safety, People, Earnings and Compliance.'}
                </p>
                <ul className="mt-4 grid gap-2">
                  {team.map(m => (
                    <li key={m.roleId} className="card-inset flex flex-wrap items-center justify-between gap-3">
                      <Link href={`/scorecard/${m.roleId}`} className="group min-w-0">
                        <div className="font-serif text-base text-ink group-hover:text-rust">{m.title}</div>
                        <div className="text-xs text-ink-light">
                          {m.holder ?? (m.pencilled ? `${m.pencilled} — pencilled in, not invited` : 'Nobody in this role')}
                        </div>
                      </Link>
                      <div className="flex items-center gap-3">
                        {m.scored && (
                          <span className="flex gap-1.5">
                            {PILLARS.map(p => <Dot key={p} light={light(m.score.pillars[p])} size={11} title={`${PILLAR_META[p].name} ${pct(m.score.pillars[p])}`} />)}
                          </span>
                        )}
                        <span className="min-w-[9ch] text-right text-xs text-ink-light">
                          {m.scored ? teamFlag(m.score) : 'Checklist role'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <NobodyBelow />
            )}
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/*
                ── What "connected" actually means today, said accurately ──────────────────────────

                This heading read "Numbers arriving on their own" and the line beside it said N of M
                systems CONNECTED, with "last read <date>" against each one.

                None of that is happening. `connectSystem` writes a row; `markLive` is an
                administrator pressing a button, which sets the status to live and stamps
                `lastSyncAt` with the moment of the press. There is no OAuth anywhere in this
                repository, no request to a vendor and no data. The date is when somebody clicked,
                not when anything was read.

                It mattered less while this block was behind the Advanced tier. Removing the tiers
                on 18 September put it in front of EVERY business, which is how I found it — so this
                is a lie I widened today and it is fixed in the same breath.

                The register itself is real and worth having: which systems the business runs, who
                owns each one, and the board's approval for the sensitive ones. That is what the
                words now claim, and nothing more. When a connector genuinely fetches, this heading
                is the thing to change back — and `f.lastSyncAt` becomes true at the same moment.
              */}
              <h2 className="font-serif text-xl text-ink">Where your numbers come from</h2>
              <span className="text-sm text-ink-light">
                {live.length} of {feeds.length} {feeds.length === 1 ? 'system' : 'systems'} signed off as a source
              </span>
            </div>
            {feeds.length ? (
              <ul className="mt-4 grid gap-2">
                {feeds.map(f => (
                  <li key={f.id} className="card-inset">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-serif text-base text-ink">{f.category}</span>
                      <span className={`pill ${f.status === 'live' ? 'pill-confirmed' : f.status === 'broken' ? 'pill-fail' : 'pill-pending'}`}>
                        {f.statusLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-light">
                      {f.name}
                      {f.lastSyncAt && ` · marked live ${f.lastSyncAt.slice(0, 10)}`}
                    </div>
                    {f.feeds.length > 0 && (
                      <div className="mt-2 text-xs text-ink-light">Feeds: {f.feeds.join(' · ')}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-light">
                No system is connected, so every number on your card is marked by hand. That is a complete way
                to run SPEC — a connector is never required for any of it.
              </p>
            )}
            <Link href="/setup/systems" className="mt-4 link-go">Manage what SPEC reads &rarr;</Link>
          </section>
        </div>

        <div className="grid gap-6">

          <section className="rounded-lg bg-sage-100 p-4">
            <h2 className="font-serif text-xl text-ink">Ask anything</h2>
            <AskPanel rows={myRows} score={myScore} meetingLogged={meetingLogged} />
          </section>


          {/*
            Replaces the old Messages block, which only offered a way out to Outlook or Gmail. The
            design asks for mail that MATCHES something on this person's card, with the task each
            piece created under it — and for that to stay narrow enough that the list ends.
          */}
          <MailBlock connection={mail} canWrite={canWrite} />

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Your own mail, where it lives</h2>
            <p className="mt-2 text-sm text-ink-light">
              SPEC does not carry your mail. Nothing with business content in it is ever sent, attached or
              linked — the month is read here, in SPEC, by whoever is entitled to see it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="https://outlook.office.com/mail/" className="btn-ghost" target="_blank" rel="noreferrer noopener">Open in Outlook</a>
              <a href="https://mail.google.com/" className="btn-ghost" target="_blank" rel="noreferrer noopener">Open in Gmail</a>
            </div>
          </section>

          <MyWeek beats={beats} line={rhythmLine(beats)} />

          <section className="card">
            <h2 className="font-serif text-xl text-ink">
              <Link href="/meeting" className="hover:text-rust">This week{"\u2019"}s meeting</Link>
            </h2>
            <p className="mt-2 text-sm text-ink-light">
              {todos.length
                ? `Take the list above: ${todos.slice(0, 3).map(t => t.label.toLowerCase()).join('; ')}.`
                : 'Nothing is outstanding on your card this week.'}
            </p>
            <MeetingLog logged={meetingLogged} canManage={data.canManage} />
          </section>

          <section className="rounded-lg bg-rust-100 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">My training</h2>
              <span className="text-sm text-ink-light">{trainingLine(training.progress)}</span>
            </div>
            <TrainingPath path={training.path} progress={training.progress} signoff={training.signoff} limit={3} />
            {/* The design's way out of this block, and the product had none: the path showed three
                modules and then stopped, with no way through to the rest of it. */}
            <Link href="/training" className="mt-3 link-go">
              Continue training →
            </Link>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Clear to work</h2>
              <span className="text-sm text-ink-light">
                {compliance.filter(c => c.light === 'green').length} of {compliance.length} confirmed
              </span>
            </div>
            {compliance.length ? (
              <ul className="mt-4 grid gap-3">
                {compliance.map(c => (
                  <li key={c.criterionId}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-ink">{c.name}</span>
                      <span className="font-serif text-sm" style={{ color: c.light === 'pending' ? undefined : LIGHT_COLOUR[c.light] }}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-light">{c.note}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-light">
                Nothing sits under Compliance on your card yet. Clear to Work is a hard gate, so it is worth
                having something against it.
              </p>
            )}
            <p className="mt-4 text-xs text-ink-light">
              Clear to Work is pass or fail, and is reported separately from every score.
            </p>
          </section>
        </div>
      </div>
      )}

      <p className="mt-10 max-w-xl text-base text-ink-light">That is the whole day. Nothing else to open.</p>

      {/*
        Why this page exists at all, under the day's work rather than over it.

        My Page is what a leader opens at seven in the morning; the argument is for the moment they
        stop to think about whether any of this is worth doing, and for explaining it to a board.
      */}
      <Problems screen="myPage" heading="What this page changes" />

      {/*
        Everywhere else, and every door to it.

        SPEC has no navigation bar. The shape is a landing page for arriving and then THIS page,
        which controls everything inside the system — so the rest of the product is reached from
        here, at the bottom, after the day's work rather than above it. A toolbar would put a menu
        between a leader and the thing they opened SPEC to see.

        Grouped the way somebody asks for them, and ordered by how often they are needed. See
        lib/doors, which is also what a test walks to prove nothing has become unreachable.
      */}
      {/* `id` because "All pages" in the header opens My Page here — see lib/doors. */}
      <section id="everywhere" className="mt-12 scroll-mt-20 border-t border-ink/10 pt-8">
        <h2 className="font-serif text-xl text-ink">Everywhere else in SPEC</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          There is no menu. Everything opens from here, and the mark at the top of any screen brings
          you back.
        </p>

        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          {ways.map(group => (
            <div key={group.title}>
              <span className="label-caps">{group.title}</span>
              <ul className="mt-3 grid gap-3">
                {group.doors.map(d => (
                  <li key={d.href}>
                    <Link href={d.href} className="font-serif text-base text-ink hover:text-rust">
                      {d.label}
                    </Link>
                    <span className="block text-xs text-ink-light">{d.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          Last, quiet, and deliberately not a destination. It never belonged in a navigation bar,
          where it sat one slip away from whatever somebody was actually reaching for.
        */}
        {canWrite && (
          <form action={doSignOut} className="mt-10 border-t border-ink/10 pt-6">
            <button type="submit" className="inline-flex min-h-[28px] items-center text-sm text-ink-light/70 underline hover:text-rust">
              Sign out
            </button>
          </form>
        )}
      </section>
    </Shell>
  );
}

/**
 * Days left to close the month being marked.
 *
 * A month is closed in the month AFTER it — August is marked and locked during September, because
 * that is when the P&L lands. So the deadline that matters is the end of the current calendar
 * month, not the end of the month being scored.
 */
function daysLeftInMonth(now = new Date()): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

/** A traffic light. Pending is a warm neutral — an absence, never an alarm. */
function Dot({ light: l, size, title }: { light: Light; size: number; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="block shrink-0 rounded-full"
      style={{
        width: size, height: size,
        background: LIGHT_COLOUR[l],
        boxShadow: `0 0 0 2px color-mix(in srgb, ${LIGHT_COLOUR[l]} 22%, transparent)`,
      }}
    />
  );
}

/** The line under the greeting: what today actually asks of this person. */
function standing(outstanding: number, score: RoleScore): string {
  const behind = (['safety', 'people', 'earnings', 'compliance'] as Pillar[])
    .filter(p => { const v = score.pillars[p]; return v !== null && v < 0.9; });
  if (!outstanding) {
    return behind.length
      ? 'Nothing is waiting on you today. What is left is the month itself — the pillars below 90% need a run of results, not an action this morning.'
      : 'Nothing is waiting on you today, and all four of your lights are at the standard.';
  }
  const n = `${outstanding} ${outstanding === 1 ? 'thing needs' : 'things need'} you today`;
  return behind.length
    ? `${n}, and working through them is what moves ${behind.map(capital).join(' and ')}.`
    : `${n}. None of your lights is behind — this is keeping it that way.`;
}

const capital = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

/**
 * Sales Ace on the growth side, Ops Ace on operations, and plain Ace anywhere else — the standing
 * is the same test wherever it is held, and only the name changes with the stream.
 */
const aceName = (stream: string) =>
  stream === 'growth' ? 'Sales Ace' : stream === 'operations' ? 'Ops Ace' : 'Ace';

/** The count beside "My training". A role with no path has none, rather than nought of nought. */
function trainingLine(p: { total: number; complete: number; overdue: number }): string {
  if (p.total === 0) return 'No path set';
  const base = `${p.complete} of ${p.total} complete`;
  return p.overdue ? `${base} · ${p.overdue} overdue` : base;
}

/** The short verdict beside a team member's dots. Never a rank, never a comparison. */
function teamFlag(score: RoleScore): string {
  if (score.overall === null) return 'No score yet';
  const behind = (['safety', 'people', 'earnings', 'compliance'] as Pillar[])
    .filter(p => { const v = score.pillars[p]; return v !== null && v < 0.9; });
  if (!behind.length) return 'All at 90%+';
  if (behind.length === 1) return `${capital(behind[0])} ${pct(score.pillars[behind[0]])}`;
  return `${behind.length} pillars under 90%`;
}
