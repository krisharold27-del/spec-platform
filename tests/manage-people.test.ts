import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MANAGEMENT_STANCE, NON_NEGOTIABLES, READING } from '../src/lib/manage-people';
import { CHARTER } from '../src/lib/charter';
import { PILLARS } from '../src/lib/scoring';

/**
 * How SPEC says a business should manage its people — design export 7.
 *
 * The thing worth holding here is not the words. It is that SPEC now has TWO sets of four, and they
 * are different on purpose. A later reader will see two lists of four pillar statements and tidy
 * them into one, and the distinction will be gone without anybody deciding to lose it.
 */

describe('the four non-negotiables', () => {
  it('covers every pillar, once, in order', () => {
    expect(NON_NEGOTIABLES.map(n => n.pillar)).toEqual([...PILLARS]);
  });

  it('IS NOT THE BOARD CHARTER, and must never be merged with it', () => {
    /*
      `lib/charter.ts` holds what the BOARD commits to and how each one is measured — with a figure,
      a basis, and the argument for why it is not negotiable. A board signs those.

      These are what a MANAGER may not trade away, in the words a supervisor uses on a Tuesday. The
      clearest case is People: the charter says "Never lose great talent", which is a number the
      board watches; this says "No culture that sets people up to fail", which is a rule about how
      you run the floor. A business could hold one and break the other, which is exactly why both
      exist.
    */
    for (const n of NON_NEGOTIABLES) {
      const board = CHARTER.find(c => c.pillar === n.pillar);
      expect(board, n.pillar).toBeTruthy();
      expect(n.says, `${n.pillar} has become a copy of the charter`).not.toBe(board!.says);
    }
    // And the charter still carries what makes it a charter: a measurement and a reason.
    for (const c of CHARTER) {
      expect(c.measured, c.pillar).toBeTruthy();
      expect(c.because, c.pillar).toBeTruthy();
    }
  });

  it('says what may not be traded away, not how it is measured', () => {
    // No figures, no percentages, no counting. That is the charter's job and mixing them is how one
    // of the two quietly becomes the other.
    for (const n of NON_NEGOTIABLES) {
      expect(n.says, n.pillar).not.toMatch(/\d+%|\bcounted\b|\bmeasured\b/i);
      expect(n.says.length, `${n.pillar} is too short to be a rule`).toBeGreaterThan(25);
    }
  });
});

describe('the argument it rests on', () => {
  it('names the root, not the behaviour', () => {
    // The whole stance: what you see on the floor is a symptom, and the gap is management's to close.
    expect(MANAGEMENT_STANCE.heading).toContain('Self-managing teams');
    expect(MANAGEMENT_STANCE.says).toContain('symptom');
    expect(MANAGEMENT_STANCE.says.toLowerCase()).toContain("management");
  });

  it('never puts it on the individual', () => {
    // A training pack that blames the person it is training is one nobody finishes.
    expect(MANAGEMENT_STANCE.says).toContain('not the individual');
  });
});

describe('the reading list', () => {
  it('is in an order, and says where to start', () => {
    expect(READING).toHaveLength(3);
    expect(READING[0].when.toLowerCase()).toContain('start here');
    // Who it is for, on the first one — this list exists for a new supervisor with no time.
    expect(READING[0].when.toLowerCase()).toContain('supervisor');
  });

  it('every book has a title and somebody who wrote it', () => {
    for (const r of READING) {
      expect(r.title, JSON.stringify(r)).toBeTruthy();
      expect(r.author, JSON.stringify(r)).toBeTruthy();
      expect(r.when, JSON.stringify(r)).toBeTruthy();
    }
  });
});

describe('colour still says how it is going, never what it is', () => {
  it('THE FOUR ARE NOT TINTED BY PILLAR, although the design tints them', () => {
    /*
      The design gives each card its own colour — green Safety, RED People, blue Earnings, rust
      Compliance. SPEC has an older rule, written into lib/pillars: colour says how something is
      GOING, never what it IS, and the letter badge is coloured by the score or not at all.

      Painting People red as an identity would make that pillar read as failing, on the one page
      whose entire argument is that failure is management's doing and fixable. Recorded as a
      deliberate difference in designs/superseded.md rather than quietly done.
    */
    const page = readFileSync(new URL('../src/app/training/page.tsx', import.meta.url), 'utf8');
    const block = page.slice(page.indexOf('How SPEC manages people'));
    expect(block).toContain('<Badge pillar={n.pillar} />');
    // No hard-coded pillar colours anywhere in the block.
    expect(block, 'a pillar is being coloured by what it is').not.toMatch(/#4f7a3f|#a63b26|#2f5f8a|#c67139/);
  });

  it('and the difference is written down, not just avoided', () => {
    const noted = readFileSync(new URL('../designs/superseded.md', import.meta.url), 'utf8');
    expect(noted).toContain('non-negotiables');
  });
});
