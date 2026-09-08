import { describe, it, expect } from 'vitest';
import { governanceChecks, governanceStatus, cadenceOf, CADENCE } from '../src/lib/governance';

const at = new Date('2026-09-08T00:00:00Z');
const dir = [{ name: 'J. Smith', title: 'Chair', active: true }];

describe('board governance', () => {
  it('recommends monthly and treats quarterly as the outer limit', () => {
    expect(cadenceOf(undefined)).toBe('monthly');
    expect(cadenceOf('quarterly')).toBe('quarterly');
    expect(CADENCE.monthly.days).toBeLessThan(CADENCE.quarterly.days);
  });

  it('never reports an unrecorded board as a clean result', () => {
    const c = governanceChecks('monthly', [], [], at);
    const meeting = c.find(x => x.id === 'board_meeting_held')!;
    expect(meeting.status).toBe('not_reporting');   // not 'pass'
    expect(meeting.fix).toBeTruthy();               // every miss carries a fix
    expect(governanceStatus(c)).not.toBe('pass');
  });

  it('flags a board that has drifted past its cadence', () => {
    const late = governanceChecks('monthly', [{ date: '2026-06-01' }], dir, at);
    expect(late.find(x => x.id === 'board_meeting_held')!.status).toBe('attention');

    // The same gap is inside a quarterly cadence, so it is not a finding.
    const ok = governanceChecks('quarterly', [{ date: '2026-07-20' }], dir, at);
    expect(ok.find(x => x.id === 'board_meeting_held')!.status).toBe('pass');
  });

  it('is clean only when the board sits, directors are known, and minutes exist', () => {
    const c = governanceChecks('monthly', [{ date: '2026-09-01', minutes: 'Held' } as never], dir, at);
    expect(governanceStatus(c)).toBe('pass');
  });
});
