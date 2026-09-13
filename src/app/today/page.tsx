import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { TodoList, AskPanel, ChangeList, MeetingLog, TrainingPath } from '@/components/today-blocks';
import { ImprovementBox, ImprovementRegister } from '@/components/improvement-register';
import { MailBlock } from '@/components/mail-block';
import { WhereYouSit, NobodyBelow, MyWeek, AskBar } from '@/components/my-page-blocks';
import { rhythm, rhythmLine } from '@/lib/rhythm';
import { myMail } from '@/lib/mail';
import { registerFor } from '@/lib/register-data';
import { currentLook } from '@/lib/look';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, PILLARS } from '@/lib/queries';
import { getToday } from '@/lib/today-data';
import { hasDiagnosis } from '@/lib/plan';
import { light, pillarNote, clearToWork, LIGHT_COLOUR, LIGHT_LABEL, type Light } from '@/lib/today';
import type { Pillar, RoleScore } from '@/lib/scoring';

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
  searchParams: Promise<{ welcome?: string; kept?: string }>;
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

  const { myRows, myScore, team, reportsTo, feeds, todos, changes, meetingLogged, training, ace, scored, tier } = data;

  // A visitor looking around never writes. `assertWritable` refuses them anyway, but showing a form
  // that cannot work is a worse way to find that out than being told.
  const canWrite = !(await currentLook().catch(() => null));
  const teamNames = team.map(m => m.holder).filter((n): n is string => !!n);
  const register = await registerFor(user.tenantId, user.name, teamNames);
  const mail = await myMail(user.tenantId, user.id);

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
  const advanced = tier === 'advanced';
  // A supervisor's reports are on the tools, not running scorecards of their own. Calling that
  // "my team" is the language of an office; "my crew" is what they actually say.
  const crew = team.length > 0 && team.every(m => !m.scored);
  const compliance = clearToWork(myRows);
  const live = feeds.filter(f => f.status === 'live');

  return (
    <Shell
      title={`Good morning, ${firstName}.`}
      subtitle={`${today} · your page · ${data.myRole.title} at ${tenant.name}`}
    >
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-ink-light">
        {scored
          ? standing(todos.length, myScore)
          : 'Checklist view · this role is not individually scored. You keep people safe, log your hours and finish your training; the numbers are carried by the role above you.'}
      </p>

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
          <p className="mt-3 max-w-2xl text-sm text-ink-light">
            <b className="text-ink">One thing to do first:</b> write down who does what. SPEC scores
            roles, so the chart is what everything else hangs off — it takes a few minutes and costs
            nothing.
          </p>
          <Link href="/org" className="btn-primary mt-4 inline-block">Build the org chart</Link>
        </div>
      )}

      {/*
        The ask bar, across the top. This is what retires the separate chat screen: two screens both
        claiming to be where you start is the most reliable way a product gets called confusing.
        The page is the dashboard; the conversation is how you work it.
      */}
      <AskBar available={advanced} href={`/boards?ask=1`} />

      {/* The four lights lead the page: the first thing anybody wants is where they stand. */}
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
              <div className="mt-3 font-serif text-4xl text-ink">{pct(v)}</div>
              <div className="mt-1 text-sm" style={{ color: l === 'pending' ? undefined : LIGHT_COLOUR[l] }}>
                {LIGHT_LABEL[l]}
              </div>
              <p className="mt-2 text-xs text-ink-light">{pillarNote(myRows, p)}</p>
              <span className="mt-3 block text-xs text-rust-700">Open my KPIs →</span>
            </Link>
          );
        })}
      </section>
      )}

      {/*
        The improvement register, directly under the lights and above everything the day asks.

        Its position is the argument. A problem somebody has been carrying for months outranks
        today's list, because today's list is this month's numbers and this is the thing that will
        still be here next year if nobody names it. It is also the same box the front door offers a
        stranger — so a problem raised before anybody had an account lands in exactly this list.
      */}
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <ImprovementBox canWrite={canWrite} read={hasDiagnosis(tier)} />
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
              <h2 className="font-serif text-xl text-ink">
                {advanced ? 'Numbers arriving on their own' : 'Where your numbers come from'}
              </h2>
              <span className="text-sm text-ink-light">
                {advanced
                  ? `${live.length} of ${feeds.length} ${feeds.length === 1 ? 'system' : 'systems'} connected`
                  : 'SPEC Basic'}
              </span>
            </div>
            {!advanced ? (
              <>
                <p className="mt-3 text-sm text-ink-light">
                  You are on SPEC Basic, so every number on your card is entered by hand and carries the
                  name of whoever confirmed it. That is a complete way to run SPEC — no feature anywhere
                  needs a connector — and it is the only honest option while a number has no system behind it.
                </p>
                <Link href="/pricing" className="mt-4 inline-block text-sm text-rust-700 hover:underline">
                  What SPEC Advanced adds →
                </Link>
              </>
            ) : feeds.length ? (
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
                      {f.lastSyncAt && ` · last read ${f.lastSyncAt.slice(0, 10)}`}
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
            {advanced && (
              <Link href="/setup/systems" className="mt-4 inline-block text-sm text-rust-700 hover:underline">
                Manage what SPEC reads →
              </Link>
            )}
          </section>
        </div>

        <div className="grid gap-6">

          <section className="rounded-lg bg-sage-100 p-4">
            <h2 className="font-serif text-xl text-ink">Ask anything</h2>
            {advanced ? (
              <AskPanel rows={myRows} score={myScore} meetingLogged={meetingLogged} />
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-light">
                  Asking comes with SPEC Advanced. On Basic the page still tells you everything it knows —
                  every light above carries the reason underneath it — there is just nothing here to ask.
                </p>
                <Link href="/pricing" className="mt-4 inline-block text-sm text-rust-700 hover:underline">
                  See what Advanced adds →
                </Link>
              </>
            )}
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
              <a href="https://outlook.office.com/mail/" className="btn-ghost" target="_blank" rel="noreferrer noopener">Open Outlook</a>
              <a href="https://mail.google.com/" className="btn-ghost" target="_blank" rel="noreferrer noopener">Open Gmail</a>
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

      <p className="mt-10 max-w-xl text-base text-ink-light">That is the whole day. Nothing else to open.</p>
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
