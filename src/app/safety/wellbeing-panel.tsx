import { readWellbeing, ANONYMOUS_MEANS_ANONYMOUS, type Wellbeing } from '@/lib/on-call';

/**
 * How is everyone going?
 *
 * Monthly, anonymous, whole business only. The rule that makes it worth anything is the one that
 * makes it look sparse: below five responses nothing is shown at all — not a rounded score, not a
 * caveat, not "insufficient data" beside the number. Four people in one business is not anonymous,
 * whatever the screen says around it, and the promise made when they answered was anonymity.
 *
 * Themes rather than quotes, for the same reason. A quote identifies somebody.
 */
export function WellbeingPanel({ month }: { month: Wellbeing | null }) {
  const reading = month ? readWellbeing(month) : null;

  return (
    <section className="card p-6 sm:p-8" data-wellbeing>
      <h2 className="font-serif text-2xl text-ink">How is everyone going?</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">{ANONYMOUS_MEANS_ANONYMOUS}</p>

      {!reading ? (
        <p className="mt-4 text-sm text-ink-light">
          No check-in has run yet. It goes out monthly and takes a minute to answer.
        </p>
      ) : (
        <div className="mt-4" data-wellbeing-state={reading.state}>
          {reading.score !== null && (
            <p className="font-serif text-5xl leading-none text-ink" data-wellbeing-score>
              {reading.score.toFixed(1)}
            </p>
          )}
          <p className="mt-2 max-w-3xl text-sm text-ink">{reading.says}</p>
          {reading.themes.length > 0 && (
            <ul className="mt-3 grid gap-0.5">
              {reading.themes.map(t => (
                <li key={t} className="text-sm text-ink-light" data-wellbeing-theme>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
