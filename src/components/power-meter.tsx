import Link from 'next/link';
import { LIGHT_COLOUR } from '@/lib/today';
import {
  HEAVY_POINTS, SHARED_POINTS, SHARED_SLOTS, ringOffset, coverageLine, scopeLabel,
  sourcesOf, type PowerReading, type SlotReading,
} from '@/lib/power-meter';

/**
 * The Virtual GM Power Meter, drawn as `SPEC My Page.dc.html` draws it.
 *
 * Kris, 19 September: *"add the Virtual GM power meter - HACC your power - to the my page"*, then,
 * with the drawing open beside the built page: *"just use this as an example - i gave you this"*,
 * *"close but actually not what i asked for"*, and *"everything - colours, function, design"*.
 *
 * ── What the first version got wrong ────────────────────────────────────────────────────────────
 *
 * The arithmetic followed the brief. The PAGE did not follow the drawing, and I had the drawing.
 *
 *   The design puts this top RIGHT, on the header line, `margin-left: auto` — a corner instrument
 *   you glance at. I built a full-width banner across the top, which makes the meter the subject of
 *   the page. The four pillar cards are the subject; the meter is the glance.
 *
 *   The design's pill holds four things and no more: the ring, the label, the percentage and
 *   **Hack Your Power**. I had added a button and a coverage line inside it, which is why it grew
 *   into a slab.
 *
 *   The ring's track is `--color-accent-100`, which is `rust-100` here. I had used the surface
 *   colour, so the unfilled part of the ring was the wrong warmth against the pill.
 *
 * ── The one deliberate difference, stated ───────────────────────────────────────────────────────
 *
 * The design opens the breakdown on a **double-click** on the pill. The pill is the control here
 * too — same element, same shape, same cursor — but a single click, because a double-click cannot
 * be discovered, cannot be reached from a keyboard, and does not exist on a phone.
 */

export interface PowerMeterProps {
  reading: PowerReading;
  /** True for somebody who manages anyone. The percentage and the breakdown are theirs. */
  canRead: boolean;
  topOfChart: boolean;
  /** The month the reading is OF. A number with no date on it is an argument waiting to happen. */
  period: string | null;
  stale: boolean;
  /** 'open' draws the breakdown; 'all' also lists the nineteen. */
  showing: 'closed' | 'open' | 'all';
  hrefFor: (showing: 'closed' | 'open' | 'all') => string;
}

const colourOf = (reading: PowerReading): string =>
  (reading.band === 'unknown' ? LIGHT_COLOUR.pending : LIGHT_COLOUR[reading.band]);

/** "2026-08" the way a person says it. */
export function monthWords(period: string | null): string {
  if (!period) return '';
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

/**
 * The pill. Goes on the header row, pushed right.
 *
 * `padding: 10px 22px 10px 10px` and `border-radius: 999px` are the design's, kept exactly: the
 * ring sits tight to the left edge and the words have room on the right.
 */
export function PowerMeter({ reading, canRead, period, showing, hrefFor }: Omit<PowerMeterProps, 'topOfChart' | 'stale'>) {
  const colour = colourOf(reading);
  const open = showing !== 'closed';

  const inside = (
    <>
      <Dial reading={reading} colour={colour} />
      <span className="grid gap-0.5">
        <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.05em] text-ink-light">
          Virtual GM Power Meter
        </span>
        {/*
          The percentage is for people who manage somebody — the design's rule (`gm.showLabel`) and
          the product's. An electrician shown a red number for a business they cannot move is being
          handed a worry rather than a lever.
        */}
        {canRead && (
          <span className="font-serif text-[22px] leading-none text-ink" data-power-score>
            {reading.score === null ? '—' : `${reading.score}%`}
          </span>
        )}
        <span className="whitespace-nowrap text-[10.5px] italic text-rust-700">Hack Your Power</span>
      </span>
    </>
  );

  const shell = 'flex items-center gap-3.5 rounded-full bg-surface-raised py-2.5 pl-2.5 pr-[22px] shadow-sm';

  return (
    /* `id` is the anchor the toggle comes back to, so opening the breakdown does not throw somebody
       to the top of a long page on a phone. */
    <section id="power" aria-label="Virtual GM Power Meter" data-power-meter>
      {canRead ? (
        <Link
          href={hrefFor(open ? 'closed' : 'open')}
          className={`${shell} transition-colors hover:bg-cream`}
          title={`Virtual GM Power Meter${period ? ` · ${monthWords(period)}` : ''} — open to see how each part is tracking`}
          data-power-toggle
        >
          {inside}
        </Link>
      ) : (
        <span className={shell}>{inside}</span>
      )}
    </section>
  );
}

/**
 * The ring.
 *
 * Track in `rust-100` — `--color-accent-100` in the design system, the same value. An unknown
 * reading draws no arc at all: a ring stuck at zero and a ring with nothing to say look identical
 * on a screen and mean opposite things, and of the two the wrong one has a board asking why the
 * business is at nothing.
 */
function Dial({ reading, colour }: { reading: PowerReading; colour: string }) {
  return (
    <svg viewBox="0 0 100 100" width="60" height="60" role="img" className="shrink-0"
      aria-label={reading.score === null
        ? 'Virtual GM Power Meter — not enough is measured yet to give a reading'
        : `Virtual GM Power Meter — ${reading.score} out of 100, ${reading.verdict}`}
    >
      <circle cx="50" cy="50" r="42" fill="none" stroke="#fff2eb" strokeWidth="14" />
      {reading.score !== null && (
        <circle
          cx="50" cy="50" r="42" fill="none" stroke={colour} strokeWidth="14" strokeLinecap="round"
          strokeDasharray="264" strokeDashoffset={ringOffset(reading.score)}
          transform="rotate(-90 50 50)"
        />
      )}
    </svg>
  );
}

/**
 * The working, full width, above the four pillar cards — `grid-column: 1 / -1; order: -1` in the
 * design.
 *
 * A separate export because the meter belongs in a corner and its working does not fit in one:
 * twenty-four rows squeezed into a right-hand column would be unreadable on a laptop and
 * impossible on a phone.
 */
export function PowerBreakdown({ reading, canRead, topOfChart, period, stale, showing, hrefFor }: PowerMeterProps) {
  if (!canRead || showing === 'closed') return null;
  const colour = colourOf(reading);

  return (
    <div className="card mb-6 border-l-4" style={{ borderLeftColor: colour }} data-power-breakdown>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <span className="label-caps">Virtual GM Power Meter · {scopeLabel(topOfChart)}</span>
          <p className="font-serif text-xl text-ink">
            {reading.score === null ? reading.verdict : `${reading.score}% — ${reading.verdict}`}
          </p>
        </div>
        <Link href={hrefFor('closed')} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">Close</Link>
      </div>

      {/*
        Which month this is a reading OF.

        The meter reads the last month anybody marked, because a month is scored at its end and one
        tied to the open month is blank for most of every month. That is only honest if the screen
        says which month — see lib/power-meter-data.
      */}
      {period && (
        <p className="mt-1 text-sm text-ink-light" data-power-month>
          Read from {monthWords(period)}
          {stale ? ', the last month anybody marked. This month has nothing in it yet.' : '.'}
        </p>
      )}

      {/*
        The cause, and only ever a heavy hitter. Fifteen points is the largest single move this
        reading can make, so it is the one sentence worth putting under the number.
      */}
      {reading.cause && (
        <p className="mt-1 text-sm" style={{ color: LIGHT_COLOUR.red }} data-power-cause>
          Power dropped {HEAVY_POINTS} points: {reading.cause}
        </p>
      )}
      {/*
        Always shown, never only when it is low. A coverage note that appears when things are bad is
        a disclaimer; one that is always there is a fact about the reading.
      */}
      <p className="mt-1 text-sm text-ink-light" data-power-coverage>{coverageLine(reading)}</p>

      <div className="mt-4 grid gap-2 border-t border-rust-200 pt-4">
        <span className="label-caps">The five heavy hitters — {HEAVY_POINTS * 5}% of the reading</span>
        {reading.heavy.map(slot => <SlotRow key={slot.slot.id} reading={slot} />)}

        <Link
          href={hrefFor(showing === 'all' ? 'open' : 'all')}
          className="mt-1.5 flex items-center justify-between gap-3 rounded-xl bg-cream px-3.5 py-2.5 text-sm text-ink hover:bg-surface"
          data-power-others
        >
          <span>Everything else — {SHARED_POINTS}% shared</span>
          <span className="text-xs font-semibold text-ink-light">
            {reading.sharedMet} of {SHARED_SLOTS} met {showing === 'all' ? '▲' : '▼'}
          </span>
        </Link>

        {showing === 'all' && (
          <div className="grid gap-1.5 px-3.5 py-1 pl-7">
            {reading.shared.map(slot => <SlotRow key={slot.slot.id} reading={slot} quiet />)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One measure, and where it stands.
 *
 * Three states, not two. "Not measured" is grey and says so — a slot SPEC has no KPI for is not a
 * failure by anybody, it is a gap in what the business measures, and colouring it red would be the
 * meter telling a business it is doing badly at something nobody ever asked it to do.
 */
function SlotRow({ reading, quiet = false }: { reading: SlotReading; quiet?: boolean }) {
  const tone = reading.state === 'met' ? LIGHT_COLOUR.green
    : reading.state === 'not_met' ? LIGHT_COLOUR.red
      : LIGHT_COLOUR.pending;
  const said = reading.state === 'met' ? 'Met'
    : reading.state === 'not_met' ? 'Not met'
      : 'Not measured';

  return (
    <div
      className={quiet
        ? 'flex items-center justify-between gap-3 text-[13px] leading-[22px] text-ink-light'
        : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-cream px-3.5 py-2.5'}
      data-power-slot={reading.slot.id}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm text-ink">
        {!quiet && (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />
        )}
        {reading.slot.name}
        {/*
          Which of the business's own KPIs fed this slot.

          The framework's words are not any business's words, so SPEC has to match "Gross profit
          margin" to "GP% holding on solar" — and a mapping somebody can SEE is a mapping somebody
          can correct. Hiding it would make every wrong match permanent and invisible.
        */}
        {!quiet && reading.from.length > 0 && (
          <span className="text-xs text-ink-light">
            from {sourcesOf(reading).map(s => (s.roles > 1 ? `${s.text} (${s.roles} roles)` : s.text)).join('; ')}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs font-semibold" style={{ color: tone }}>{said}</span>
    </div>
  );
}
