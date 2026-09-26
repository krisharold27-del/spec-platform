import Link from 'next/link';
import { OBLIGATIONS, tellWhom, WHY_ON_THE_CHART, DUTY_RISES, type ChainReading } from '@/lib/chain';
import { LIGHT_COLOUR } from '@/lib/today';

/**
 * Chain of responsibility, on the chart.
 *
 * Pick an obligation and every seat that carries part of it lights up; everything else dims. The
 * dimming is not decoration — it is the feature. A chart with forty seats tells you nothing about
 * working at heights until thirty-three of them go quiet and you can see the shape of the seven
 * that are left, and whether there is a hole in the middle of them.
 *
 * ── The red link ────────────────────────────────────────────────────────────────────────────────
 *
 * A link nobody holds is a legal duty nobody is discharging, and it is normally invisible because
 * the work still gets done: somebody covers informally and everybody assumes somebody else is
 * accountable. Worse again is a link whose holder has LEFT, because then everybody actively
 * believes it is covered.
 *
 * So the broken links are named, the person ABOVE is named as the one carrying it right now, and
 * the line for the weekly meeting is written out — not "review chain of responsibility", which is
 * an agenda item that gets carried forward for four months.
 */
export function ChainPanel({ reading, chosen, hrefFor }: {
  reading: ChainReading | null;
  chosen: string | null;
  hrefFor: (key: string | null) => string;
}) {
  return (
    <section className="card mt-8 p-6 sm:p-8" data-chain>
      <h2 className="font-serif text-2xl text-ink">Chain of responsibility</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">{WHY_ON_THE_CHART}</p>

      {/* ── Pick one ────────────────────────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2" data-chain-picker>
        {OBLIGATIONS.map(o => (
          <Link
            key={o.key}
            href={hrefFor(o.key === chosen ? null : o.key)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold ${o.key === chosen ? 'bg-ink text-white' : 'border border-sand-300 text-ink'}`}
            data-chain-pick={o.key}
            aria-current={o.key === chosen ? 'true' : undefined}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {reading && (
        <div className="mt-5" data-chain-reading={reading.obligation.key}>
          <p className="max-w-3xl text-sm text-ink">{reading.obligation.is}</p>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-ink">{reading.says}</p>

          {reading.links.length > 0 && (
            <ol className="mt-4 grid gap-2">
              {reading.links.map(w => {
                const broken = w.state !== 'held';
                const up = broken ? tellWhom(w, reading.links) : null;
                return (
                  <li
                    key={w.kind.key}
                    className="card-inset grid gap-0.5 border-l-4"
                    style={{ borderLeftColor: broken ? LIGHT_COLOUR.red : LIGHT_COLOUR.green }}
                    data-chain-link={w.kind.key}
                    data-chain-state={w.state}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-serif text-base text-ink">{w.kind.label}</span>
                      {w.link.roleTitle && <span className="label-caps">{w.link.roleTitle}</span>}
                    </div>
                    <span className="text-sm text-ink">{w.says}</span>
                    {broken && (
                      <span className="text-sm text-ink-light" data-chain-rises>
                        {up
                          ? `${up.link.person} is carrying it until somebody holds it.`
                          : 'Nobody above it is holding it either.'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {reading.forTheMeeting && (
            <div className="mt-4 rounded-xl border border-sand-300 bg-sand-50 p-4" data-chain-meeting>
              <span className="label-caps">On the weekly meeting</span>
              <p className="mt-1 text-sm text-ink">{reading.forTheMeeting}</p>
              <p className="mt-2 text-xs text-ink-light">{DUTY_RISES}</p>
            </div>
          )}
        </div>
      )}

      {!reading && (
        <p className="mt-4 max-w-3xl text-sm text-ink-light">
          Pick a duty and the chart shows only the seats that carry part of it.
        </p>
      )}
    </section>
  );
}
