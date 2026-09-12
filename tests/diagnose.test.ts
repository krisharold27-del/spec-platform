import { describe, it, expect } from 'vitest';
import { enforce, deterministic, diagnose, NO_OWNER_LINE } from '../src/lib/diagnose';
import type { Bloom } from '../src/lib/register';

/**
 * The diagnosis, and the rules it is not allowed to break.
 *
 * The prompt asks Claude for every rule below. These tests are about the half that does not depend
 * on asking: whatever comes back, `enforce` makes the method true. Each of these would otherwise be
 * wrong in a way that looks perfectly plausible on the screen, which is the worst kind of wrong —
 * nobody reviews a diagnosis that reads well.
 */

describe('rules that hold whatever the model says', () => {
  /**
   * "HARD RULE: People (P) is never 'possible'." Almost every ongoing problem is a people problem
   * underneath, so hedging on People is the diagnosis declining to say the one useful thing it knows.
   */
  it('never lets People be hedged', () => {
    const out = enforce({ bloom: [{ pillar: 'people', certainty: 'possible' }] });
    expect(out.bloom[0].certainty).toBe('definite');
  });

  it('leaves a maybe on any other pillar alone', () => {
    const out = enforce({ bloom: [{ pillar: 'safety', certainty: 'possible' }] });
    expect(out.bloom[0].certainty).toBe('possible');
  });

  it('puts the fix in People, Compliance, Earnings order however it arrives', () => {
    expect(enforce({ chain: ['earnings', 'compliance', 'people'] }).chain)
      .toEqual(['people', 'compliance', 'earnings']);
  });

  // Safety is what the chain is usually about, not a step in fixing one.
  it('drops Safety from the fix rather than reordering around it', () => {
    expect(enforce({ chain: ['safety', 'earnings', 'people'] }).chain).toEqual(['people', 'earnings']);
  });

  /**
   * "If the story gives no clear owner, do NOT invent a solution." A plausible fix attached to a
   * problem nobody owns is worse than no fix: it reads as handled, and three months later it is
   * still happening and nobody was ever accountable for it.
   */
  it('refuses to offer a solution when nobody owns the problem', () => {
    const out = enforce({
      noOwner: true,
      chain: ['people', 'earnings'],
      solutionLine: 'Tighten up the process and communicate better.',
    });
    expect(out.chain).toEqual([]);
    expect(out.solutionLine).toBe(NO_OWNER_LINE);
    expect(out.solutionLine).toContain('first job');
  });

  it('does not repeat a pillar that appears twice', () => {
    const twice: Bloom[] = [
      { pillar: 'people', certainty: 'definite' },
      { pillar: 'people', certainty: 'definite' },
    ];
    expect(enforce({ bloom: twice }).bloom).toHaveLength(1);
  });

  it('survives an empty reading without throwing', () => {
    const out = enforce({});
    expect(out.bloom).toEqual([]);
    expect(out.chain).toEqual([]);
  });
});

describe('the reading that works with no API key', () => {
  /**
   * "A back injury is S, full stop." The tempting mistake is to file a hurt person under People,
   * because a person is involved. People means the org-chart side — who holds the seat, are they
   * capable, does anybody own it — not the fact that somebody was harmed.
   */
  it('files harm to a person under Safety, never People', () => {
    const out = deterministic('a labourer hurt his back lifting on his own again');
    const safety = out.bloom.find(b => b.pillar === 'safety');
    expect(safety?.certainty).toBe('definite');
  });

  it('does not invent Safety where nobody was hurt', () => {
    const out = deterministic('our best estimator resigned and took two others with him');
    expect(out.bloom.find(b => b.pillar === 'safety')).toBeUndefined();
  });

  it('finds People in anything ongoing, and never hedges it', () => {
    const out = deterministic('the yard is a mess every Monday morning');
    expect(out.bloom.find(b => b.pillar === 'people')?.certainty).toBe('definite');
  });

  it('says nobody owns it when the story names nobody', () => {
    expect(deterministic('the yard is a mess every Monday').noOwner).toBe(true);
    expect(deterministic('the yard is a mess and the supervisor keeps promising to fix it').noOwner).toBe(false);
  });

  // Needs a named owner: without one the fix is correctly emptied, which the test above covers.
  it('still obeys the fix order', () => {
    const out = deterministic('margin is down, tickets keep expiring, and the supervisor says someone got hurt');
    expect(out.noOwner).toBe(false);
    expect(out.chain).toEqual(['people', 'compliance', 'earnings']);
  });

  /**
   * The two rules interact, and this is the combination worth pinning: a story can name every
   * pillar in the book and still produce no fix at all, because nobody owns it. That is the design
   * being deliberate rather than the diagnosis failing.
   */
  it('gives no fix for a problem nobody owns, however much else it finds', () => {
    const out = deterministic('margin is down and tickets keep expiring and someone got hurt');
    expect(out.bloom.length).toBeGreaterThan(2);
    expect(out.chain).toEqual([]);
    expect(out.solutionLine).toBe(NO_OWNER_LINE);
  });
});

describe('somebody who typed a real frustration always gets an answer', () => {
  /**
   * Never throws, whatever happens. A person who has just written out something that has been
   * bothering them for months must not be handed "the service is unavailable" — the whole promise
   * of the front door is that typing it gets you somewhere.
   */
  it('falls back rather than failing when there is no key', async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const out = await diagnose('the same two jobs get re-done every month');
      expect(out.bloom.length).toBeGreaterThan(0);
      expect(out.errorLine).not.toBe('');
    } finally {
      if (before !== undefined) process.env.ANTHROPIC_API_KEY = before;
    }
  });
});
