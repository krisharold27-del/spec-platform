/**
 * The four pillars as presentation values — pure, and safe to import from a client component.
 *
 * These live here rather than in components/ui because ui.tsx's Shell reaches for the signed-in
 * user, which pulls `next/headers` in behind it. A client component that only wants a pillar's name
 * should not drag the server's request context along with it.
 *
 * ── Option D: the pillar is a letter, and colour is only ever the score ──────────────────────────
 *
 * A pillar carries NO colour in the product. It is identified by its letter — S, P, E, C — and the
 * only thing that is ever coloured is how the score is going: green, amber, red.
 *
 * The reason is that two colour systems on one card can contradict each other. A People card
 * painted sage as its identity, with a red score inside it, is showing two greens and a red that
 * mean three different things; a reader has to learn which green is which before they can read
 * their own business. With one system that cannot happen — you read the colour for the problem and
 * the letter for what it is, and the two can never disagree. It is also colour-blind safe, because
 * the letter carries the identity and nobody has to distinguish sage from ochre to know which
 * pillar they are looking at.
 *
 * The four brand colours are not deleted, they are moved: they live in the logo, on the public site
 * and in the printed board pack, which is why BRAND_COLOUR below is separate and says where it may
 * be used. Keeping them out of PILLAR_META is deliberate — the wrong thing should be hard to reach.
 */
import type { Pillar, Score } from './scoring';

/* The two lines every colour and every word in the product is banded against. */

export const PILLAR_META: Record<Pillar, { name: string; letter: string; question: string }> = {
  safety:     { name: 'Safety',     letter: 'S', question: 'Are we going well in Safety?' },
  people:     { name: 'People',     letter: 'P', question: 'Does everyone love coming to work?' },
  earnings:   { name: 'Earnings',   letter: 'E', question: 'Are we making money?' },
  compliance: { name: 'Compliance', letter: 'C', question: 'Are we clear to work?' },
};

/**
 * The only colours the product uses: how it is going, never what it is.
 *
 * Pending is a warm neutral and never red — a month nobody has marked yet is not a failing month,
 * and colouring it as one teaches people to enter something rather than to go and find out.
 */
export const SCORE_COLOUR = {
  on_track: '#4f7a3f',
  watch: '#c67139',
  behind: '#a63b26',
  pending: '#8c8681',
} as const;

/**
 * The same four signals, dark enough to read as WORDS.
 *
 * The colours above are tuned to be *seen* — a dot, a bar, the edge of a card, where the eye only
 * has to tell them apart. Set as text on the warm ground they are too light to be *read*: amber
 * lands at 3.0:1 and the warm grey at 3.0:1, against the 4.5:1 ordinary eyesight needs, and even
 * green only reaches 3.7:1 on a surface card. Three of the four fail, so this was never an amber
 * problem — it is that a colour picked to be distinguishable was being asked to be legible.
 *
 * Hence one rule: a fill, a dot or a bar takes SCORE_COLOUR; anything a person has to READ takes
 * SCORE_INK. Same signal, same meaning, one step down the design system's own ramp — every value
 * here is an existing token. `tests/colour.test.ts` measures all of them against both grounds and
 * fails the build if any drops below the standard, so this cannot quietly come undone.
 */
export const SCORE_INK = {
  on_track: '#56633f',  // --color-accent-2-700
  watch: '#8c491a',     // --color-accent-700
  behind: '#8c3220',
  pending: '#645c50',   // --color-neutral-700
} as const;

/**
 * The 90% rule above, and the failure line beneath it — which is FIFTY per cent, not seventy-five.
 *
 * Deliberately NOT `band()`. That function answers a different question — it calls a pillar "on
 * track" only at 100%, because a pillar is a set of measures and every one of them should be met.
 * That is the right rule for a LABEL and the wrong one for a light: a business holding 94% would
 * see amber on every card while being told it is at the standard, which is the contradiction
 * Option D exists to remove. The two live side by side on purpose; this one is the colour.
 *
 * ── Two lines, not one ──────────────────────────────────────────────────────────────────────────
 *
 * This was moved to 0.5 on the reasoning that a colour must agree with the money: the incentive
 * deducts for a pillar "under 50%", so painting 60% red looked like accusing somebody of a failure
 * the pay did not agree was one.
 *
 * Kris settled it, and the reasoning was wrong because it assumed one line doing two jobs. There
 * are two, and they measure different things:
 *
 *   **The colour line — 75%.** What a leader should be looking at. A pillar in the sixties is not
 *   fine, and a chart that says it is fine until 50% hides a problem for months. Amber is 75–89%;
 *   below 75% is red. This is the one on the cards, and it is a management instrument.
 *
 *   **The money line — 50%, in lib/incentive as FAILED_BELOW.** What costs somebody a payment.
 *   designs/the-rules.md is explicit: "A pillar at 60% is a bad month, not a failure, and does not
 *   deduct."
 *
 * So a pillar at 60% is red on the chart AND deducts nothing, and both are correct. The colour asks
 * for attention; the deduction is a consequence. Conflating them made the chart blind to exactly
 * the range where a business is quietly sliding — which is the range SPEC exists to catch.
 *
 * `designs/the-rules.md` §5 and §7.
 */
export { AT_THE_STANDARD, GREEN_FROM, RED_AT_OR_BELOW } from './scoring';
import { AT_THE_STANDARD, GREEN_FROM, RED_AT_OR_BELOW } from './scoring';

/**
 * Kept for callers that still say WATCH_FROM. Amber begins just above the red line.
 * @deprecated Read GREEN_FROM and RED_AT_OR_BELOW, which say which side of each line they mean.
 */
export const WATCH_FROM = RED_AT_OR_BELOW;

/** Which of the four a score is. Every colour rule in the product starts here. */
export function scoreBand(score: Score): keyof typeof SCORE_COLOUR {
  if (score === null) return 'pending';
  if (score >= GREEN_FROM) return 'on_track';
  if (score > RED_AT_OR_BELOW) return 'watch';
  return 'behind';
}

/** What colour a score is FILLED in — dots, bars, card edges. Nothing is read off this. */
export function scoreColour(score: Score): string {
  return SCORE_COLOUR[scoreBand(score)];
}

/** What colour a score is WRITTEN in. Use this wherever the colour lands on text. */
export function scoreInk(score: Score): string {
  return SCORE_INK[scoreBand(score)];
}

/**
 * The four brand colours.
 *
 * **Not for use in the product.** They belong to the logo, the public site and the printed board
 * pack — the places where SPEC is presenting itself rather than showing a business its own numbers.
 * Inside the product a pillar is a letter; see the note at the top of this file.
 */
export const BRAND_COLOUR: Record<Pillar, string> = {
  safety: '#b2622d',
  people: '#728157',
  earnings: '#a67c1a',
  compliance: '#7d5068',
};

/** No score renders as a dash, never as 0%. */
export const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
