import { describe, it, expect } from 'vitest';
import { cleanHeard, dueToListen } from '../src/lib/listening';

describe('siteVIP listening', () => {
  it('keeps a theme only with a real public source, a heard line and a fix', () => {
    const h = cleanHeard({ themes: [
      { theme: 'Too many screens', heard: 'Takes 15 taps to raise a job.', sources: ['https://forum.example.com/t/1', 'javascript:alert(1)', 'not a url'], fix: 'Raise a job from one line.' },
      { theme: 'No source', heard: 'Something', sources: [], fix: 'Something' },
      { theme: '', heard: 'x', sources: ['https://a.example'], fix: 'y' },
    ] });
    expect(h).toEqual([{ theme: 'Too many screens', heard: 'Takes 15 taps to raise a job.', sources: ['https://forum.example.com/t/1'], fix: 'Raise a job from one line.' }]);
    expect(cleanHeard('nonsense')).toEqual([]);
  });

  it('listens once a night, not every five minutes', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    expect(dueToListen(null, now)).toBe(true);
    expect(dueToListen('2026-09-26T02:00:00Z', now)).toBe(false);
    expect(dueToListen('2026-09-25T12:00:00Z', now)).toBe(true);
  });
});
