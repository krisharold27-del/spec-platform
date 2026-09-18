import { LIGHT_COLOUR } from '@/lib/today';

/**
 * The SPEC mark: the O is the outcome and the clock, and the claw is the hand.
 *
 * From the logo design — this is one object rather than a logo and a separate set of charts. The
 * ring is how much of the month is proved; the hand pivots at the centre and sits exactly where the
 * score sits. At 100% the ring closes, the hand lands on twelve, and it stays there. It never runs
 * back to red, because the point of the mark is starting something and finishing it.
 *
 * So the same component is the favicon, the nav brand, a role's month and the business score. A
 * score drawn as the brand is the strongest version of "your whole business on one page", and it
 * means the brand is never decoration sitting next to the data.
 *
 * `score` null is the brand at rest — the snapped state, closed and green — which is the version
 * used everywhere outside the product. Pending is never red: an unscored month is drawn as an open
 * grey ring, not an empty one.
 */

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Where a score sits on the dial, and therefore where the hand points. Twelve o'clock is done. */
const angleFor = (score: number) => score * 360;

/** The same thresholds as every light in the product. */
function toneFor(score: number | null): string {
  if (score === null) return LIGHT_COLOUR.green; // at rest: snapped
  if (score >= 0.9) return LIGHT_COLOUR.green;
  if (score >= 0.75) return LIGHT_COLOUR.amber;
  return LIGHT_COLOUR.red;
}

/**
 * ── The mark MOVES ───────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 18 September: *"the top left logo is supposed to move - you haven't done half the thing in
 * this build"*. He is right, and it was not a small omission. Every design file opens with this mark
 * PLAYING: over four and a half seconds the ring runs from red, through amber, to green; the hand
 * sweeps round with it and lands on twelve; and a small crown appears at the end. That is SPEC's
 * whole argument in four seconds — a business starts behind, closes its months, and finishes green —
 * and the product was drawing the last frame of it as a still.
 *
 * It plays once and freezes (`fill="freeze"`), which is the design's own behaviour and also the
 * reason it is safe: WCAG's moving-content rule is about motion that lasts beyond five seconds or
 * repeats, and this does neither. SMIL rather than CSS keyframes, because the same file has to serve
 * as the favicon, where no stylesheet is loaded.
 *
 * It plays only for the mark AT REST. A mark carrying a real score is a reading, and a reading that
 * animates itself to green would be the product telling a customer something that is not true.
 */
const PLAY = '4.5s';

export function SpecMark({
  score = null,
  size = 32,
  title,
  className,
  animate,
}: {
  /** 0–1, or null for the mark at rest. */
  score?: number | null;
  size?: number;
  title?: string;
  className?: string;
  /** Defaults to true for the mark at rest, false for one carrying a score. */
  animate?: boolean;
}) {
  const at = score === null ? 1 : Math.max(0, Math.min(1, score));
  const tone = toneFor(score);
  const label = title ?? (score === null ? 'SPEC' : `${Math.round(at * 100)}%`);
  const moving = animate ?? score === null;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      {/* The design's disc is the deep sage, not black. */}
      <circle cx="50" cy="50" r={RADIUS} fill="#3d5c31" />

      {/* The unproved part of the month, so the ring reads as a dial rather than as a gap. */}
      <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#e3d7c0" strokeOpacity="0.35" strokeWidth="7" />

      {/* The ring travels with the score, starting at twelve and going round once. */}
      {moving ? (
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={Math.round(CIRCUMFERENCE)}
          transform="rotate(-90 50 50)"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="276;276;72;9;0;0"
            keyTimes="0;0.08;0.62;0.84;0.92;1"
            dur={PLAY}
            fill="freeze"
          />
          <animate
            attributeName="stroke"
            values="#a63b26;#a63b26;#c67139;#c67139;#4f7a3f;#4f7a3f"
            keyTimes="0;0.08;0.4;0.62;0.89;1"
            dur={PLAY}
            fill="freeze"
          />
        </circle>
      ) : (
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={tone}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * at} ${CIRCUMFERENCE}`}
          transform="rotate(-90 50 50)"
        />
      )}

      {/* Twelve, three, six, nine. */}
      <g stroke="#e3d7c0" strokeLinecap="round" strokeWidth="2.6" opacity="0.55">
        <line x1="50" y1="14" x2="50" y2="9" />
        <line x1="86" y1="50" x2="91" y2="50" />
        <line x1="50" y1="86" x2="50" y2="91" />
        <line x1="14" y1="50" x2="9" y2="50" />
      </g>

      {/*
        The claw. It pivots at the centre and points outward — blades soft, curved and round, per
        the designer's brief. Rotated so that a finished month rests on twelve.

        Moving, it overshoots slightly past twelve and settles back, which is the design's own
        easing and the thing that makes it read as a hand rather than a wipe.
      */}
      {/*
        TWO groups, not one — the outer moves the pivot to the centre, the inner turns.

        Animating `transform` REPLACES the element's own transform attribute rather than composing
        with it, so putting the rotation on the same group as `translate(50 50)` spun the claw about
        the top-left corner of the picture and drew it off the canvas: the mark rendered as a plain
        green disc. Caught by photographing the header rather than by reading the markup back.
      */}
      <g transform="translate(50 50)">
        <g transform={moving ? undefined : `rotate(${270 + angleFor(at)})`} fill="#f5ead8">
          {moving && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="-90;-90;186;258;278;268;270"
              keyTimes="0;0.08;0.62;0.84;0.89;0.93;1"
              dur={PLAY}
              fill="freeze"
            />
          )}
          <rect x="-8" y="-9" width="16" height="20" rx="8" />
          <path d="M8 -9 Q 26 -8, 38 -1.6 A 4 4 0 0 1 38 4.6 Q 24 5.6, 8 5.6 Z" />
          <path d="M8 11 Q 26 10, 38 4.2 A 4 4 0 0 0 38 -2.2 Q 24 -2.8, 8 -3.4 Z" opacity="0.72" />
        </g>
      </g>

      {/* The crown, which arrives only when the ring has closed. */}
      {moving ? (
        <g opacity="0">
          <animate attributeName="opacity" values="0;0;1;0.95" keyTimes="0;0.86;0.9;1" dur={PLAY} fill="freeze" />
          <circle cx="50" cy="12" r="5" fill="#f5ead8" />
          <circle cx="39" cy="7" r="2.8" fill="#f5ead8" />
          <circle cx="61" cy="7" r="2.8" fill="#f5ead8" />
          <circle cx="50" cy="0" r="2" fill="#f5ead8" />
        </g>
      ) : (
        <circle cx="50" cy="14" r="3.6" fill={tone} />
      )}
    </svg>
  );
}

/** The mark with the name beside it, for a header. */
export function SpecLockup({ size = 42, line }: { size?: number; line?: string }) {
  return (
    /* 42px, not 28. The design draws the mark at 56 in its bar; at 28 the ring, the hand and the
       crown are all smaller than the type beside them and the whole animation is invisible. */
    <span className="inline-flex items-center gap-2.5">
      <SpecMark size={size} />
      <span className="font-serif text-xl leading-none tracking-tight text-ink">
        SPEC<span className="text-rust">.</span>
      </span>
      {line && <span className="hidden text-xs text-ink-light sm:inline">{line}</span>}
    </span>
  );
}
