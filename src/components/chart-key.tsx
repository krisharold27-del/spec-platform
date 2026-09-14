import { GREEN_FROM, RED_AT_OR_BELOW, AT_THE_STANDARD } from '@/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';


/**
 * What the colours on the chart mean.
 *
 * The design carries this and the product did not. Every card on the org chart shows four coloured
 * letters and there was nothing anywhere saying what the colours were — so a new customer was
 * looking at a wall of red and amber with no way to know whether that was bad, or what number would
 * make it stop. That is the single worst thing a first-week screen can do.
 *
 * ── Why the numbers are read from the code rather than typed ─────────────────────────────────────
 *
 * A key that says 75% while the engine bands at 50% is worse than no key: it is a confident,
 * specific, wrong answer, and somebody will plan around it. So both figures come from the constants
 * that actually decide the colour, in lib/pillars. Change the rule and this changes with it; there
 * is no second place for the truth to live.
 *
 * Green from 80%, amber above 50%, red at or under 50% — set by Kris, and the same line the incentive
 * fails on, so red on a card and a deduction mean exactly the same thing. The design's own key still
 * reads "75–89%" and is behind; this renders what the product actually does.
 */
export function ChartKey() {
  const green = Math.round(GREEN_FROM * 100);
  const red = Math.round(RED_AT_OR_BELOW * 100);
  const standard = Math.round(AT_THE_STANDARD * 100);

  const bands = [
    { colour: LIGHT_COLOUR.green, ink: LIGHT_INK.green, label: `${green}% and above`, note: 'Good. The SPEC standard is still ' + standard + '%.' },
    { colour: LIGHT_COLOUR.amber, ink: LIGHT_INK.amber, label: `${red + 1}–${green - 1}%`, note: 'Behind, and worth a conversation.' },
    { colour: LIGHT_COLOUR.red, ink: LIGHT_INK.red, label: `${red}% or under`, note: 'A failure. This is what deducts.' },
    { colour: LIGHT_COLOUR.pending, ink: LIGHT_INK.pending, label: 'Not set', note: 'No KPIs yet, so nothing to score.' },
  ];

  return (
    <section aria-label="What the colours mean" className="card mt-6">
      <h2 className="font-serif text-lg text-ink">What the colours mean</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bands.map(b => (
          <li key={b.label} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ background: b.colour }}
            />
            <span>
              {/* The word carries the ink colour, never the fill: three of the four signal colours
                  fail contrast as text, which is why lib/pillars keeps two weights of each. */}
              <span className="block text-sm font-medium" style={{ color: b.ink }}>{b.label}</span>
              <span className="block text-xs text-ink-light">{b.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-light">
        Each card carries four letters — Safety, People, Earnings, Compliance — in the colour that
        pillar is scoring this month. A role with no KPIs set shows grey rather than red: nothing has
        gone wrong, it simply is not being measured yet.
      </p>
      <p className="mt-2 text-xs text-ink-light">
        Red and a deduction are the same line: a quadrant at or under {red}% is a failure, and takes
        5% off the manager above it, capped at 25%. Being green is not the same as being SPEC —
        that is {standard}% on every pillar, two months running.
      </p>

      {/*
        The three circles in the corner of every card. Written the same day they appeared, because
        the reason this key exists at all is that the chart once showed four coloured letters with
        nothing anywhere saying what they meant — and a second unexplained mark would be worse than
        the first, not better.
      */}
      <div className="mt-5 border-t border-ink/10 pt-4">
        <h3 className="font-serif text-base text-ink">The three circles</h3>
        <p className="mt-1.5 max-w-3xl text-xs text-ink-light">
          Every role has an Ace. Three closed months at a combined {standard}% or above — trained on
          the job and signed off — doubles that person&rsquo;s incentive for the month after, and then
          the three-month focus starts again. The circles are how many of the three are held.
        </p>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <li className="flex items-center gap-2.5">
            <span aria-hidden className="flex shrink-0 items-center gap-[3px]">
              {[true, true, false].map((on, i) => (
                <span
                  key={i}
                  className="block h-[7px] w-[7px] rounded-full"
                  style={{
                    background: on ? LIGHT_COLOUR.green : 'transparent',
                    boxShadow: on ? 'none' : `inset 0 0 0 1.5px ${LIGHT_INK.pending}`,
                  }}
                />
              ))}
            </span>
            <span className="text-xs text-ink-light">Two of three months held.</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide"
              style={{ background: LIGHT_COLOUR.green, color: '#f5ead8' }}
            >
              ACE
            </span>
            <span className="text-xs text-ink-light">On Ace — this month is doubled.</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span aria-hidden className="flex shrink-0 items-center gap-[3px]">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="block h-[7px] w-[7px] rounded-full"
                  style={{ boxShadow: `inset 0 0 0 1.5px ${LIGHT_INK.pending}` }}
                />
              ))}
            </span>
            <span className="text-xs text-ink-light">
              Nothing running — or not yet signed off, so the run cannot start.
            </span>
          </li>
        </ul>
        <p className="mt-3 max-w-3xl text-xs text-ink-light">
          Hover a card for whose Ace it is, where the run stands and what broke it. A role with no
          KPI scorecard has no circles: it is not failing, it is not being measured yet.
        </p>
      </div>
    </section>
  );
}
