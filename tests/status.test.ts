import { describe, it, expect } from 'vitest';
import { resolveWatchAtLock, STATUSES, STATUS_ORDER } from '../src/lib/status';

describe('the seven statuses (BUILD_SPEC §3.1)', () => {
  it('the vocabulary is fixed at seven', () => {
    expect(STATUS_ORDER).toHaveLength(7);
    expect(Object.keys(STATUSES).sort()).toEqual([...STATUS_ORDER].sort());
  });

  it('nothing that scores NA is ever shown as bad — pending is never red', () => {
    for (const s of STATUS_ORDER) if (STATUSES[s].answer === 'NA') expect(STATUSES[s].tone).toBe('neutral');
  });
});

describe('the Watch guard', () => {
  it('Watch two closed months running resolves to Not met on the second lock', () => {
    expect(resolveWatchAtLock('watch', 'watch')).toBe('not_met');
  });

  it('a first month of Watch stays Watch', () => {
    expect(resolveWatchAtLock(null, 'watch')).toBe('watch');
    expect(resolveWatchAtLock('met', 'watch')).toBe('watch');
    expect(resolveWatchAtLock('not_met', 'watch')).toBe('watch');
  });

  it('anything other than a second Watch is left exactly as marked', () => {
    expect(resolveWatchAtLock('watch', 'met')).toBe('met');
    expect(resolveWatchAtLock('watch', 'pending')).toBe('pending');
    expect(resolveWatchAtLock('watch', null)).toBeNull();
  });
});
