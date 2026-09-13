import { describe, it, expect } from 'vitest';
import { ceilingsFor, ceilingsToStore, usesOwnCeilings, LADDER, MOST_A_CEILING_MAY_BE } from '../src/lib/ceilings';
import { DEFAULT_CEILINGS, incentiveFor } from '../src/lib/incentive';

/*
  ── "Ceilings are defaults, not law" ─────────────────────────────────────────────────────────────

  The published ladder halves at each step — 4,000 GM, 2,000 senior manager, 1,000 supervisor, 750
  specialist, 500 technician, 250 apprentice — and that halving is what makes it explainable in a pay
  conversation. designs/the-rules.md calls it a suggestion.

  There was nowhere to store a business's own figures, so every customer was silently held to SPEC's.
  A recommendation enforced as a rule nobody agreed to is worse than no recommendation, and a trade
  business in one state does not pay what a services business in another does.
*/

describe('what a month can earn', () => {
  it('publishes the ladder SPEC recommends', () => {
    expect(DEFAULT_CEILINGS.gm).toBe(4000);
    expect(DEFAULT_CEILINGS.manager).toBe(2000);
    expect(DEFAULT_CEILINGS.supervisor).toBe(1000);
    expect(DEFAULT_CEILINGS.specialist).toBe(750);
    expect(DEFAULT_CEILINGS.technician).toBe(500);
    expect(DEFAULT_CEILINGS.apprentice).toBe(250);
    // The director is outside the scheme: the people who set the standard are not paid against it.
    expect(DEFAULT_CEILINGS.director).toBeNull();
  });

  it('falls back to the ladder when a business has set nothing', () => {
    expect(ceilingsFor(null)).toEqual(DEFAULT_CEILINGS);
    expect(ceilingsFor('')).toEqual(DEFAULT_CEILINGS);
    expect(usesOwnCeilings(null)).toBe(false);
  });

  it('lets a business set its own, and uses them', () => {
    const stored = ceilingsToStore({ gm: 6000, supervisor: 1200 });
    expect(usesOwnCeilings(stored)).toBe(true);
    const theirs = ceilingsFor(stored);
    expect(theirs.gm).toBe(6000);
    expect(theirs.supervisor).toBe(1200);
    // Untouched levels keep the ladder rather than becoming holes.
    expect(theirs.technician).toBe(500);
  });

  /*
    Only the differences are stored, so a business that never touches this moves with the ladder if
    SPEC revises it — rather than being frozen on a copy of today's numbers they never chose.
  */
  it('stores nothing when a business simply accepts the ladder', () => {
    expect(ceilingsToStore({ gm: 4000, manager: 2000 })).toBeNull();
    expect(ceilingsToStore({})).toBeNull();
  });

  it('refuses a figure nobody typed on purpose', () => {
    const stored = ceilingsToStore({ gm: -100, manager: MOST_A_CEILING_MAY_BE + 1, supervisor: 1500 });
    const theirs = ceilingsFor(stored);
    expect(theirs.gm, 'negative is ignored').toBe(4000);
    expect(theirs.manager, 'absurd is ignored').toBe(2000);
    expect(theirs.supervisor, 'the sensible one still applies').toBe(1500);
  });

  /*
    A corrupted setting must not take down the page somebody reads their own pay on.
  */
  it('survives nonsense in the stored value', () => {
    expect(ceilingsFor('not json at all')).toEqual(DEFAULT_CEILINGS);
    expect(ceilingsFor('{"gm":"lots"}').gm).toBe(4000);
  });

  it('actually changes what somebody is paid', () => {
    const own = ceilingsFor(ceilingsToStore({ manager: 3000 }));
    const r = incentiveFor({ roles: [{ level: 'manager', rolePct: 1 }], chainPillars: [], ceilings: own });
    expect(r.ceiling).toBe(3000);
    expect(r.payable).toBe(3000);
  });

  it('offers every level a person can hold', () => {
    for (const { level } of LADDER) {
      expect(DEFAULT_CEILINGS, `${level} must have a ceiling`).toHaveProperty(level);
    }
  });
});
