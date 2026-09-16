import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import {
  BOARD_TYPES, BOARDS_INTRO, EMPTY_BOARD, NOTHING_PINNED, STEP_STATE,
  cardLabel, feedLabel, initials, kindOf, stepStateOf, visible, type BoardKind,
} from '@/lib/boards-live';
import { listBoards, getBoard, markViewing } from '@/lib/boards-live-data';
import { newBoard, sayOnBoard } from './actions';

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
  searchParams: Promise<{ board?: string; type?: string; needs?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;

  if (sp.board) {
    const board = await getBoard(user.tenantId, sp.board);
    if (!board) redirect('/boards');
    // Being here is what puts you in "Editing now" for the next five minutes.
    await markViewing(user.tenantId, board.id, user.id).catch(() => {});

    return (
      <Shell title={board.title} subtitle={cardLabel(board.kind)}>
        <Link href="/boards" className="text-sm text-rust-700 hover:underline">&larr; All boards</Link>

        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="grid gap-6">
            {board.feeds.length > 0 && (
              <section className="card">
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
              <section className="card">
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

            {board.rows.length > 0 && (
              <section className="card">
                <table className="table-clean w-full">
                  <thead>
                    <tr><th>Rate input</th><th>Source</th><th className="text-right">Value</th></tr>
                  </thead>
                  <tbody>
                    {board.rows.map(r => (
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

            {board.steps.length > 0 && (
              <section className="card">
                <p className="text-sm text-ink-light">
                  What needs fixing, and who&rsquo;s doing it — the plan the team climbs together.
                </p>
                <ul className="mt-4 space-y-3">
                  {board.steps.map((s, i) => {
                    const state = STEP_STATE[stepStateOf(s.state)];
                    return (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: state.colour }}
                          aria-hidden
                        />
                        <span className="flex-1 text-ink">{s.text}</span>
                        <span className="shrink-0 text-xs text-ink-light">{s.owner} · {state.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {!board.rows.length && !board.steps.length && !board.headline && (
              <section className="card">
                <p className="text-sm text-ink-light">
                  {board.summary ? `${board.summary} ` : ''}{EMPTY_BOARD}
                </p>
              </section>
            )}
          </div>

          <div className="grid gap-6">
            <section className="card">
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

            <section className="card">
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
      </Shell>
    );
  }

  const all = await listBoards(user.tenantId);
  const filter: BoardKind | null = sp.type ? kindOf(sp.type) : null;
  const shown = visible(all, filter);

  return (
    <Shell title="Boards" subtitle={BOARDS_INTRO}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/boards"
          className={`rounded-full px-4 py-2 text-sm ${!filter ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}
        >
          All
        </Link>
        {BOARD_TYPES.map(t => (
          <Link
            key={t.id}
            href={`/boards?type=${t.id}`}
            className={`rounded-full px-4 py-2 text-sm ${filter === t.id ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {all.length === 0 && <p className="mt-6 max-w-[62ch] text-sm text-ink-light">{NOTHING_PINNED}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(b => (
          <Link key={b.id} href={`/boards?board=${b.id}`} className="card transition-colors hover:border-rust/40">
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
        <h2 className="font-serif text-xl text-ink">New board</h2>
        {sp.needs === 'title' && (
          <p className="mt-2 text-sm text-rust-800">It needs a name — a board nobody can find again is not one.</p>
        )}
        <form action={newBoard} className="mt-3 grid gap-2">
          <input name="title" placeholder="What is this board about?" autoComplete="off" className="input" />
          <select name="kind" className="input" defaultValue="improve">
            {BOARD_TYPES.map(t => <option key={t.id} value={t.id}>{t.card}</option>)}
          </select>
          <input name="summary" placeholder="One line, so the card says something (optional)" autoComplete="off" className="input" />
          <SubmitButton className="btn-primary justify-self-start" pending="Creating…">+ New board</SubmitButton>
        </form>
      </section>

      {/*
        Conversation boards kept their own door rather than being folded in here.

        They share a word and nothing else: this page is the business's own artifacts, and that one
        is SPEC's reading OF the business — a mirror built to raise one question and reach no
        verdict. Merging them would have quietly lost the difference.
      */}
      <p className="mt-8 text-sm text-ink-light">
        Looking for <Link href="/boards/conversations" className="text-rust-700 underline">Conversation boards</Link>?
        {' '}Those are SPEC&rsquo;s reading of the business — a mirror, not something you build.
      </p>
    </Shell>
  );
}
