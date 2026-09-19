import Link from 'next/link';
import { LIGHT_COLOUR } from '@/lib/today';
import {
  HEAVY_POINTS, SHARED_POINTS, SHARED_SLOTS, ringOffset, coverageLine, scopeLabel,
  sourcesOf, type PowerReading, type SlotReading,
} from '@/lib/power-meter';

/**
 * The Virtual GM Power Meter, on the screen.
 *
 * Kris, 19 September: *"add the Virtual GM power meter - HACC your power - to the my page ... to
 * give an instant percentage to the business leaders and the board on how well the business is
 * tracking"*. `SPEC My Page.dc.html` draws it: a ring in the header, the label, and **Hack Your
 * Power** underneath.
 *
 * ── One departure from the drawing, and why ─────────────────────────────────────────────────────
 *
 * The design opens the breakdown on a **double-click**. It is not built that way here.
 *
 * A double-click cannot be discovered — nothing on a screen has ever indicated one — it cannot be
 * reached from a keyboard, and it does not exist on a phone, which is where half of this business's
 * people will open this page. The design's own panel has a "See breakdown" control inside it, which
 * is only reachable once the panel everybody has to guess at is already open.
 *
 * So it is an ordinary link that says what it does. Everything else — the ring, the bands, the
 * weighting, the words — is the design's.
 *
 * ── Who sees the number ─────────────────────────────────────────────────────────────────────────
 *
 * Everybody sees the ring; the percentage and the breakdown are for people who manage somebody,
 * which is the design's rule and the product's. A reading of a branch is only useful to the person
 * who can do something about the branch, and an electrician shown a red number for a business they
 * cannot move is being handed a worry rather than a lever.
 */

export interface PowerMeterProps {
  reading: PowerReading;
  /** True for somebody who manages anyone. The percentage and the breakdown are theirs. */
  canRead: boolean;
  topOfChart: boolean;
  /** 'open' draws the breakdown; 'all' also lists the nineteen. */
  showing: 'closed' | 'open' | 'all';
  /** Where this page lives, so the toggle keeps whatever else is in the address. */
  hrefFor: (showing: 'closed' | 'open' | 'all') => string;
}

const colourOf = (reading: PowerReading): string =>
  (reading.band === 'unknown' ? LIGHT_COLOUR.pending : LIGHT_COLOUR[reading.band]);

export function PowerMeter({ reading, canRead, topOfChart, showing, hrefFor }: PowerMeterProps) {
  const colour = colourOf(reading);
  const open = showing !== 'closed';

  return (
    /* `id` is the anchor the toggle returns to, so opening the breakdown does not throw somebody
       back to the top of a long page on a phone. */
    <section id="power" aria-label="Virtual GM Power Meter" className="mb-8" data-power-meter>
      {/* The design's pill: the meter reads as one object rather than as loose text on the page. */}
      <div className="flex flex-wrap items-center gap-4 rounded-[28px] bg-surface-raised p-2.5 pr-6 shadow-[0_1px_2px_rgba(32,30,29,.05),0_10px_24px_-20px_rgba(32,30,29,.45)] sm:inline-flex">
        <Dial reading={reading} colour={colour} />
        <div className="grid gap-0.5">
          <span className="label-caps">Virtual GM Power Meter</span>
          {canRead && (
            <span className="font-serif text-2xl leading-none text-ink" data-power-score>
              {reading.score === null ? 'Not enough to read' : `${reading.score}%`}
            </span>
          )}
          {/*
            The coverage beside the number, not only inside the breakdown.

            Drawn on JBI's real data this read **100%** from eight of the twenty-four — every one of
            those eight genuinely met, and a board member who never opens the breakdown would walk
            away believing the business was perfect on all of it. The headline is what gets
            remembered, so the headline carries the caveat.
          */}
          {canRead && reading.score !== null && (
            <span className="text-[11px] text-ink-light" data-power-of>
              read from {reading.measured} of {reading.total}
            </span>
          )}
          <span className="text-[10.5px] italic text-rust-700">Hack Your Power</span>
        </div>

        {/*
          Said out loud rather than left to a tooltip. Somebody who cannot see the number should
          know that is a rule and not a fault on their screen — the alternative is an empty space
          where other people evidently have something.
        */}
        {canRead ? (
          <Link
            href={hrefFor(open ? 'closed' : 'open')}
            className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
            data-power-toggle
          >
            {open ? 'Hide the breakdown' : 'See how it is made up'}
          </Link>
        ) : (
          <p className="max-w-[46ch] text-xs text-ink-light">
            The reading is for whoever runs a part of the business. Yours is the four pillars below.
          </p>
        )}
      </div>

      {canRead && open && <Breakdown reading={reading} colour={colour} topOfChart={topOfChart} showing={showing} hrefFor={hrefFor} />}
    </section>
  );
}

/**
 * The ring.
 *
 * An unknown reading draws no arc at all. A ring stuck at zero and a ring with nothing to say look
 * identical on a screen and mean opposite things — and of the two, the one that is wrong is the one
 * that would have a board asking why the business is at nothing.
 */
function Dial({ reading, colour }: { reading: PowerReading; colour: string }) {
  return (
    <svg viewBox="0 0 100 100" width="60" height="60" role="img" className="shrink-0"
      aria-label={reading.score === null
        ? 'Virtual GM Power Meter — not enough is measured yet to give a reading'
        : `Virtual GM Power Meter — ${reading.score} out of 100, ${reading.verdict}`}
    >
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-surface)" strokeWidth="14" />
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

function Breakdown({ reading, colour, topOfChart, showing, hrefFor }: {
  reading: PowerReading; colour: string; topOfChart: boolean;
  showing: 'closed' | 'open' | 'all';
  hrefFor: (showing: 'closed' | 'open' | 'all') => string;
}) {
  return (
    <div className="card mt-4 border-l-4" style={{ borderLeftColor: colour }} data-power-breakdown>
      <span className="label-caps">Virtual GM Power Meter · {scopeLabel(topOfChart)}</span>
      <p className="mt-1 font-serif text-xl text-ink">
        {reading.score === null ? reading.verdict : `${reading.score}% — ${reading.verdict}`}
      </p>
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
        : 'flex items-center justify-between gap-3 rounded-xl bg-cream px-3.5 py-2.5'}
      data-power-slot={reading.slot.id}
    >
      <span className="flex items-center gap-2.5 text-sm text-ink">
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
