import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell, PILLAR_META, pct } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { getMeeting } from '@/lib/meeting-data';
import { LIGHT_COLOUR, light, pillTone } from '@/lib/today';
import { PILLARS } from '@/lib/scoring';
import { addAction, completeAction, addDecision, toggleAttendee, logMeeting } from './actions';
import { Problems } from '@/components/problems';

export const dynamic = 'force-dynamic';

const TONE = { red: LIGHT_COLOUR.red, amber: LIGHT_COLOUR.amber, grey: LIGHT_COLOUR.pending } as const;

/**
 * The weekly senior meeting.
 *
 * Twenty minutes, three items, written down. The agenda is generated from the month as it stands,
 * before the meeting rather than after, so the room argues about the business instead of about what
 * should be on the list.
 */
export default async function WeeklyMeeting() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const data = await getMeeting(user);

  const when = new Date(`${data.weekOf}T00:00:00Z`)
    .toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  if (!data.period) {
    return (
      <Shell title="Weekly meeting" subtitle={when}>
        <div className="callout max-w-2xl">
          <div className="font-serif text-lg text-ink">The agenda is written from your numbers</div>
          <p className="mt-1 text-sm text-ink-light">
            It fills in as soon as a role has its KPIs, because every item on it is a number that moved,
            something overdue, or a role nobody holds. Until then there is nothing to generate it from.
          </p>
          <Link href="/setup/kpis" className="btn-primary mt-4 inline-block">Set the KPIs</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`Weekly meeting · ${when}`} subtitle="Twenty minutes, three items, written down.">
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6">
          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">This week&rsquo;s three</h2>
              <span className="text-sm text-ink-light">
                {data.more > 0 ? `${data.more} more below the cut` : 'Generated from the data'}
              </span>
            </div>
            {data.agenda.length ? (
              <ul className="mt-4 grid gap-3">
                {data.agenda.map(a => (
                  <li key={a.id} className="rounded-lg bg-cream p-4" style={{ borderLeft: `4px solid ${TONE[a.tone]}` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="pill" style={pillTone(a.tone)}>
                        {a.state}
                      </span>
                      <span className="label-caps">{a.pillar ? PILLAR_META[a.pillar].name : 'Every pillar'}</span>
                    </div>
                    <Link href={a.href} className="mt-2 block font-serif text-lg text-ink hover:text-rust">{a.title}</Link>
                    <p className="mt-1 text-sm text-ink-light">{a.detail}</p>
                    <p className="mt-2 text-xs text-ink-light">
                      {a.owner ? `Owned by ${a.owner}.` : 'Nobody owns this yet — that is the first thing to settle.'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-light">
                Nothing needs the room this week. No pillar fell, nothing is overdue, every miss has a
                reason written against it and every role reporting in has somebody in it. Log the meeting
                and keep the rhythm.
              </p>
            )}
            {data.more > 0 && (
              <p className="mt-3 text-xs text-ink-light">
                {data.more} other {data.more === 1 ? 'item is' : 'items are'} outstanding and did not fit the
                three. They are still on the scorecards — nothing is dropped from a total without saying so.
              </p>
            )}
          </section>

          {data.carried.length > 0 && (
            <section className="card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-xl text-ink">Carried from before</h2>
                <span className="text-sm text-ink-light">{data.carried.length} still open</span>
              </div>
              <ul className="mt-4 grid gap-2">
                {data.carried.map(a => (
                  <li key={a.id} className="card-inset flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{a.text}</span>
                      <span className="mt-0.5 block text-xs text-ink-light">
                        {a.owner} · carried from {a.from}
                        {a.weeks >= 3 && ' · three weeks carried is a decision nobody has made'}
                      </span>
                    </span>
                    {data.canManage && (
                      <form action={completeAction}>
                        <input type="hidden" name="actionId" value={a.id} />
                        <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pending="…">Done</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Actions</h2>
              <span className="text-sm text-ink-light">{data.actions.filter(a => !a.done).length} open this week</span>
            </div>
            {data.actions.length > 0 && (
              <ul className="mt-4 grid gap-2">
                {data.actions.map(a => (
                  <li key={a.id} className="card-inset flex flex-wrap items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className={`block text-sm ${a.done ? 'text-ink-light line-through' : 'text-ink'}`}>{a.text}</span>
                      <span className="mt-0.5 block text-xs text-ink-light">
                        {a.owner}{a.due && ` · due ${a.due}`}{a.pillar && ` · ${PILLAR_META[a.pillar].name}`}
                      </span>
                    </span>
                    {data.canManage && (
                      <form action={completeAction}>
                        <input type="hidden" name="actionId" value={a.id} />
                        <SubmitButton className="btn-secondary px-3 py-1.5 text-xs" pending="…">
                          {a.done ? 'Reopen' : 'Done'}
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.canManage ? (
              <form action={addAction} className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                <input className="input" name="text" required placeholder="What is being done" aria-label="Action" />
                <input className="input" name="owner" required list="meeting-roster" placeholder="Who owns it" aria-label="Owner" />
                <SubmitButton className="btn-primary shrink-0" pending="Adding…">Add the action</SubmitButton>
                <datalist id="meeting-roster">
                  {data.roster.filter(r => r.person).map(r => <option key={r.roleId} value={r.person!} />)}
                </datalist>
              </form>
            ) : (
              <p className="mt-3 text-xs text-ink-light">Whoever runs the meeting writes the actions.</p>
            )}
            <p className="mt-3 text-xs text-ink-light">
              Every action carries a name. One without an owner is a wish, and it is what makes a meeting
              go nowhere.
            </p>
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Decisions</h2>
            <p className="mt-1 text-sm text-ink-light">
              Dated and attributed, because a decision outlives the week it was made in.
            </p>
            {data.decisions.length > 0 && (
              <ul className="mt-4 grid gap-2">
                {data.decisions.map((d, i) => (
                  <li key={`${d.at}-${i}`} className="card-inset">
                    <p className="text-sm text-ink">{d.text}</p>
                    <p className="mt-1 text-xs text-ink-light">{d.who} · {d.at}</p>
                  </li>
                ))}
              </ul>
            )}
            {data.canManage && (
              <form action={addDecision} className="mt-4 flex flex-wrap gap-2">
                <input className="input flex-1" name="text" required placeholder="What was decided" aria-label="Decision" />
                <SubmitButton className="btn-primary shrink-0" pending="Recording…">Record it</SubmitButton>
              </form>
            )}
          </section>
        </div>

        <div className="grid gap-6">
          <section className="rounded-lg bg-sage-100 p-4">
            <h2 className="font-serif text-xl text-ink">The read on the week</h2>
            <p className="mt-1 text-xs text-ink-light">Written from the data before the meeting, not after it.</p>
            <div className="mt-4 grid gap-3">
              {data.read.map(r => (
                <div key={r.kicker}>
                  <div className="label-caps">{r.kicker}</div>
                  <p className="mt-1 text-sm text-ink">{r.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">In the room</h2>
              <span className="text-sm text-ink-light">{data.attendees.length} of {data.roster.filter(r => r.person).length}</span>
            </div>
            <ul className="mt-3 grid gap-2">
              {data.roster.filter(r => r.person).map(r => {
                const here = data.attendees.includes(r.person!);
                return (
                  <li key={r.roleId}>
                    {data.canManage ? (
                      <form action={toggleAttendee}>
                        <input type="hidden" name="person" value={r.person!} />
                        <button
                          type="submit"
                          className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${here ? 'bg-sage-100' : 'bg-cream hover:bg-surface'}`}
                        >
                          <span
                            className="grid h-5 w-5 shrink-0 place-content-center rounded-full text-[10px]"
                            style={{ background: here ? LIGHT_COLOUR.green : 'transparent', color: here ? '#f5ead8' : 'transparent', boxShadow: here ? 'none' : 'inset 0 0 0 1px rgba(32,30,29,.25)' }}
                          >✓</span>
                          <span className="min-w-0">
                            <span className="block text-sm text-ink">{r.person}</span>
                            <span className="block text-xs text-ink-light">{r.title}</span>
                          </span>
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-3 rounded-lg bg-cream p-2">
                        <span className="text-sm text-ink">{r.person}</span>
                        <span className="text-xs text-ink-light">{r.title}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Where the team sits today</h2>
            <ul className="mt-3 grid gap-2">
              {data.team.map(t => (
                <li key={t.roleId} className="card-inset flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/scorecard/${t.roleId}`} className="group min-w-0">
                    <span className="block font-serif text-base text-ink group-hover:text-rust">{t.title}</span>
                    <span className="block text-xs text-ink-light">{t.holder ?? 'Nobody in this role'}</span>
                  </Link>
                  {t.scored ? (
                    <span className="flex gap-1.5">
                      {PILLARS.map(p => (
                        <span
                          key={p}
                          title={`${PILLAR_META[p].name} ${pct(t.score.pillars[p])}`}
                          className="block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: LIGHT_COLOUR[light(t.score.pillars[p])] }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-light">Checklist role</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">Log it</h2>
              <span className="text-sm text-ink-light">{data.logged ? 'Logged for this week' : 'Not logged yet'}</span>
            </div>
            {data.canManage ? (
              <form action={logMeeting} className="mt-3 grid gap-2">
                <textarea
                  className="input min-h-[80px] rounded-lg"
                  name="minutes"
                  placeholder="Anything the actions and decisions above do not already say"
                  aria-label="Minutes"
                />
                <SubmitButton className="btn-primary" pending="Logging…">Log this week&rsquo;s meeting</SubmitButton>
              </form>
            ) : (
              <p className="mt-3 text-sm text-ink-light">Whoever runs the meeting logs it.</p>
            )}
            <p className="mt-3 text-xs text-ink-light">Logging the meeting is what keeps the month scoreable.</p>
          </section>

          <section className="card">
            <h2 className="font-serif text-xl text-ink">Meeting history</h2>
            <ul className="mt-3 grid gap-2">
              {data.history.map(w => (
                <li key={w.weekOf} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/10 pb-2 last:border-0">
                  <span className="text-sm text-ink">{w.weekOf}</span>
                  <span className="text-xs" style={{ color: w.logged ? LIGHT_COLOUR.green : LIGHT_COLOUR.red }}>
                    {w.logged ? 'Logged' : 'Not logged'}
                  </span>
                  <span className="w-full text-xs text-ink-light">{w.note}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      <Problems screen="meeting" />

    </Shell>
  );
}
