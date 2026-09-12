import { describe, it, expect } from 'vitest';
import { rhythm, rhythmLine, type RhythmInputs } from '../src/lib/rhythm';

/**
 * My week — the rhythm, not a diary.
 *
 * The rule this protects is the one the design states as a prohibition: **it must never become a
 * calendar**. SPEC does not own anybody's diary, and a section that shows everything says nothing.
 * So most of these tests are about what does NOT appear.
 */

const input = (over: Partial<RhythmInputs> = {}): RhythmInputs => ({
  meetingLogged: false,
  leadsPeople: true,
  openPeriod: 'August',
  daysToClose: 10,
  unmarked: 0,
  canManage: true,
  ...over,
});

describe('what is in the week', () => {
  it('says whether the weekly meeting is being held', () => {
    expect(rhythm(input({ meetingLogged: true }))[0].state).toBe('green');
    expect(rhythm(input({ meetingLogged: false }))[0].state).toBe('amber');
  });

  /**
   * Somebody with nobody under them does not run a weekly meeting, so they are not shown one.
   * Showing it greyed out would be a calendar entry for a thing that is not theirs.
   */
  it('leaves the weekly meeting off somebody with no people', () => {
    const beats = rhythm(input({ leadsPeople: false }));
    expect(beats.find(b => b.id === 'weekly')).toBeUndefined();
  });

  it('warns as the month close gets close, and not before', () => {
    expect(rhythm(input({ daysToClose: 10 })).find(b => b.id === 'month')?.state).toBe('green');
    expect(rhythm(input({ daysToClose: 2 })).find(b => b.id === 'month')?.state).toBe('amber');
    expect(rhythm(input({ daysToClose: 0 })).find(b => b.id === 'month')?.standing).toBe('Overdue');
  });

  // Unmarked numbers never count against a person — they just leave the month unfinished, and the
  // wording has to carry that or the section becomes an accusation.
  it('mentions unmarked numbers without treating them as a failure', () => {
    const beat = rhythm(input({ unmarked: 3 })).find(b => b.id === 'marking');
    expect(beat?.detail).toContain('never counts against you');
    expect(beat?.state).not.toBe('red');
  });

  it('does not ask a read-only person to mark anything', () => {
    expect(rhythm(input({ unmarked: 3, canManage: false })).find(b => b.id === 'marking')).toBeUndefined();
  });

  /**
   * Five is the most this should ever be. The moment it becomes a list somebody scrolls, it has
   * stopped being the rhythm and started being the diary the design forbids.
   */
  it('stays short even when everything is happening at once', () => {
    const busiest = rhythm(input({ meetingLogged: false, unmarked: 9, daysToClose: 1 }));
    expect(busiest.length).toBeLessThanOrEqual(5);
  });

  it('gives every beat somewhere to go', () => {
    for (const beat of rhythm(input({ unmarked: 2 }))) {
      expect(beat.href, `${beat.id} has nowhere to travel`).toMatch(/^\//);
    }
  });
});

describe('the line under the section', () => {
  it('says the rhythm is held when it is', () => {
    expect(rhythmLine(rhythm(input({ meetingLogged: true, daysToClose: 10 }))))
      .toContain('being held');
  });

  it('says how much needs them when something does', () => {
    expect(rhythmLine(rhythm(input({ meetingLogged: false })))).toMatch(/1 thing/);
  });

  // A person with no people and no month is not behind — they have not started, which is different.
  it('is honest about an empty week rather than congratulating them', () => {
    const line = rhythmLine(rhythm(input({ leadsPeople: false, openPeriod: null, unmarked: 0 })));
    expect(line).toContain('Nothing is due');
  });
});
