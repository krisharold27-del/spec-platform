import { describe, it, expect } from 'vitest';
import { adminActivity } from '../src/lib/admin-activity';

describe('recent admin activity', () => {
  it('puts the most recent thing first, whatever kind of thing it is', () => {
    const rows = adminActivity({
      seats: [{ email: 'a@x.test', name: 'Ann', invitedAt: '2026-01-01T09:00:00Z' }],
      periods: [{ period: '2026-02', signedBy: 'boss@x.test', signedAt: '2026-03-01T09:00:00Z' }],
      connections: [{ name: 'Xero', category: 'financials', createdAt: '2026-02-01T09:00:00Z', status: 'live' }],
    });
    expect(rows.map(r => r.when)).toEqual([
      '2026-03-01T09:00:00Z',
      '2026-02-01T09:00:00Z',
      '2026-01-01T09:00:00Z',
    ]);
  });

  it('never shows a row it cannot date', () => {
    const rows = adminActivity({
      seats: [{ email: 'a@x.test', invitedAt: null, acceptedAt: undefined }],
      directors: [{ name: 'Dane', appointedAt: null }],
    });
    expect(rows).toEqual([]);
  });

  it('does not claim a seat was taken when it was only invited', () => {
    const rows = adminActivity({
      seats: [{ email: 'a@x.test', name: 'Ann', invitedAt: '2026-01-01T09:00:00Z', acceptedAt: null }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].what).toContain('was invited');
    expect(rows.some(r => /took their seat/.test(r.what))).toBe(false);
  });

  it('shows both halves of an approval, and only the decided half once decided', () => {
    const waiting = adminActivity({
      approvals: [{ title: 'A new role', requestedBy: 'a@x.test', requestedAt: '2026-01-01T09:00:00Z', state: 'waiting' }],
    });
    expect(waiting).toHaveLength(1);

    const done = adminActivity({
      approvals: [{
        title: 'A new role', requestedBy: 'a@x.test', requestedAt: '2026-01-01T09:00:00Z',
        decidedBy: 'boss@x.test', decidedAt: '2026-01-02T09:00:00Z', state: 'approved',
      }],
    });
    expect(done.map(r => r.what)).toEqual(['Approved: A new role', 'Asked for: A new role']);
  });

  it('records a board pack sent back, with who sent it', () => {
    const rows = adminActivity({
      packs: [{ period: '2026-02', sentBackBy: 'chair@x.test', sentBackAt: '2026-03-02T09:00:00Z' }],
    });
    expect(rows[0].what).toBe('The 2026-02 board pack was sent back');
    expect(rows[0].who).toBe('chair@x.test');
  });

  it('keeps to the limit it is given', () => {
    const seats = Array.from({ length: 30 }, (_, i) => ({
      email: `p${i}@x.test`,
      invitedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`,
    }));
    expect(adminActivity({ seats }, 5)).toHaveLength(5);
  });
});
