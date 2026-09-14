import Link from 'next/link';
import { goalLines, type Goal } from '@/lib/goals';

/**
 * The goals, kept in front of the numbers.
 *
 * Design export 5: "this stays visible on the board pack and the monthly scoring page, so the goals
 * are never lost under the numbers." That sentence is doing work — a board pack is four pillars,
 * two gates and a trend, and after a few months a business can be scoring 94% against a set of
 * targets nobody has re-read since the week they were written. Putting what the business is FOR
 * beside what it is DOING is the whole reason to have asked.
 *
 * Quiet by design: this is context for a conversation, not another figure competing with the ones
 * around it. Nothing here scores, nothing is coloured, and it never claims the numbers serve the
 * goals — that is the judgement it exists to let a person make.
 */
export function GoalsPanel({ goals, canEdit = true }: { goals: Goal[]; canEdit?: boolean }) {
  const lines = goalLines(goals);

  /*
    Nothing answered renders nothing at all on these pages.

    A board pack with an empty "what this business is for" box says something worse about the
    business than saying nothing does, and the prompt to fill it in belongs in setup, where somebody
    is already in the frame of mind to answer it — not in front of a board.
  */
  if (lines.length === 0) return null;

  return (
    <section aria-label="What this business is for" className="card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">What this business is for</h2>
        {canEdit && (
          <Link href="/setup/goals" className="label-caps hover:text-rust">Edit</Link>
        )}
      </div>
      <dl className="mt-4 grid gap-4">
        {lines.map(l => (
          <div key={l.label}>
            <dt className="text-xs leading-5 text-ink-light">{l.label}</dt>
            {/* The owner's own words, so whitespace they typed is kept rather than collapsed. */}
            <dd className="mt-0.5 whitespace-pre-line font-serif text-base leading-snug text-ink">
              {l.answer}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-5 text-ink-light">
        Set at the start, in the leader&rsquo;s words. A KPI target that does not serve one of these is
        worth questioning.
      </p>
    </section>
  );
}
