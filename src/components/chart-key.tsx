import { AT_THE_STANDARD, WATCH_FROM } from '@/lib/pillars';
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
 * The design's own key still reads "75–89%", from before the lower line was corrected — a pillar on
 * 60% was being painted red while costing the business nothing. The code is right and the design is
 * behind; this renders what the product actually does.
 */
export function ChartKey() {
  const standard = Math.round(AT_THE_STANDARD * 100);
  const watch = Math.round(WATCH_FROM * 100);

  const bands = [
    { colour: LIGHT_COLOUR.green, ink: LIGHT_INK.green, label: `${standard}% and above`, note: 'At the standard.' },
    { colour: LIGHT_COLOUR.amber, ink: LIGHT_INK.amber, label: `${watch}–${standard - 1}%`, note: 'Behind, and worth a conversation.' },
    { colour: LIGHT_COLOUR.red, ink: LIGHT_INK.red, label: `Below ${watch}%`, note: 'Costing the business now.' },
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
    </section>
  );
}
