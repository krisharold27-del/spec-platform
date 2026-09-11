import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { getBoards } from '@/lib/boards-data';
import { LIBRARY_NOTE, CONCENTRATED_AT } from '@/lib/boards';
import { LIGHT_COLOUR } from '@/lib/today';

export const dynamic = 'force-dynamic';

/**
 * Conversation boards.
 *
 * Not the board of directors and not a dashboard. Each one is built to provoke a single
 * realisation, from what the business already recorded, so a hard conversation has a neutral third
 * party in it instead of an accusation.
 *
 * Three things about how this page is drawn, all deliberate:
 *
 *  - **No verdict anywhere.** The numbers sit next to a description of the other way of working and
 *    stop. The person reading reaches the conclusion, which is the only version of it they will
 *    act on.
 *  - **No score styling.** No percentages in big type, no green when a number is "good". These are
 *    not scores, and drawn like scores they would be managed like scores.
 *  - **Only ever about the reader.** There is no way to open somebody else's, by design.
 */
export default async function Boards() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const boards = await getBoards(user);

  const readable = boards.filter(b => !b.tooEarly);

  return (
    <Shell
      title="Conversation boards"
      subtitle="A mirror, not a dashboard. Built to raise one question each."
    >
      <div className="callout max-w-3xl">
        <p className="text-sm text-ink-light">{LIBRARY_NOTE}</p>
      </div>

      {readable.length === 0 && (
        <div className="card mt-6 max-w-3xl">
          <div className="font-serif text-lg text-ink">Not enough recorded yet</div>
          <p className="mt-1 text-sm text-ink-light">
            These are built from meetings, decisions, targets and marked cards. A few weeks of the rhythm
            and one closed month is enough for them to be worth looking at — and reading a mirror built
            from three data points would be worse than not looking.
          </p>
          <Link href="/meeting" className="btn-primary mt-4 inline-block">Log this week&rsquo;s meeting</Link>
        </div>
      )}

      <div className="mt-6 grid gap-6">
        {boards.map(b => (
          <section key={b.key} className="card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl text-ink">{b.title}</h2>
              <span className="text-xs text-ink-light">
                {b.coverage.measured} of {b.coverage.total} measured
              </span>
            </div>
            <p className="mt-2 max-w-2xl font-serif text-lg text-ink-light">{b.question}</p>

            {b.tooEarly ? (
              <p className="mt-4 text-sm text-ink-light">{b.reading}</p>
            ) : (
              <>
                {/* Two columns: what happened, and what the other way of working looks like.
                    Never a target, never a pass mark — a description, so the reader compares
                    themselves to a way of working rather than to a threshold they can game. */}
                <div className="mt-5 overflow-x-auto">
                  <table className="table-clean min-w-[640px]">
                    <thead>
                      <tr>
                        <th>{' '}</th>
                        <th>{b.poles.concentrated}</th>
                        <th>{b.poles.distributed}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.signals.map(s => (
                        <tr key={s.key}>
                          <td className="text-ink">{s.label}</td>
                          <td>
                            <span
                              className="font-mono text-sm"
                              style={{ color: s.concentrated ? LIGHT_COLOUR.amber : undefined }}
                            >
                              {s.display}
                            </span>
                            {s.value !== null && (
                              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-cream">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.max(s.value * 100, 2)}%`,
                                    background: s.concentrated ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending,
                                  }}
                                />
                              </span>
                            )}
                          </td>
                          <td className="text-xs text-ink-light">{s.contrast}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-5 border-t border-ink/10 pt-4 text-base text-ink">{b.reading}</p>

                <div className="mt-3 rounded-lg bg-cream p-3">
                  <div className="label-caps">What would move it</div>
                  <p className="mt-1 text-sm text-ink">{b.change}</p>
                </div>
              </>
            )}
          </section>
        ))}
      </div>

      <section className="card mt-8 max-w-3xl">
        <h2 className="font-serif text-lg text-ink">Why these are only ever about you</h2>
        <p className="mt-2 text-sm text-ink-light">
          There is no way to open somebody else&rsquo;s. The moment a board like this can be pointed at a
          person it stops being a mirror and becomes surveillance, and everybody starts managing the board
          instead of the business. Nobody above you sees yours either.
        </p>
        <p className="mt-3 text-sm text-ink-light">
          A line is marked when {Math.round(CONCENTRATED_AT * 100)}% or more of something runs through one
          person. That threshold is a judgement, not a law — it is written down here so you can disagree
          with it.
        </p>
      </section>
    </Shell>
  );
}
