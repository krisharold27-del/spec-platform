import { AT_THE_STANDARD } from '@/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import type { AceWatchRow } from '@/lib/ace-watch';

/**
 * Ace watch — every role's run on the month being scored.
 *
 * Built to designs/SPEC Monthly Scoring, which has carried this section since the first export: a
 * card per role, the run as month pills, a state chip, and a line saying what did it.
 *
 * ── Why it is a run and not a badge ──────────────────────────────────────────────────────────────
 *
 * "Two of three" tells somebody exactly what next month is worth. A badge tells them nothing. The
 * doubling is a sprint — three consecutive closed months at the standard pays double, then the count
 * starts again — so a good month is worth more or less depending on where in the three it lands, and
 * only the run shows that.
 *
 * The colour is the state, and the state is the run: green when it pays, amber on the last month
 * before it could, grey otherwise. Grey rather than red on purpose — not being on a run is the
 * ordinary case, and painting it red would make the standard look like a failure everybody is at.
 */
export function AceWatch({ rows, period }: { rows: AceWatchRow[]; period: string }) {
  const standard = Math.round(AT_THE_STANDARD * 100);
  const paying = rows.filter(r => r.doublesNow).length;

  return (
    <section aria-label="Ace watch" className="card mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl text-ink">Ace watch</h2>
        <span className="label-caps">
          {rows.length === 0 ? period : `${paying} at Ace · ${period}`}
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-sm text-ink-light">
        Trained on the job, signed off, and a combined score of {standard}% or above for three
        consecutive closed months doubles the incentive — then the three-month focus starts again.
        Every role has one. Only roles with their own KPI scorecard can reach it.
      </p>

      {rows.length === 0 ? (
        /* Empty is the first-month state for every new business, and it is not a problem. Saying so
           plainly beats an empty box that reads as something failing to load. */
        <p className="mt-4 text-sm text-ink">
          No role has a KPI scorecard yet, so nothing is on a run. Set KPIs on a role and its first
          closed month starts the count.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {rows.map(r => {
            /*
              The colour says the same thing the note says.

              Amber means "one more month and this pays", so it cannot be shown to somebody whose
              run has not started: a rust stripe promising almost-there beside a note reading "the
              run cannot start" is the card arguing with itself, which is the fault this section
              has now been caught making twice. Sign-off first, then the count.
            */
            const tone = !r.signedOff
              ? 'pending'
              : r.doublesNow
                ? 'green'
                : r.consecutive >= r.required - 1
                  ? 'amber'
                  : 'pending';
            return (
              <li
                key={r.roleId}
                className="card-inset border-l-4"
                style={{ borderLeftColor: LIGHT_COLOUR[tone] }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <span className="grid gap-0.5">
                    <span className="font-serif text-base text-ink">{r.person ?? 'Seat not filled'}</span>
                    <span className="text-[13px] text-ink-light">
                      {r.roleTitle} · {r.aceName}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      background: `color-mix(in srgb, ${LIGHT_COLOUR[tone]} 16%, transparent)`,
                      color: LIGHT_INK[tone],
                    }}
                  >
                    {/*
                      One answer per card. Somebody who is not signed off has months on the board
                      and no run, so a chip reading "1 of 3 months" beside a note saying the run
                      cannot start would be the card arguing with itself. The pills below still
                      show every month, so nothing is hidden — only the headline changes.
                    */}
                    {r.doublesNow
                      ? r.aceName
                      : !r.signedOff
                        ? 'Not signed off'
                        : `${r.consecutive} of ${r.required} months`}
                  </span>
                </div>

                {r.run.length > 0 && (
                  <ul className="mt-3.5 flex flex-wrap gap-2">
                    {r.run.map(m => (
                      <li
                        key={m.period}
                        className="rounded-full px-3 py-1.5 text-xs whitespace-nowrap"
                        style={{
                          background: m.held
                            ? `color-mix(in srgb, ${LIGHT_COLOUR.green} 14%, transparent)`
                            : undefined,
                          color: m.held ? LIGHT_INK.green : LIGHT_INK.pending,
                        }}
                      >
                        {m.period} {m.held ? '✓' : '—'}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-[13.5px] leading-relaxed text-ink-light">{r.note}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
