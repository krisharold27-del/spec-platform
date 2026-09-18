import { describe, it, expect } from 'vitest';
import { selfDiagnosed, deterministic, NO_OWNER_LINE } from '../src/lib/diagnose';

/**
 * What happens when a problem is NOT read for somebody.
 *
 * ── This used to be about Basic ──────────────────────────────────────────────────────────────────
 *
 * There were two tiers, and a Basic customer was not entitled to have Claude read their problem;
 * they named their own pillars instead. Kris removed the tiers on 18 September — there is one SPEC
 * and every problem is read.
 *
 * `selfDiagnosed` is deliberately still here, and so are its tests. It is the fallback when the
 * read FAILS: a register that refused the entry because a model was briefly unavailable would lose
 * the thing somebody came to write down, which is the one part of this that is theirs. Same
 * guarantee as before, reached for a different reason — the entry is real either way. It ranks, it
 * assigns, it signs off.
 */

describe('an entry somebody diagnosed themselves', () => {
  /**
   * The important half, and the reason this survived the tiers: the entry that comes out when a
   * person picked the pillars is a real entry. What varies is who did the thinking, never whether
   * the feature exists.
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
