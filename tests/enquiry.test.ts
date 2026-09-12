import { describe, it, expect } from 'vitest';
import { hasDiagnosis, tierOf } from '../src/lib/plan';
import { selfDiagnosed, deterministic, NO_OWNER_LINE } from '../src/lib/diagnose';

/**
 * Who gets a problem read for them, and what happens when they do not.
 *
 * Two separate decisions that look like one. A Basic customer is not entitled to have Claude read
 * their problem, and a stranger on the front door gets exactly one. Neither of them is ever refused
 * the register itself — that is the method, and the method is what a business bought.
 */

describe('what Basic actually gets', () => {
  it('has no diagnosis', () => {
    expect(hasDiagnosis(tierOf('basic'))).toBe(false);
    expect(hasDiagnosis(tierOf(null))).toBe(false);
    expect(hasDiagnosis(tierOf('advanced'))).toBe(true);
  });

  /**
   * The important half. Basic names its own pillars, and the entry that comes out is a real entry —
   * it ranks, it assigns, it signs off. The difference between the tiers is who does the thinking,
   * never whether the feature exists.
   */
  it('still produces a real entry when the person names the pillars', () => {
    const out = selfDiagnosed(['safety', 'people'], 'Dane Whitmore');
    expect(out.bloom.map(b => b.pillar)).toEqual(['safety', 'people']);
    expect(out.noOwner).toBe(false);
  });

  // The method holds even when a person, not a model, picked the pillars.
  it('puts a hand-picked fix into the one order too', () => {
    const out = selfDiagnosed(['earnings', 'compliance', 'people'], 'Dane Whitmore');
    expect(out.chain).toEqual(['people', 'compliance', 'earnings']);
  });

  it('says nobody owns it when they left the owner blank', () => {
    const out = selfDiagnosed(['people'], null);
    expect(out.noOwner).toBe(true);
    expect(out.chain).toEqual([]);
    expect(out.solutionLine).toBe(NO_OWNER_LINE);
  });

  /**
   * Ticking nothing is allowed. A person who cannot say which pillar it touches has still told the
   * business something real, and refusing the entry would teach them not to bother next time.
   */
  it('accepts a problem with no pillars ticked', () => {
    const out = selfDiagnosed([], 'Dane Whitmore');
    expect(out.bloom).toEqual([]);
    expect(out.chain).toEqual([]);
  });
});

describe('a stranger whose free read is spent', () => {
  /**
   * Never refused, only read more simply. Turning somebody away at the exact moment they are
   * engaged — having just typed out something that has bothered them for months — would be the
   * wrong trade, whatever it saves.
   */
  it('still gets a real answer', () => {
    const out = deterministic('the same two jobs get re-done every month and it costs us margin');
    expect(out.bloom.length).toBeGreaterThan(0);
    expect(out.errorLine).not.toBe('');
  });
});
