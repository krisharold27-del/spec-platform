import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PILLAR_META, BRAND_COLOUR, SCORE_COLOUR, SCORE_INK, scoreColour, scoreInk } from '../src/lib/pillars';
import { LIGHT_COLOUR, LIGHT_INK } from '../src/lib/today';
import { PILLARS } from '../src/lib/scoring';

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
  it('reads a score against the 90% rule', () => {
    expect(scoreColour(1)).toBe(SCORE_COLOUR.on_track);
    expect(scoreColour(0.9)).toBe(SCORE_COLOUR.on_track);
    expect(scoreColour(0.89)).toBe(SCORE_COLOUR.watch);
    expect(scoreColour(0.75)).toBe(SCORE_COLOUR.watch);
    expect(scoreColour(0.74)).toBe(SCORE_COLOUR.behind);
    expect(scoreColour(0)).toBe(SCORE_COLOUR.behind);
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

  it('picks ink by the same 90% rule as the fill', () => {
    expect(scoreInk(0.9)).toBe(SCORE_INK.on_track);
    expect(scoreInk(0.89)).toBe(SCORE_INK.watch);
    expect(scoreInk(0.74)).toBe(SCORE_INK.behind);
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
