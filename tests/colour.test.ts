import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PILLAR_META, BRAND_COLOUR, SCORE_COLOUR, SCORE_INK, scoreColour, scoreInk } from '../src/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK } from '../src/lib/today';
import { PILLARS } from '../src/lib/scoring';
import { GREEN_FROM, RED_AT_OR_BELOW } from '../src/lib/pillars';
import { FAILED_AT_OR_BELOW, failedPillarCount } from '../src/lib/incentive';
import { band } from '../src/lib/scoring';
import { light } from '../src/lib/today';


/**
 * Option D, held in place.
 *
 * The pillar is a letter and colour is only ever the score. The failure this prevents is subtle and
 * permanent: two colour systems on one card can contradict each other — a People card painted sage
 * as its identity, with a red score inside it, shows two greens and a red meaning three different
 * things. One system cannot do that, and the letter carries the identity for anybody who cannot
 * separate sage from ochre.
 *
 * The brand colours are not deleted, they are moved: the logo, the public site, and the printed
 * board pack. So these tests are about WHERE a colour may appear, not whether it exists.
 */

/** Where the brand may still speak: presenting SPEC, rather than showing a business its numbers. */
const BRAND_IS_ALLOWED = [
  'src/app/how/page.tsx',
  'src/app/sectors/page.tsx',
  'src/app/start/page.tsx',
  'src/app/board/[periodId]/page.tsx',
  'src/components/spec-mark.tsx',
  'src/lib/pillars.ts',
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('a pillar has no colour of its own', () => {
  it('carries only a name, a letter and a question', () => {
    for (const p of PILLARS) {
      expect(Object.keys(PILLAR_META[p]).sort()).toEqual(['letter', 'name', 'question']);
    }
  });

  it('spells SPEC, which is the point of using letters at all', () => {
    expect(PILLARS.map(p => PILLAR_META[p].letter).join('')).toBe('SPEC');
  });
});

describe('colour is only ever the score', () => {
  it('has one colour per band and nothing else', () => {
    expect(Object.keys(SCORE_COLOUR).sort()).toEqual(['behind', 'on_track', 'pending', 'watch']);
  });

  /**
   * The 90% rule, which is the standard the whole product is built on — not `band()`, which calls a
   * pillar "on track" only at 100%. That is right for a label and wrong for a light: a business
   * holding 94% would see amber everywhere while being told it is at the standard.
   */
  /*
    Green at 90, amber 75–89, red below 75. Settled by Kris, who owns the method.

    The lower line was moved to 50% on the reasoning that a colour must agree with the money, since
    the incentive only deducts below 50%. That assumed one line doing two jobs. There are two:

      the COLOUR line (75%)  — what a leader should be looking at. A pillar in the sixties is not
                               fine, and a chart calling it fine until 50% hides a slide for months.
      the MONEY line (50%)   — what costs somebody a payment. band() in lib/scoring, FAILED_BELOW in
                               lib/incentive, and designs/the-rules.md: "A pillar at 60% is a bad
                               month, not a failure, and does not deduct."

    So 60% is red here AND deducts nothing, and both are right. The boundaries are pinned exactly,
    because an off-by-one on a threshold is invisible in review and obvious to a customer.
  */
  it('reads a score against the bands Kris set', () => {
    expect(scoreColour(1)).toBe(SCORE_COLOUR.on_track);
    expect(scoreColour(0.9)).toBe(SCORE_COLOUR.on_track);
    expect(scoreColour(0.8)).toBe(SCORE_COLOUR.on_track);      // exactly 80 is green
    expect(scoreColour(0.799)).toBe(SCORE_COLOUR.watch);
    expect(scoreColour(0.51)).toBe(SCORE_COLOUR.watch);
    expect(scoreColour(0.5)).toBe(SCORE_COLOUR.behind);        // exactly 50 is RED, not amber
    expect(scoreColour(0.499)).toBe(SCORE_COLOUR.behind);
    expect(scoreColour(0)).toBe(SCORE_COLOUR.behind);
  });

  /*
    The two lines are different on purpose, and nothing may quietly make them the same again.
    If somebody "tidies" one into the other, the chart either goes blind between 50 and 75 or the
    incentive starts deducting for a bad month. Both are serious and neither is obvious.
  */
  /*
    One line now, not two. Red on a card and money coming off mean the same thing — a quadrant at or
    under 50%. They were apart for a while, red starting at 75% while the deduction waited for 50%,
    which let somebody see three red quadrants and no deduction and reasonably call it a bug.
  */
  it('makes red on a card and a deduction the same thing', () => {
    expect(GREEN_FROM).toBe(0.8);
    expect(RED_AT_OR_BELOW).toBe(0.5);
    expect(FAILED_AT_OR_BELOW).toBe(RED_AT_OR_BELOW);
    // Exactly 50% — the round number people land on — is red AND is a failure.
    expect(scoreColour(0.5)).toBe(SCORE_COLOUR.behind);
    expect(band(0.5)).toBe('behind');
    expect(failedPillarCount([0.5])).toBe(1);
    // A hair above it is amber and costs nothing.
    expect(scoreColour(0.501)).toBe(SCORE_COLOUR.watch);
    expect(failedPillarCount([0.501])).toBe(0);
  });

  // Pending is never red. A month nobody has marked is not a failing month, and colouring it as one
  // teaches people to enter something rather than to go and find out.
  it('draws an unscored month as a warm neutral, never as a failure', () => {
    expect(scoreColour(null)).toBe(SCORE_COLOUR.pending);
    expect(SCORE_COLOUR.pending).not.toBe(SCORE_COLOUR.behind);
  });
});

/**
 * A colour nobody can read is not a signal, it is decoration.
 *
 * WCAG AA asks 4.5:1 for ordinary text. The signal colours do not clear it on this warm ground —
 * amber sits at 3.0:1, the pending grey at 3.0:1, and green at 3.7:1 on a surface card. Only red
 * passes. That is why there are two palettes: one to be looked at, one to be read.
 *
 * Measured rather than asserted, so the numbers cannot drift behind a comment. Change a hex and
 * this tells you what it does to a person who has to read it.
 */
const CREAM = '#f5ead8';    // the page
const SURFACE = '#ebddc5';  // a card on the page
const AA = 4.5;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('anything a person has to read is readable', () => {
  it('measures contrast the way a browser does', () => {
    // Two fixed points: the extremes have known ratios, so a broken formula cannot pass quietly.
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast(CREAM, CREAM)).toBeCloseTo(1, 5);
  });

  it('clears AA for every band, on the page and on a card', () => {
    for (const [band, hex] of Object.entries(SCORE_INK)) {
      for (const [where, ground] of [['page', CREAM], ['card', SURFACE]] as const) {
        const ratio = contrast(hex, ground);
        expect(ratio, `${band} ${hex} on the ${where} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  // The record of why the second palette exists. If a fill colour ever did clear AA on its own,
  // this would fail and tell us the ink for that band is no longer earning its place.
  it('records that the fill colours do not, which is the whole reason for the ink', () => {
    const failing = Object.entries(SCORE_COLOUR)
      .filter(([, hex]) => contrast(hex, SURFACE) < AA)
      .map(([band]) => band);
    expect(failing.sort()).toEqual(['on_track', 'pending', 'watch']);
  });

  it('keeps the two palettes the same four bands, differing only in darkness', () => {
    expect(Object.keys(SCORE_INK).sort()).toEqual(Object.keys(SCORE_COLOUR).sort());
    for (const band of Object.keys(SCORE_COLOUR) as (keyof typeof SCORE_COLOUR)[]) {
      expect(luminance(SCORE_INK[band]), `${band} ink should be darker than its fill`)
        .toBeLessThan(luminance(SCORE_COLOUR[band]));
    }
  });

  // today.ts names the same four bands 'green'/'amber'/'red'/'pending'. Two spellings of one idea is
  // already a risk; two spellings that disagree on the hex would be a bug nobody sees until print.
  it('agrees with the light palette it mirrors', () => {
    expect(LIGHT_INK.green).toBe(SCORE_INK.on_track);
    expect(LIGHT_INK.amber).toBe(SCORE_INK.watch);
    expect(LIGHT_INK.red).toBe(SCORE_INK.behind);
    expect(LIGHT_INK.pending).toBe(SCORE_INK.pending);
    expect(LIGHT_COLOUR.green).toBe(SCORE_COLOUR.on_track);
    expect(LIGHT_COLOUR.amber).toBe(SCORE_COLOUR.watch);
  });

  it('picks ink by the same bands as the fill', () => {
    expect(scoreInk(0.9)).toBe(SCORE_INK.on_track);
    expect(scoreInk(0.8)).toBe(SCORE_INK.on_track);
    expect(scoreInk(0.799)).toBe(SCORE_INK.watch);
    expect(scoreInk(0.501)).toBe(SCORE_INK.watch);
    expect(scoreInk(0.5)).toBe(SCORE_INK.behind);
    expect(scoreInk(null)).toBe(SCORE_INK.pending);
  });
});

describe('the brand colours stay out of the product', () => {
  /**
   * Read as text, deliberately. This is a one-line regression — somebody reaches for a pillar
   * colour to brighten a card, it looks like an improvement, and the two-colour-system problem is
   * quietly back. The compiler cannot catch it because BRAND_COLOUR is a legitimate export.
   */
  it('is imported only by the site, the pack and the mark', () => {
    const offenders = sourceFiles('src')
      .filter(f => readFileSync(f, 'utf8').includes('BRAND_COLOUR'))
      .map(f => f.replace(/\\/g, '/'))
      .filter(f => !BRAND_IS_ALLOWED.includes(f));
    expect(offenders).toEqual([]);
  });

  it('never hard-codes one of the four hexes anywhere in the product', () => {
    const hexes = Object.values(BRAND_COLOUR).map(h => h.toLowerCase());
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const path = file.replace(/\\/g, '/');
      if (BRAND_IS_ALLOWED.includes(path)) continue;
      const text = readFileSync(file, 'utf8').toLowerCase();
      if (hexes.some(h => text.includes(h))) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  // It has to still exist somewhere, or the brand has simply been thrown away.
  it('still defines all four, for the places that may use them', () => {
    expect(Object.keys(BRAND_COLOUR).sort()).toEqual([...PILLARS].sort());
    for (const p of PILLARS) expect(BRAND_COLOUR[p]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

/*
  ── One threshold, one place ─────────────────────────────────────────────────────────────────────

  When the colour line moved from 50% to 75%, four separate places held a copy of it: lib/pillars,
  light() in lib/today (every light on My Page and every card on the org chart), lib/scorecard, and
  the chart key. Three would have been left on the old number, and the product would have painted
  the same score two different colours on two different screens — with no test failing.

  A threshold that drifts is invisible in review and obvious to a customer. So every reader now
  takes it from the constant, and this walks the actual functions to prove it.
*/
describe('every screen bands a score the same way', () => {
  it('agrees at the boundaries, wherever the score is drawn', () => {
    const cases: [number, 'green' | 'amber' | 'red'][] = [
      [1, 'green'], [0.9, 'green'], [0.8, 'green'], [0.799, 'amber'], [0.6, 'amber'],
      [0.501, 'amber'], [0.5, 'red'], [0.2, 'red'], [0, 'red'],
    ];
    for (const [score, want] of cases) {
      expect(light(score), `light(${score})`).toBe(want);
      const colour = { green: SCORE_COLOUR.on_track, amber: SCORE_COLOUR.watch, red: SCORE_COLOUR.behind }[want];
      expect(scoreColour(score), `scoreColour(${score})`).toBe(colour);
    }
  });

  it('reads the constants rather than a number somebody typed', () => {
    expect(light(GREEN_FROM)).toBe('green');
    expect(light(GREEN_FROM - 0.001)).toBe('amber');
    expect(light(RED_AT_OR_BELOW + 0.001)).toBe('amber');
    expect(light(RED_AT_OR_BELOW)).toBe('red');
  });
});
