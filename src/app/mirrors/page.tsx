import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import { getCurrentUser } from '@/lib/auth';
import {
  BOARD_TYPES, BOARDS_INTRO, EMPTY_BOARD, NOTHING_PINNED, STEP_STATE,
  cardLabel, feedLabel, initials, kindOf, stepStateOf, visible, type BoardKind,
} from '@/lib/boards-live';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getScope } from '@/lib/scope';
import { listBoards, getBoard, markViewing, mirrorKpisFor } from '@/lib/boards-live-data';
import { kpiStanding, kpiGap, kpiWorking } from '@/lib/mirror-kpis';
import { LIGHT_COLOUR } from '@/lib/today';
import { newBoard, sayOnBoard, putKpiOnBoard, takeKpiOffBoard, moveStepOnBoard, addStepToBoard } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Boards — the live artifacts a team pins, builds on and discusses.
 *
 * Kris, 16 September: *"no build these boards (artifacts) now - this is a key component of running
 * the business properly"*. Design export 3, `SPEC Boards.dc.html`.
 *
 * ── What this is, against everything else in SPEC ────────────────────────────────────────────────
 *
 * Every other screen is SPEC's reading of the business. A board is the business's own artifact: the
 * thing a team makes together and comes back to. The worked example in the design is the argument
 * for the whole feature — a Rate Board whose inputs come from the systems the business already runs,
 * landing on a sell rate of $105 instead of $115, so the disagreement is had against actuals rather
 * than against somebody's memory of what the rate used to be.
 *
 * ── Two decisions worth knowing ──────────────────────────────────────────────────────────────────
 *
 * **Grid and detail are one page, not two.** The address carries which board is open, so a board can
 * be linked to — which is most of what "shareable" means for a team that lives in a group chat. Two
 * routes would have made the back button do something different from "← All boards".
 *
 * **Live is derived, never stored.** A board is badged live when the systems it names are connected
 * AND working. If one of two feeds has broken, it is not live and the page says which — because
 * "partly current" reads as "current" on a screen, and this is exactly the screen where somebody is
 * about to make a decision about money.
 */
export default async function Boards({ searchParams }: {
  searchParams: Promise<{ board?: string; type?: string; needs?: string; period?: string; cannot?: string; full?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;

  if (sp.board) {
    const board = await getBoard(user.tenantId, sp.board);
    if (!board) redirect('/mirrors');
    // Being here is what puts you in "Editing now" for the next five minutes.
    await markViewing(user.tenantId, board.id, user.id).catch(() => {});

    /*
      ── What makes this a live thing rather than a printout ──────────────────────────────────

      Kris, 19 September: mirrors should work *"same as Artifacts in claude"* — *"live and
      interactive, not a report"* — and *"align to key kpi's in the business"*.

      Every figure on a mirror used to be text stored when somebody made it, under a badge that
      said **Live**. The badge was true about the CONNECTION and said nothing about the numbers,
      which had never once been recalculated.

      The months are read here and the chosen one decides what the KPI lines say. Change the month
      and the mirror changes: nothing is cached, nothing is copied, and there is no version of
      these numbers that can be out of date, because the mirror does not hold any.
    */
    const scope = await getScope(user);
    const months = await db.select().from(schema.periods)
      .where(eq(schema.periods.tenantId, user.tenantId))
      .orderBy(desc(schema.periods.period));
    const chosen = months.find(m => m.period === sp.period) ?? months[0] ?? null;
    const { kpis, hidden } = await mirrorKpisFor({
      tenantId: user.tenantId,
      rows: board.rows,
      periodId: chosen?.id ?? null,
      periodLabel: chosen?.period ?? null,
      visible: scope.visible,
    });
    /*
      What this person could add, and nothing else. `canSee` is the same rule the scorecards use —
      a mirror is shared, so offering a measure from outside somebody's part of the chart would be
      a way to publish another team's numbers into a room they never agreed to be in.
    */
    const mine = scope.roles.filter(r => scope.canSee(r.id));
    const addable = mine.length
      ? (await db.select().from(schema.criteria)
          .where(and(
            inArray(schema.criteria.roleId, mine.map(r => r.id)),
            eq(schema.criteria.active, true),
            eq(schema.criteria.kpi, true),
          )))
        .filter(c => !kpis.some(k => k.criterionId === c.id))
      : [];
    const titleOf = new Map(mine.map(r => [r.id, r.title]));

    /*
      ── A mirror is an OBJECT, not a page of cards ─────────────────────────────────────────────

      Kris, 19 September, after the numbers were made live: *"still doesn't look and feel like an
      artifact"*. He was right, and it was the half I had not done.

      What an artifact IS, as a thing on a screen: one framed surface with its own header — its
      name, what kind of thing it is, when it last moved, who is in it — and its controls in that
      header rather than scattered down the page. It can be opened on its own, full width, with the
      product's own furniture out of the way. Everything inside it is one continuous document
      divided by hairlines, not five floating cards that happen to be near each other.

      The old version was the product's page chrome wrapped around a stack of `.card`s. It read as
      a REPORT ABOUT a mirror. This reads as the mirror.

      `?full=1` drops the app shell entirely. Not a gimmick: a mirror is the thing a team puts on
      the wall in a meeting, and a navigation bar and a page title are exactly what nobody in that
      room needs.
    */
    const full = sp.full === '1';
    const frame = (
      <article className="overflow-hidden rounded-2xl border border-ink/12 bg-surface-raised shadow-[0_1px_2px_rgba(32,30,29,.05),0_18px_40px_-28px_rgba(32,30,29,.45)]">
        {/* The header bar: what this is, and everything you can do to it. */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink/10 bg-cream px-5 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-xl leading-tight text-ink">{board.title}</h1>
            <p className="mt-0.5 text-xs text-ink-light">
              {cardLabel(board.kind)}
              {board.meta ? ` · ${board.meta}` : ''}
              {board.editingNow.length > 0 ? ` · ${board.editingNow.join(', ')} here now` : ''}
            </p>
          </div>

          {months.length > 0 && (
            <form className="flex items-center gap-2">
              <input type="hidden" name="board" value={board.id} />
              {full && <input type="hidden" name="full" value="1" />}
              <label className="sr-only" htmlFor="mirror-period">Month</label>
              <select
                id="mirror-period"
                name="period"
                defaultValue={chosen?.period ?? ''}
                className="min-h-[36px] rounded-md border border-ink/15 bg-surface-raised px-2.5 py-1.5 text-sm text-ink"
              >
                {months.map(m => (
                  <option key={m.id} value={m.period}>
                    {m.period}{m.status === 'locked' ? ' — closed' : ''}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn-secondary px-3 py-1.5 text-xs">Show that month</SubmitButton>
            </form>
          )}

          <Link
            href={`/mirrors?board=${board.id}${chosen ? `&period=${chosen.period}` : ''}${full ? '' : '&full=1'}`}
            className="rounded-md border border-ink/15 px-3 py-1.5 text-xs text-ink-light hover:text-rust"
          >
            {full ? 'Back in SPEC' : 'Open on its own'}
          </Link>
        </header>

        <div className="grid items-start gap-0 lg:grid-cols-[1.6fr_1fr] lg:divide-x lg:divide-ink/10">
          <div className="grid gap-0 divide-y divide-ink/10">
            {/*
              ── The month this mirror is being read in ──────────────────────────────────────

              The control that makes a mirror a live thing rather than a printout. Every KPI line
              below is read against whichever month is chosen — change it and they all change,
              because none of them is a stored number.

              Only months the business actually has. Offering one that was never opened would be
              inviting somebody into an empty room and letting them conclude the numbers are gone.
            */}

            {/*
              The business's own KPIs, read live. This is the half Kris asked for: a mirror that
              "aligns to key kpi's in the business" and helps somebody decide, rather than a page of
              figures that were true once.
            */}
            {/* Named so a check can read the live lines themselves rather than the whole page —
                the picker below lists every measure by name, and a check scanning the document
                cannot tell a line that is DRAWN from an option in a dropdown. */}
            <section className="p-5" data-mirror-kpis>
              <h2 className="font-serif text-xl text-ink">What this mirror is measured on</h2>
              {kpis.length === 0 ? (
                <p className="mt-2 text-sm text-ink-light">
                  No measures on this mirror yet. Add one below and it will be read live every time
                  anybody opens this &mdash; for whichever month they are looking at.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3" data-mirror-lines>
                  {kpis.map(k => {
                    const standing = kpiStanding(k);
                    const colour = standing.tone === 'green' ? LIGHT_COLOUR.green
                      : standing.tone === 'red' ? LIGHT_COLOUR.red
                      : LIGHT_COLOUR.pending;
                    return (
                      <li key={k.criterionId} className="rounded-xl bg-cream p-4">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream"
                            style={{ background: colour }}
                          >
                            {standing.label}
                          </span>
                          <b className="text-sm text-ink">{k.text}</b>
                          <span className="text-xs text-ink-light">
                            {k.roleTitle} &middot; {k.pillar}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-ink">{kpiWorking(k)}</p>
                        <p className="mt-0.5 text-sm text-ink-light">{kpiGap(k)}</p>
                        <form action={takeKpiOffBoard} className="mt-2">
                          <input type="hidden" name="boardId" value={board.id} />
                          <input type="hidden" name="criterionId" value={k.criterionId} />
                          <SubmitButton className="text-xs text-ink-light underline hover:text-rust">
                            Take it off this mirror
                          </SubmitButton>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/*
                Somebody's own numbers can be on a mirror; somebody else's cannot. Said out loud
                rather than silently dropped — a mirror that shows a different number of lines to
                different people, without saying so, is its own argument waiting to happen.
              */}
              {hidden > 0 && (
                <p className="mt-3 text-xs text-ink-light">
                  {hidden} {hidden === 1 ? 'measure is' : 'measures are'} on this mirror from a part
                  of the chart you cannot see, so {hidden === 1 ? 'it is' : 'they are'} not shown.
                </p>
              )}

              {addable.length > 0 && (
                <form action={putKpiOnBoard} className="mt-4 flex flex-wrap items-end gap-2 border-t border-rust-200 pt-4">
                  <input type="hidden" name="boardId" value={board.id} />
                  <div className="min-w-[240px] flex-1">
                    <label className="label-caps" htmlFor="mirror-kpi">Add one of your measures</label>
                    <select
                      id="mirror-kpi"
                      name="criterionId"
                      className="mt-1 min-h-[40px] w-full rounded-md border border-ink/15 bg-cream px-3 py-2 text-sm text-ink"
                    >
                      {addable.map(c => (
                        <option key={c.id} value={`${c.id}|${c.roleId}`}>
                          {titleOf.get(c.roleId)} &mdash; {c.text}
                        </option>
                      ))}
                    </select>
                  </div>
                  <SubmitButton className="btn-secondary">Put it on the mirror</SubmitButton>
                </form>
              )}
            </section>

            {board.feeds.length > 0 && (
              <section className="p-5">
                <div className="flex flex-wrap gap-2">
                  {board.feeds.map(f => (
                    <span
                      key={f.system}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        board.missingFeeds.includes(f.system)
                          ? 'bg-rust-100 text-rust-800'
                          : 'bg-sage-200 text-sage-900'
                      }`}
                    >
                      {feedLabel(f)}
                    </span>
                  ))}
                </div>
                {board.missingFeeds.length > 0 && (
                  /* Named, not hidden. A board that has quietly stopped updating is worse than one
                     that never claimed to, because somebody will decide against it. */
                  <p className="mt-3 text-sm text-rust-800">
                    Not live right now — {board.missingFeeds.join(' and ')}{' '}
                    {board.missingFeeds.length === 1 ? 'is' : 'are'} not connected and working, so the
                    numbers below are the last ones anybody put here.
                  </p>
                )}
              </section>
            )}

            {board.headline && (
              <section className="p-5">
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <div className="label-caps">{board.headline.wasLabel}</div>
                    <div className="mt-1 font-serif text-3xl text-ink-light line-through">{board.headline.was}</div>
                  </div>
                  <div className="pb-2 text-2xl text-ink-light" aria-hidden>&rarr;</div>
                  <div>
                    <div className="label-caps">{board.headline.nowLabel}</div>
                    <div className="mt-1 font-serif text-4xl text-ink">{board.headline.now}</div>
                  </div>
                </div>
                {board.headline.note && (
                  <p className="mt-4 max-w-[52ch] text-sm text-ink-light">{board.headline.note}</p>
                )}
              </section>
            )}

            {/*
              The lines somebody TYPED, kept apart from the ones that are read live.

              Both belong on a mirror — a rate built from a supplier's quote is a real number that
              no system of SPEC's produces. What would be wrong is drawing them identically, so that
              a figure entered in June and a figure read this morning look like the same kind of
              claim on the screen a business argues in front of.
            */}
            {board.rows.filter(r => !r.criterionId).length > 0 && (
              <section className="p-5">
                <h2 className="font-serif text-xl text-ink">Entered by hand</h2>
                <p className="mt-1 text-sm text-ink-light">
                  These were typed in and stay as they were until somebody changes them. They are
                  not read from anywhere.
                </p>
                <table className="table-clean mt-4 w-full">
                  <thead>
                    <tr><th>Rate input</th><th>Source</th><th className="text-right">Value</th></tr>
                  </thead>
                  <tbody>
                    {board.rows.filter(r => !r.criterionId).map(r => (
                      <tr key={r.label}>
                        <td className="text-ink">{r.label}</td>
                        <td className="text-ink-light">{r.source}</td>
                        <td className="text-right font-mono text-ink">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/*
              A plan mirror always has a plan, even before anybody has written a step on it.

              The add-a-step form used to live INSIDE this section, which was only drawn when steps
              already existed — so a mirror created as a plan could never become one. The first thing
              somebody does with a new plan is add the first step, and that was the one thing they
              could not do.
            */}
            {(board.steps.length > 0 || board.kind === 'plans') && (
              /* Named so the rule "a plan is never scored with a percentage" can be checked against
                 the plan itself rather than against everything else on the page. */
              <section className="p-5" data-plan-steps>
                <p className="text-sm text-ink-light">
                  What needs fixing, and who&rsquo;s doing it — the plan the team climbs together.
                </p>
                {/*
                  ── A plan you can move, in the meeting you are moving it in ──────────────────

                  Kris, 19 September: *"so the King of the Mountain mirror must be interactive"*.

                  This was a printed list. The states were right there in the business's own words
                  and the only way to change one was to edit a row of JSON, so the thing a team
                  looks at together could not be changed together — at the one moment it is worth
                  changing.

                  Still no number. A plan carrying "60% done" becomes a number people manage rather
                  than work they do, which is why the states are words and why the journey holds
                  this section to having no percentage in it at all.
                */}
                {board.steps.length === 0 && (
                  <p className="mt-3 text-sm text-ink-light">
                    Nothing on this plan yet. The first step is usually the one everybody already
                    knows about.
                  </p>
                )}
                <ul className="mt-4 space-y-3">
                  {board.steps.map((s, i) => {
                    const here = stepStateOf(s.state);
                    const state = STEP_STATE[here];
                    return (
                      <li key={i} className="rounded-xl bg-cream p-3 text-sm">
                        <div className="flex items-start gap-3">
                          <span
                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: state.colour }}
                            aria-hidden
                          />
                          <span className="flex-1 text-ink">{s.text}</span>
                          <span className="shrink-0 text-xs text-ink-light">{s.owner} · {state.label}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                          {(Object.keys(STEP_STATE) as (keyof typeof STEP_STATE)[]).map(key => (
                            <form action={moveStepOnBoard} key={key}>
                              <input type="hidden" name="boardId" value={board.id} />
                              <input type="hidden" name="text" value={s.text} />
                              <input type="hidden" name="state" value={key} />
                              <SubmitButton
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  key === here
                                    ? 'text-cream'
                                    : 'bg-surface text-ink-light hover:text-ink'
                                }`}
                                style={key === here ? { background: STEP_STATE[key].colour } : undefined}
                              >
                                {STEP_STATE[key].label}
                              </SubmitButton>
                            </form>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <form action={addStepToBoard} className="mt-4 flex flex-wrap items-end gap-2 border-t border-rust-200 pt-4">
                  <input type="hidden" name="boardId" value={board.id} />
                  <div className="min-w-[220px] flex-1">
                    <label className="label-caps" htmlFor="plan-step">Add a step</label>
                    <input
                      id="plan-step"
                      name="text"
                      className="mt-1 min-h-[40px] w-full rounded-md border border-ink/15 bg-cream px-3 py-2 text-sm text-ink"
                      placeholder="What needs fixing"
                    />
                  </div>
                  <div className="w-[160px]">
                    <label className="label-caps" htmlFor="plan-owner">Who</label>
                    <input
                      id="plan-owner"
                      name="owner"
                      className="mt-1 min-h-[40px] w-full rounded-md border border-ink/15 bg-cream px-3 py-2 text-sm text-ink"
                      placeholder={user.name}
                    />
                  </div>
                  <SubmitButton className="btn-secondary">Add it</SubmitButton>
                </form>
              </section>
            )}

            {!board.rows.length && !board.steps.length && !board.headline && (
              <section className="p-5">
                <p className="text-sm text-ink-light">
                  {board.summary ? `${board.summary} ` : ''}{EMPTY_BOARD}
                </p>
              </section>
            )}
          </div>

          <div className="grid gap-0 divide-y divide-ink/10">
            <section className="p-5">
              <h2 className="label-caps">Editing now</h2>
              {board.editingNow.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {board.editingNow.map(name => (
                    <span
                      key={name}
                      title={name}
                      className="grid h-8 w-8 place-content-center rounded-full bg-surface text-xs font-semibold text-ink"
                    >
                      {initials(name)}
                    </span>
                  ))}
                </div>
              ) : (
                /* Nobody, said plainly. A row of faces that are not really there would be a lie the
                   screen is telling, on the one page where two people are about to disagree. */
                <p className="mt-2 text-sm text-ink-light">Just you, right now.</p>
              )}
            </section>

            <section className="p-5">
              <h2 className="font-serif text-xl text-ink">Discussion</h2>
              {board.comments.length === 0 && (
                <p className="mt-2 text-sm text-ink-light">
                  Nothing said yet. This is where the argument about the numbers above belongs, so the
                  next person to ask finds it next to the answer.
                </p>
              )}
              <ul className="mt-3 space-y-3">
                {board.comments.map(c => (
                  <li key={c.id} className="rounded-lg bg-cream p-3 text-sm">
                    <div className="label-caps">{c.authorName}</div>
                    <p className="mt-1 text-ink">{c.text}</p>
                  </li>
                ))}
              </ul>
              <form action={sayOnBoard} className="mt-4">
                <input type="hidden" name="boardId" value={board.id} />
                <textarea
                  name="text"
                  rows={3}
                  placeholder="Say something about this board"
                  className="w-full rounded-lg border border-ink/20 p-3 text-sm"
                />
                <SubmitButton className="btn-secondary mt-2 text-sm" pending="Posting…">Post</SubmitButton>
              </form>
            </section>
          </div>
        </div>
      </article>
    );

    /*
      Full screen is the mirror and nothing else — no navigation, no page title, no footer. The one
      way back is in the frame's own header, which is where every other control for this object is.
    */
    if (full) {
      return (
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Refused reason={refusedReason(sp)} />
          {frame}
        </main>
      );
    }

    return (
      /*
        The page is "Mirrors"; the OBJECT carries its own name, in its own header.

        Both printed the title, so the screen said "King of the Mountain — Solar Fix Plan" twice,
        two inches apart, in two different sizes. That is the clearest tell that something is a
        report ABOUT a thing rather than the thing.
      */
      <Shell title="Mirrors" subtitle="">
        <Link href="/mirrors" className="text-sm text-rust-700 hover:underline">&larr; All mirrors</Link>
        <Refused reason={refusedReason(sp)} />
        <div className="mt-4">{frame}</div>
      </Shell>
    );
  }

  const all = await listBoards(user.tenantId);
  const filter: BoardKind | null = sp.type ? kindOf(sp.type) : null;
  const shown = visible(all, filter);

  return (
    <Shell title="Mirrors" headline="Mirrors" subtitle={BOARDS_INTRO}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/mirrors"
          className={`rounded-full px-4 py-2 text-sm ${!filter ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}
        >
          All
        </Link>
        {BOARD_TYPES.map(t => (
          <Link
            key={t.id}
            href={`/mirrors?type=${t.id}`}
            className={`rounded-full px-4 py-2 text-sm ${filter === t.id ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {all.length === 0 && <p className="mt-6 max-w-[62ch] text-sm text-ink-light">{NOTHING_PINNED}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(b => (
          <Link key={b.id} href={`/mirrors?board=${b.id}`} className="card transition-colors hover:border-rust/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-cream px-2 py-0.5 text-xs font-medium text-ink-light">{cardLabel(b.kind)}</span>
              {/*
                "Updating now", not "Live data" — because the type label beside it already says
                "Live data" for a live-data board, and two pills with identical words is a card that
                cannot tell you the difference between what a board IS and whether it is CURRENT.
                Found by a browser check that could not tell them apart either.
              */}
              {b.live && (
                <span className="rounded bg-sage-200 px-2 py-0.5 text-xs font-medium text-sage-900">Updating now</span>
              )}
            </div>
            <h2 className="mt-3 font-serif text-lg text-ink">{b.title}</h2>
            <p className="mt-1 text-sm text-ink-light">{b.summary}</p>
            <div className="mt-4 flex items-center gap-2">
              {b.editors.slice(0, 3).map(name => (
                <span
                  key={name}
                  title={name}
                  className="grid h-7 w-7 place-content-center rounded-full bg-cream text-[11px] font-semibold text-ink"
                >
                  {initials(name)}
                </span>
              ))}
              <span className="ml-auto text-xs text-ink-light">{b.meta}</span>
            </div>
          </Link>
        ))}
      </div>

      <section className="card mt-8 max-w-2xl">
        <h2 className="font-serif text-xl text-ink">New mirror</h2>
        {sp.needs === 'title' && (
          <p className="mt-2 text-sm text-rust-800">It needs a name — a board nobody can find again is not one.</p>
        )}
        <form action={newBoard} className="mt-3 grid gap-2">
          <input name="title" placeholder="What is this board about?" autoComplete="off" className="input" />
          <select name="kind" className="input" defaultValue="improve">
            {BOARD_TYPES.map(t => <option key={t.id} value={t.id}>{t.card}</option>)}
          </select>
          <input name="summary" placeholder="One line, so the card says something (optional)" autoComplete="off" className="input" />
          <SubmitButton className="btn-primary justify-self-start" pending="Creating…">+ New mirror</SubmitButton>
        </form>
      </section>

      {/*
        Conversation boards kept their own door rather than being folded in here.

        They share a word and nothing else: this page is the business's own artifacts, and that one
        is SPEC's reading OF the business — a mirror built to raise one question and reach no
        verdict. Merging them would have quietly lost the difference.
      */}
      {/*
        Two things called some version of "board", said out loud rather than left to be worked out.
        Kris, 17 September: the Board is the governing group; boards are the artifacts.
      */}
      <p className="mt-8 max-w-[62ch] text-sm text-ink-light">
        These are <b className="text-ink">boards</b> — the artifacts your team pins and runs projects
        through. <b className="text-ink">The Board</b> is the governing group: its{' '}
        <Link href="/charter" className="text-rust-700 underline">charter</Link>, its pack and its
        meeting are elsewhere, and nothing here is reported to it unless somebody puts it there.
        {/* The pack is not linked: it lives per closed month at /board/[periodId], so there is no
            one address for it, and a link that guesses a period is a 404 waiting for month end. */}
      </p>

      <p className="mt-3 text-sm text-ink-light">
        Looking for <Link href="/mirrors/conversations" className="text-rust-700 underline">Conversation boards</Link>?
        {' '}Those are SPEC&rsquo;s reading of the business — a mirror, not something you build.
      </p>
    </Shell>
  );
}
