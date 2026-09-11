import { describe, it, expect } from 'vitest';
import {
  resolveTarget, targetLabel, readNumber, inferDirection, rollingActual, soundness,
  MIN_MONTHS_TO_JUDGE, MAX_STRETCH,
} from '../src/lib/targets';

describe('resolveTarget', () => {
  it('keeps a real target as both agreed and proposed', () => {
    expect(resolveTarget('0 (non-negotiable)')).toEqual({ target: '0 (non-negotiable)', proposed: '0 (non-negotiable)' });
  });

  // A variable name rendered in the UI looks broken and says the opposite of what it means.
  it('never lets a placeholder through as a target', () => {
    expect(resolveTarget('{net_profit_target}')).toEqual({ target: null, proposed: null });
    expect(resolveTarget('{gp_target}').target).toBeNull();
  });

  // SPEC proposes; the leader agrees. A default is an opening, not a decision.
  it('turns a default into the proposed target and leaves the agreed one empty', () => {
    expect(resolveTarget('{utilisation_target, default 85%}')).toEqual({ target: null, proposed: '85%' });
    expect(resolveTarget('{nps_target, default 80}')).toEqual({ target: null, proposed: '80' });
  });

  it('proposes nothing for a placeholder with no default, rather than inventing a number', () => {
    expect(resolveTarget('{gp_target}').proposed).toBeNull();
  });

  it('handles a missing target', () => {
    expect(resolveTarget(undefined)).toEqual({ target: null, proposed: null });
    expect(resolveTarget(null)).toEqual({ target: null, proposed: null });
    expect(resolveTarget('  ')).toEqual({ target: null, proposed: null });
  });

  it('leaves a brace that is not a whole placeholder alone', () => {
    expect(resolveTarget('under {2} hours').target).toBe('under {2} hours');
  });
});

describe('targetLabel', () => {
  it('shows the agreed target when there is one', () => {
    expect(targetLabel('32%', '30%')).toBe('32%');
  });

  // Never a blank, and never a variable name.
  it('says a proposal is only a proposal', () => {
    expect(targetLabel(null, '85%')).toBe('85% proposed, not yet agreed');
  });

  it('says plainly when nothing has been set', () => {
    expect(targetLabel(null, null)).toBe('Not set yet');
  });
});

describe('readNumber', () => {
  it('prefers the percentage, because that is what the measure is about', () => {
    expect(readNumber('$827,172 (94.0%)')).toBe(94);
    expect(readNumber('92% billable')).toBe(92);
    expect(readNumber('40.24%')).toBe(40.24);
  });

  it('falls back to the first number, commas and dollars ignored', () => {
    expect(readNumber('16 invoices over 90 days')).toBe(16);
    expect(readNumber('$1,204,880')).toBe(1204880);
    expect(readNumber('0 incidents')).toBe(0);
  });

  // "Not measured" is not a result of nought. Reading it as one would quietly score a gap as a pass
  // on every "zero incidents" measure in the business.
  it('returns nothing rather than nought when there is no number', () => {
    expect(readNumber('Not measured')).toBeNull();
    expect(readNumber('')).toBeNull();
    expect(readNumber(null)).toBeNull();
  });
});

describe('inferDirection', () => {
  it('reads a ceiling as lower-is-better', () => {
    expect(inferDirection('Invoicing variance within threshold', '≤ 1%')).toBe('lower');
    expect(inferDirection('Zero incidents (LTI / MTI)', '0')).toBe('lower');
    expect(inferDirection('Debtor days under 45', null)).toBe('lower');
  });

  it('treats an ordinary measure as higher-is-better', () => {
    expect(inferDirection('Gross profit at or above target', '40%')).toBe('higher');
    expect(inferDirection('Monthly revenue at or above target', null)).toBe('higher');
  });
});

describe('rollingActual', () => {
  // One shutdown month should not reset what everybody is held to for a year.
  it('takes the middle month rather than the average', () => {
    expect(rollingActual([38, 39, 40, 41, 92])).toBe(40);
  });

  it('averages the two middle months for an even run', () => {
    expect(rollingActual([38, 40, 42, 44])).toBe(41);
  });

  it('has nothing to say about no months', () => {
    expect(rollingActual([])).toBeNull();
  });
});

describe('soundness', () => {
  /**
   * The worked example from the brief: an electrical contractor running at 40% gross profit. 35 is
   * too low and 50 is too high. The figures live HERE, in a test, and never in the seed templates —
   * a trade's real margin is a fact about one business, and shipping it would make SPEC fit exactly
   * one customer. What ships is the rule that finds it.
   */
  const twelveMonthsAt = (value: number) => Array.from({ length: 12 }, (_, i) => value + (i % 3) - 1);
  const gp = (target: number) => soundness({ target, actuals: twelveMonthsAt(40), direction: 'higher' });

  it('calls a target below the actual too easy', () => {
    const s = gp(35);
    expect(s.verdict).toBe('too_easy');
    expect(s.line).toContain('met by carrying on exactly as before');
  });

  it('calls a target far above the actual out of reach', () => {
    const s = gp(50);
    expect(s.verdict).toBe('out_of_reach');
    expect(s.line).toContain('always red stops being read');
  });

  it('calls a stretch inside the band sound', () => {
    expect(gp(44).verdict).toBe('sound');
    expect(gp(41).verdict).toBe('sound');
  });

  it('publishes the band it judged against', () => {
    expect(gp(44).band).toEqual({ from: 40, to: 48 });
    expect(gp(44).actual).toBe(40);
  });

  it('reads the same rule the other way up for a lower-is-better measure', () => {
    const late = { actuals: [10, 10, 10, 10, 10, 10, 10, 10], direction: 'lower' as const };
    expect(soundness({ ...late, target: 12 }).verdict).toBe('too_easy');
    expect(soundness({ ...late, target: 9 }).verdict).toBe('sound');
    expect(soundness({ ...late, target: 2 }).verdict).toBe('out_of_reach');
  });

  // A confident answer from evidence that does not support one is worse than declining to answer.
  it('refuses to judge on too little history, and does not call that a fault', () => {
    const s = soundness({ target: 44, actuals: [40, 41, 39], direction: 'higher' });
    expect(s.verdict).toBe('unproven');
    expect(s.months).toBe(3);
    expect(s.line).toContain('not a fault in the target');
  });

  it('needs six closed months before it will say anything', () => {
    const five = Array(MIN_MONTHS_TO_JUDGE - 1).fill(40);
    const six = Array(MIN_MONTHS_TO_JUDGE).fill(40);
    expect(soundness({ target: 44, actuals: five, direction: 'higher' }).verdict).toBe('unproven');
    expect(soundness({ target: 44, actuals: six, direction: 'higher' }).verdict).toBe('sound');
  });

  // Nought harm is not a stretch above what the business managed last year.
  it('never judges a charter commitment against what the business has been managing', () => {
    const s = soundness({ target: 0, actuals: Array(12).fill(3), direction: 'lower', basis: 'absolute' });
    expect(s.verdict).toBe('absolute');
    expect(s.line).toContain('not set from what the business has been managing');
  });

  it('points at the record when no target is agreed but the history is there', () => {
    const s = soundness({ target: null, actuals: twelveMonthsAt(40), direction: 'higher' });
    expect(s.verdict).toBe('unproven');
    expect(s.line).toContain('where the conversation should start');
  });

  it('holds the stretch ceiling at the published constant', () => {
    const actuals = Array(12).fill(100);
    const ceiling = 100 * (1 + MAX_STRETCH);
    expect(soundness({ target: ceiling, actuals, direction: 'higher' }).verdict).toBe('sound');
    expect(soundness({ target: ceiling + 0.01, actuals, direction: 'higher' }).verdict).toBe('out_of_reach');
  });
});

describe('a target of nought', () => {
  /**
   * The stretch band is relative and nothing is within a fifth of nought, so a purely relative test
   * declares every zero target out of reach — including "zero incidents". Telling a business its
   * zero-harm target is unrealistic would be the worst sentence this product could produce.
   */
  it('is never called out of reach, however far the record sits from it', () => {
    const s = soundness({ target: 0, actuals: [4, 4, 5, 3, 4, 6], direction: 'lower' });
    expect(s.verdict).toBe('absolute');
    expect(s.line).toContain('commitment rather than a stretch');
  });

  it('is exempt even where the business has a clean record against it', () => {
    expect(soundness({ target: 0, actuals: [0, 0, 0, 0, 0, 0], direction: 'lower' }).verdict).toBe('absolute');
  });

  // The exemption is for nought itself, not for every small number: a ceiling a business is nowhere
  // near is a real finding and must still be reported as one.
  it('does not exempt a small target that is merely low', () => {
    expect(soundness({ target: 1, actuals: [28, 28, 29, 27, 28, 30], direction: 'lower' }).verdict).toBe('out_of_reach');
  });
});
