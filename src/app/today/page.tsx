import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { TodoList, AskPanel, ChangeList, MeetingLog, TrainingPath } from '@/components/today-blocks';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById, PILLARS } from '@/lib/queries';
import { getToday } from '@/lib/today-data';
import { light, pillarNote, clearToWork, LIGHT_COLOUR, LIGHT_LABEL, type Light } from '@/lib/today';
import type { Pillar, RoleScore } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

/**
 * SPEC Today — the page everybody in the business opens first.
 *
 * The whole day, in the order a person needs it: their four lights, what needs them, the roles
 * reporting to them, the numbers arriving from the systems they have connected, somewhere to ask,
 * what has changed under them, and where their compliance stands. Every block is read from what the
 * business has actually recorded, so a business that has just started sees a short honest page
 * rather than a full one made of nothing.
 */
export default async function Today() {
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
      <Shell title={`Good morning, ${firstName}.`} subtitle={`${today} · your SPEC sheet for the day`}>
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
  // A supervisor's reports are on the tools, not running scorecards of their own. Calling that
  // "my team" is the language of an office; "my crew" is what they actually say.
  const crew = team.length > 0 && team.every(m => !m.scored);
  const compliance = clearToWork(myRows);
  const live = feeds.filter(f => f.status === 'live');

  return (
    <Shell
      title={`Good morning, ${firstName}.`}
      subtitle={`${today} · your SPEC sheet for the day · ${data.myRole.title} at ${tenant.name}`}
    >
      <p className="-mt-4 mb-8 max-w-2xl text-sm text-ink-light">
        {scored
          ? standing(todos.length, myScore)
          : 'Checklist view · this role is not individually scored. You keep people safe, log your hours and finish your training; the numbers are carried by the role above you.'}
      </p>

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

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <section className="card">
            <h2 className="font-serif text-xl text-ink">What needs me today</h2>
            <TodoList items={todos} />
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
              <p className="mt-3 text-sm text-ink-light">
                Nobody reports to you, so there is nothing to roll up. Your own card is the whole of your month.
              </p>
            )}
            <p className="mt-4 text-xs text-ink-light">
              {reportsTo
                ? `You report to the ${reportsTo.title}. Your card rolls into theirs.`
                : 'You are the top of the chart. Everything below rolls into your card.'}
            </p>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Numbers arriving on their own</h2>
              <span className="text-sm text-ink-light">
                {live.length} of {feeds.length} {feeds.length === 1 ? 'system' : 'systems'} connected
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
            <Link href="/setup/systems" className="mt-4 inline-block text-sm text-rust-700 hover:underline">
              Manage what SPEC reads →
            </Link>
          </section>
        </div>

        <div className="grid gap-6">
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

          <section className="rounded-lg bg-sage-100 p-4">
            <h2 className="font-serif text-xl text-ink">Ask anything</h2>
            <AskPanel rows={myRows} score={myScore} meetingLogged={meetingLogged} />
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Changes you should know about</h2>
              <span className="text-sm text-ink-light">{changes.length} {changes.length === 1 ? 'item' : 'items'}</span>
            </div>
            <ChangeList items={changes} />
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Messages</h2>
            <p className="mt-2 text-sm text-ink-light">
              SPEC does not carry your mail. Nothing with business content in it is ever sent, attached or
              linked — the month is read here, in SPEC, by whoever is entitled to see it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="https://outlook.office.com/mail/" className="btn-ghost" target="_blank" rel="noreferrer noopener">Open Outlook</a>
              <a href="https://mail.google.com/" className="btn-ghost" target="_blank" rel="noreferrer noopener">Open Gmail</a>
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Weekly meeting</h2>
              <span className="text-sm text-ink-light">{meetingLogged ? 'Logged for this week' : 'Not logged yet'}</span>
            </div>
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
            <TrainingPath path={training.path} progress={training.progress} signoff={training.signoff} />
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
