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
 * The thresholds every light in the product already uses: the 90% rule, and three quarters below it.
 *
 * Deliberately NOT `band()`. That function answers a different question — it calls a pillar "on
 * track" only at 100%, because a pillar is a set of measures and every one of them should be met.
 * That is the right rule for a LABEL and the wrong one for a light: a business holding 94% would
 * see amber on every card while being told it is at the standard, which is the contradiction
 * Option D exists to remove. The two live side by side on purpose; this one is the colour.
 */
export const AT_THE_STANDARD = 0.9;
export const WATCH_FROM = 0.75;

/** What colour a score is drawn in, anywhere in the product. The only colour rule there is. */
export function scoreColour(score: Score): string {
  if (score === null) return SCORE_COLOUR.pending;
  if (score >= AT_THE_STANDARD) return SCORE_COLOUR.on_track;
  if (score >= WATCH_FROM) return SCORE_COLOUR.watch;
  return SCORE_COLOUR.behind;
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
