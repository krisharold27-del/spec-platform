import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import type { AceWatchRow } from '@/lib/ace-watch';

/**
 * A role's Ace run, small enough to sit in the corner of an org-chart card.
 *
 * ── Why three pips rather than a number ──────────────────────────────────────────────────────────
 *
 * The chart is read at a glance across forty cards at once, and "2/3" makes a leader stop and do
 * arithmetic on every one of them. Three pips filled left to right is the same information with no
 * reading required: a row of empty circles is a business with nothing running, and a wall of nearly
 * full ones is a business about to pay out. That difference should be visible from across a room.
 *
 * It deliberately mirrors the four pillar dots already on the card, so the card reads as one object
 * with two rows of state rather than a diagram with a widget stuck on it.
 *
 * ── Why an unsigned-off role shows hollow pips and not a count ───────────────────────────────────
 *
 * Ace needs the person trained on the job and signed off before any run counts. Showing their good
 * months as filled would promise a doubling that will not arrive. They get outlines — the months
 * are on the board, the run is not running — and the tooltip says which of the two is missing.
 *
 * The whole marker is a `title`, so hovering any card gives the sentence from Ace watch without
 * leaving the chart.
 */
export function AcePips({ ace, big }: { ace: AceWatchRow; big?: boolean }) {
  const size = big ? 8 : 7;
  const label = `${ace.aceName} — ${ace.doublesNow ? 'doubled this month' : !ace.signedOff ? 'not signed off' : `${ace.consecutive} of ${ace.required} months`}. ${ace.note}`;

  /*
    Paying is a filled badge rather than three full pips. Three full pips is what the month BEFORE
    payment looks like, and the one month that is actually worth money has to be unmistakable — it
    is the only state on this chart that costs the business something.
  */
  if (ace.doublesNow) {
    return (
      <span
        title={label}
        aria-label={label}
        className="rounded-full px-1.5 py-px text-[9px] font-semibold leading-[1.4] tracking-wide"
        style={{ background: LIGHT_COLOUR.green, color: '#f5ead8' }}
      >
        ACE
      </span>
    );
  }

  const pips = Array.from({ length: ace.required }, (_, i) => i < ace.consecutive);

  return (
    <span title={label} aria-label={label} className="flex items-center gap-[3px]">
      {pips.map((held, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: size,
            height: size,
            // Held months are solid; the rest are the ring of a month still to come. An unsigned-off
            // role is all rings, whatever its months did.
            background: held && ace.signedOff ? LIGHT_COLOUR.green : 'transparent',
            boxShadow: held && ace.signedOff ? 'none' : `inset 0 0 0 1.5px ${LIGHT_INK.pending}`,
          }}
        />
      ))}
    </span>
  );
}
