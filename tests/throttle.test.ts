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

  it('never grows without bound', () => {
    const t = createThrottle(60_000, 3);
    for (const k of ['a', 'b', 'c', 'd']) expect(t.allow(k, 0)).toBe(true);
    // The oldest was dropped to make room, so it is allowed again rather than memory growing.
    expect(t.allow('a', 1)).toBe(true);
  });
});
