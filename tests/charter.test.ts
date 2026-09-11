import { describe, it, expect } from 'vitest';
import { CHARTER, commitmentFor, charterStanding, charterHeld } from '../src/lib/charter';
import { PILLARS } from '../src/lib/scoring';

describe('the Board Charter', () => {
  it('is one commitment per pillar, and only one', () => {
    expect(CHARTER).toHaveLength(4);
    expect(CHARTER.map(c => c.pillar).sort()).toEqual([...PILLARS].sort());
  });

  it('holds the four the board actually signs', () => {
    expect(commitmentFor('safety').says).toBe('Zero harm, physical or mental.');
    expect(commitmentFor('people').says).toBe('Never lose great talent.');
    expect(commitmentFor('earnings').says).toContain('percentage this business needs to be profitable');
    expect(commitmentFor('compliance').says).toContain('commitments the business has already made');
  });

  /**
   * The distinction the whole charter rests on. Three commitments are absolute — their number is
   * nought and is never derived from what the business has been managing. Exactly one is earned
   * from the business's own record, and it is the money one, because that is the only one of the
   * four that is a fact about this business rather than a line every business holds.
   */
  it('makes gross profit the only earned commitment', () => {
    expect(CHARTER.filter(c => c.basis === 'earned').map(c => c.pillar)).toEqual(['earnings']);
    expect(CHARTER.filter(c => c.basis === 'absolute')).toHaveLength(3);
  });

  it('gives every absolute commitment the same figure, and the earned one none', () => {
    for (const c of CHARTER) {
      if (c.basis === 'absolute') expect(c.figure).toBe('0');
      else expect(c.figure).toBeNull();
    }
  });

  // SPEC does not know what any business needs to be profitable, and a figure taken from somewhere
  // else is either comfortable enough to be useless or high enough to be ignored.
  it('names no percentage, industry or figure anywhere in the charter', () => {
    const words = CHARTER.map(c => `${c.says} ${c.measured} ${c.because}`).join(' ');
    expect(words).not.toMatch(/\d+\s*%/);
    expect(words).not.toMatch(/electrical|plumbing|construction|trade/i);
  });

  it('says why each one is not open to negotiation', () => {
    for (const c of CHARTER) expect(c.because.length).toBeGreaterThan(40);
  });
});

describe('charterStanding', () => {
  const reading = (pillar: 'safety' | 'people' | 'earnings' | 'compliance', breached: boolean | null) =>
    ({ pillar, reading: null, breached });

  it('reports a commitment nobody has measured as unmeasured, never as broken', () => {
    const lines = charterStanding([]);
    expect(lines.every(l => l.held === 'unmeasured')).toBe(true);
    expect(lines[0].line).toContain('gap in the record rather than a breach');
  });

  // Pending is never red. Reporting an unmeasured commitment as a failure teaches a business to
  // enter something rather than to go and find out.
  it('does not let an unmeasured commitment fail the charter', () => {
    expect(charterHeld(charterStanding([]))).toBe(true);
  });

  it('reports a breach as a breach', () => {
    const lines = charterStanding([reading('safety', true)]);
    expect(lines.find(l => l.commitment.pillar === 'safety')!.held).toBe('broken');
    expect(charterHeld(lines)).toBe(false);
  });

  it('holds when everything measured is held', () => {
    const lines = charterStanding(PILLARS.map(p => reading(p, false)));
    expect(lines.every(l => l.held === 'held')).toBe(true);
    expect(charterHeld(lines)).toBe(true);
  });

  // A broken commitment is a breach with a name and a date, not four per cent off a pillar.
  it('never reports a breach as a percentage', () => {
    const lines = charterStanding([reading('compliance', true)]);
    expect(lines.find(l => l.commitment.pillar === 'compliance')!.line).not.toMatch(/%/);
  });
});
