import { describe, it, expect } from 'vitest';
import { createThrottle } from '../src/lib/throttle';

describe('one sign-in email per address per minute', () => {
  it('lets the first through and holds a repeat inside the window', () => {
    const t = createThrottle(60_000);
    expect(t.allow('a@x.com', 0)).toBe(true);
    expect(t.allow('a@x.com', 59_999)).toBe(false);
    expect(t.allow('a@x.com', 60_000)).toBe(true);
  });

  it('counts each address separately', () => {
    const t = createThrottle(60_000);
    expect(t.allow('a@x.com', 0)).toBe(true);
    expect(t.allow('b@x.com', 1)).toBe(true);
  });

  it('allows a set number per window when asked — three sign-ups an hour from one address', () => {
    const t = createThrottle(3_600_000, 10_000, 3);
    expect([0, 1, 2].map(n => t.allow('203.0.113.9', n))).toEqual([true, true, true]);
    expect(t.allow('203.0.113.9', 3)).toBe(false);
    expect(t.allow('203.0.113.9', 3_600_000)).toBe(true); // the first has aged out
  });

  it('never grows without bound', () => {
    const t = createThrottle(60_000, 3);
    for (const k of ['a', 'b', 'c', 'd']) expect(t.allow(k, 0)).toBe(true);
    // The oldest was dropped to make room, so it is allowed again rather than memory growing.
    expect(t.allow('a', 1)).toBe(true);
  });
});
