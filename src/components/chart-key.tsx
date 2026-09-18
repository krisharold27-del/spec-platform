import { GREEN_FROM, RED_AT_OR_BELOW, AT_THE_STANDARD } from '@/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK, ACE_GOLD } from '@/lib/today';


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
export function ChartKey({ summary }: { summary?: string }) {
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
    /*
      ── One line, where there were a hundred and forty-five ────────────────────────────────────

      Kris, 18 September: *"why is the design so boring"*, then *"this is not at all like the design
      i sent you"*. He is right, and this block was the clearest case of it. The design puts the key
      on ONE LINE above the chart. The product had a full-width card under it explaining the four
      bands, then a paragraph about the letters, then another about the circles and the star — a
      lecture sitting beneath a diagram that was already saying all of it.

      This product's habit is to explain itself whenever something might be unclear, because a
      paragraph is the cheapest thing to add. It is also the most boring thing to read, and enough of
      them turn a dashboard into a manual.

      So: the bands as a line, the way the design draws them, and everything else folded into a
      detail somebody can open once and never again. Nothing is deleted — the words are all still
      here — but the page stops lecturing.
    */
    <div className="text-[13px] text-ink-light">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {bands.map(b => (
          <span key={b.label} className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: b.colour }} />
            <span style={{ color: b.ink }}>{b.label}</span>
          </span>
        ))}
        <span className="border-l border-rust-200 pl-3 text-ink-light/80">
          Green is not SPEC &mdash; SPEC is {standard}% on every pillar.
        </span>
        {/*
          How big the chart is, how much of it is off, and how much is green — the design prints
          these three on the end of the key, where they are read in the same glance as the colours
          they are counting.
        */}
        {summary && <span className="text-ink-light/80">{summary}</span>}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer select-none hover:text-rust">What the colours mean</summary>
        <div className="mt-2 grid max-w-3xl gap-2">
          {bands.map(b => (
            <p key={b.label}>
              <span style={{ color: b.ink }}>{b.label}</span> &mdash; {b.note}
            </p>
          ))}
          <p>
            Each card carries four letters &mdash; Safety, People, Earnings, Compliance &mdash; in the
            colour that pillar is scoring this month. A role with no KPIs set shows grey rather than
            red: nothing has gone wrong, it simply is not being measured yet.
          </p>
          {/*
            Kept word for word through the rewrite, and `tests/ace-watch.test.ts` is why: a mark on
            a card that nobody explains is the exact fault this key exists for. Folding the key away
            must not quietly delete the thing it was folded around.
          */}
          <p>
            <b>Every role has an Ace.</b> The three circles are how many of the three months are
            held: three closed months at {standard}% or above together doubles that person&rsquo;s
            incentive the month after, and then the three-month run starts again. Hollow circles
            mean the run is not yet signed off, so nothing is promised &mdash; a filled circle for a
            month a manager has not signed would promise a doubling that will not arrive. The star
            is the standing rather than the money, and stays for as long as the run is unbroken.
          </p>
        </div>
      </details>
    </div>
  );
}
