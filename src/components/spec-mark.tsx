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

export function SpecMark({
  score = null,
  size = 32,
  title,
  className,
}: {
  /** 0–1, or null for the mark at rest. */
  score?: number | null;
  size?: number;
  title?: string;
  className?: string;
}) {
  const at = score === null ? 1 : Math.max(0, Math.min(1, score));
  const tone = toneFor(score);
  const label = title ?? (score === null ? 'SPEC' : `${Math.round(at * 100)}%`);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      <circle cx="50" cy="50" r={RADIUS} fill="#1c1a19" />

      {/* The unproved part of the month, so the ring reads as a dial rather than as a gap. */}
      <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="7" />

      {/* The ring travels with the score, starting at twelve and going round once. */}
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

      {/* Twelve, three, six, nine. */}
      <g stroke={tone} strokeLinecap="round" strokeWidth="2.6" opacity="0.85">
        <line x1="50" y1="14" x2="50" y2="9" />
        <line x1="86" y1="50" x2="91" y2="50" />
        <line x1="50" y1="86" x2="50" y2="91" />
        <line x1="14" y1="50" x2="9" y2="50" />
      </g>

      {/*
        The claw. It pivots at the centre and points outward — blades soft, curved and round, per
        the designer's brief. Rotated so that a finished month rests on twelve.
      */}
      <g transform={`translate(50 50) rotate(${270 + angleFor(at)})`} fill="#f5ead8">
        <rect x="-8" y="-9" width="16" height="20" rx="8" />
        <path d="M8 -9 Q 26 -8, 38 -1.6 A 4 4 0 0 1 38 4.6 Q 24 5.6, 8 5.6 Z" />
        <path d="M8 11 Q 26 10, 38 4.2 A 4 4 0 0 0 38 -2.2 Q 24 -2.8, 8 -3.4 Z" opacity="0.72" />
      </g>

      <circle cx="50" cy="14" r="3.6" fill={tone} />
    </svg>
  );
}

/** The mark with the name beside it, for a header. */
export function SpecLockup({ size = 28, line }: { size?: number; line?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <SpecMark size={size} />
      <span className="font-serif text-lg leading-none tracking-tight text-ink">
        SPEC<span className="text-rust">.</span>
      </span>
      {line && <span className="hidden text-xs text-ink-light sm:inline">{line}</span>}
    </span>
  );
}
