import { describe, it, expect } from 'vitest';
import {
  pctLabel, seatProgress, money, health, SCALE_CHECKS, CHANNELS, CHANNEL_TOTAL,
  PHASES, SOFTWARE_TARGET,
} from '../src/lib/cockpit';
import { summarise } from '../src/lib/uptime';

/** Nothing measured yet — the state a fresh deployment is in. */
const NOTHING_MEASURED = summarise([]);

/** A day of healthy checks, five minutes apart. */
const MEASURED = summarise(
  Array.from({ length: 12 }, (_, i) => ({
    at: new Date(Date.now() - (11 - i) * 5 * 60_000).toISOString(),
    ok: true,
    ms: 120,
  })),
);

describe('running SPEC Business Solutions', () => {
  /*
    The rule the whole page rests on. A system-health panel showing plausible invented numbers is
    worse than no panel, and this project has already paid for that lesson twice.
  */
  it('never invents a figure it does not measure', () => {
    const rows = health({ tenants: 1, seats: 40, consultingClients: 1 }, NOTHING_MEASURED);
    for (const r of rows) {
      if (r.kind === 'unmeasured') expect(r.value, r.label).toBeNull();
      else expect(r.value, r.label).not.toBeNull();
    }
  });

  /*
    A fresh deployment with no schedule attached yet must say so, not show a perfect score off no
    samples. This is the state every new environment starts in.
  */
  it('says nothing has been measured rather than showing a flattering blank', () => {
    const unmeasured = health({ tenants: 1, seats: 40, consultingClients: 1 }, NOTHING_MEASURED)
      .filter(r => r.kind === 'unmeasured');
    expect(unmeasured.length).toBe(2);
    expect(unmeasured.map(r => r.note).join(' ')).toMatch(/Nothing measured yet|nothing to time/);
    for (const r of unmeasured) expect(r.value).toBeNull();
  });

  it('reports uptime and response time once checks have actually run', () => {
    const rows = health({ tenants: 1, seats: 40, consultingClients: 1 }, MEASURED);
    const answered = rows.find(r => r.label === 'Answered when asked')!;
    const speed = rows.find(r => r.label === 'Response time')!;
    expect(answered.kind).toBe('measured');
    expect(answered.value).toBe('100.00%');
    expect(answered.note).toMatch(/12 of 12 checks answered/);
    expect(speed.value).toBe('120ms');
  });

  it('counts what it genuinely can', () => {
    const rows = health({ tenants: 3, seats: 112, consultingClients: 1 }, MEASURED);
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
    /*
      The backup is still the honest gap, and it is the one that cannot be closed by writing code:
      a backup nobody has restored is a belief, and the only way to stop it being one is to restore
      it once, on purpose.

      Load-testing used to be pinned here too. It was closed by actually running one at twenty
      thousand seats — which found three tables where reading one business meant reading all of
      them — so this now pins the RULE rather than that item: something on this list must still be
      red, and the item may only turn green by being done.
    */
    expect(undone.map(c => c.label).join(' ')).toMatch(/backup/i);
  });

  it('never calls something done without saying how it was proven', () => {
    for (const c of SCALE_CHECKS.filter(c => c.done)) {
      expect(c.evidence, `${c.label} is marked done`).not.toMatch(/never run|not yet|todo|belief/i);
      expect(c.evidence.length, `${c.label} needs real evidence`).toBeGreaterThan(40);
    }
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
