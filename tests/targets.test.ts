import { describe, it, expect } from 'vitest';
import { resolveTarget, targetLabel } from '../src/lib/targets';

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
