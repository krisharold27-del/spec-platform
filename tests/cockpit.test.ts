import { describe, it, expect } from 'vitest';
import {
  pctLabel, seatProgress, money, health, SCALE_CHECKS, CHANNELS, CHANNEL_TOTAL,
  PHASES, SOFTWARE_TARGET,
} from '../src/lib/cockpit';

describe('running SPEC Business Solutions', () => {
  /*
    The rule the whole page rests on. A system-health panel showing plausible invented numbers is
    worse than no panel, and this project has already paid for that lesson twice.
  */
  it('never invents a figure it does not measure', () => {
    const rows = health({ tenants: 1, seats: 40, consultingClients: 1 });
    for (const r of rows) {
      if (r.kind === 'unmeasured') expect(r.value, r.label).toBeNull();
      else expect(r.value, r.label).not.toBeNull();
    }
  });

  it('says where the real number lives when it has none of its own', () => {
    const unmeasured = health({ tenants: 1, seats: 40, consultingClients: 1 })
      .filter(r => r.kind === 'unmeasured');
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const r of unmeasured) expect(r.note).toMatch(/Vercel/);
  });

  it('counts what it genuinely can', () => {
    const rows = health({ tenants: 3, seats: 112, consultingClients: 1 });
    expect(rows.find(r => r.label === 'Businesses on SPEC')).toMatchObject({ value: '3', kind: 'measured' });
    expect(rows.find(r => r.label === 'Seats that bill')).toMatchObject({ value: '112', kind: 'measured' });
  });

  /*
    40 of 20,000 is 0.2%. Rounding that to something that looks like progress is how a founder ends
    up believing a number that is not true — which is the failure SPEC sells against.
  */
  it('does not flatter a small number into looking bigger', () => {
    expect(pctLabel(40, 20_000)).toBe('0.2%');
    expect(pctLabel(0, 20_000)).toBe('0%');
    expect(pctLabel(2000, 20_000)).toBe('10%');
    expect(seatProgress(40)).toBeCloseTo(0.2, 5);
  });

  it('never reports more than complete', () => {
    expect(seatProgress(30_000)).toBe(100);
    expect(pctLabel(30_000, 20_000)).toBe('150%'); // the label states the truth; the bar is what clamps
  });

  it('handles a target of nothing without dividing by zero', () => {
    expect(pctLabel(5, 0)).toBe('—');
  });

  it('writes money the same way the rest of SPEC does', () => {
    expect(money(1_234_567)).toBe('$1,234,567');
    expect(money(0)).toBe('$0');
  });

  /*
    A readiness list where everything is green is a readiness list nobody wrote honestly.
  */
  it('admits what has not been done', () => {
    const undone = SCALE_CHECKS.filter(c => !c.done);
    expect(undone.length).toBeGreaterThan(0);
    expect(undone.map(c => c.label).join(' ')).toMatch(/Load-tested/);
    expect(undone.map(c => c.label).join(' ')).toMatch(/backup/i);
  });

  it('backs every claim with something checkable', () => {
    for (const c of SCALE_CHECKS) {
      expect(c.evidence.length, c.label).toBeGreaterThan(20);
    }
  });

  it('keeps the channel mix as a shape, not a forecast that adds to the target', () => {
    expect(CHANNEL_TOTAL).toBeLessThan(SOFTWARE_TARGET.seats);
    expect(CHANNELS.length).toBe(5);
    // Three of the five carry the volume and are referral-based — that is the argument of the chart.
    const referral = CHANNELS.filter(c => /referral|word-of-mouth|Divisional/.test(c.label));
    expect(referral).toHaveLength(3);
    expect(referral.reduce((t, c) => t + c.seats, 0)).toBeGreaterThan(CHANNEL_TOTAL / 2);
  });

  it('has a road with three phases, in order', () => {
    expect(PHASES.map(p => p.tone)).toEqual(['early', 'building', 'compounding']);
  });
});
