import { PATTERN_AT, type Pattern } from '@/lib/gentle';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * What people confirmed when SPEC asked "hang on a second, is this correct?".
 *
 * PATTERNS ONLY. One confirmed fourteen-hour day is a Tuesday, and showing it to a leader would
 * turn a gentle prompt into surveillance — people would stop answering honestly, and the prompts
 * would be worth nothing.
 *
 * Three of the same thing from the same person is different. That is the business finding out a
 * fortnight later, which is exactly when it is still a conversation rather than a problem.
 */
export function PatternsPanel({ patterns }: { patterns: Pattern[] }) {
  return (
    <section className="card p-6 sm:p-8" data-patterns>
      <h2 className="font-serif text-2xl text-ink">Worth a conversation</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">
        Nothing in SPEC stops somebody doing what they meant to do. When it asks “is this correct?”
        and they say yes, it is kept — and {PATTERN_AT} of the same answer from the same person shows
        up here. Not to check up on anybody: a pattern usually means the estimate, the roster or the
        rate is wrong rather than the person.
      </p>

      {patterns.length === 0 ? (
        <p className="mt-4 text-sm text-ink-light">No patterns. Nothing to have a word about.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {patterns.map(p => (
            <li
              key={`${p.key}-${p.who}`}
              className="card-inset grid gap-0.5 border-l-4"
              style={{ borderLeftColor: LIGHT_COLOUR.amber }}
              data-pattern={p.key}
            >
              <span className="font-serif text-base text-ink">{p.who}</span>
              <span className="text-sm text-ink">{p.says}</span>
              <span className="text-xs text-ink-light">Last one {p.last.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
