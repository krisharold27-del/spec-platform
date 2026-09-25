import { describe, it, expect } from 'vitest';
import {
  MONEY_SEATS, seatKind, maySee, scopedToTheirOwn, whyNotMoney, fromSeat,
  mayTurnOffTwoStep, TWO_STEP_FOR_EVERYONE, twoStepReading,
  BENCHMARKS_DEFAULT_ON, DATA_IS_YOURS, STORED_IN_AUSTRALIA, EXPORT_INCLUDES,
  mayExportEverything, WHY_OWNER_ONLY,
  type MoneySeat, type MoneyKind,
} from '../src/lib/money-sight';

const ALL: MoneySeat[] = ['owner', 'gm', 'commercial', 'manager', 'supervisor', 'tech'];

describe('the six seats', () => {
  it('is six, each saying what it sees', () => {
    expect(MONEY_SEATS).toHaveLength(6);
    for (const s of MONEY_SEATS) expect(s.sees.length, s.key).toBeGreaterThan(10);
  });
});

describe('the owner’s own pay', () => {
  /*
    The one rule that looks arbitrary and is not. It is the number with no oversight above it, and
    a GM who can read it knows their own ceiling and what the owner took out last quarter.
  */
  it('is seen only by the owner and the seat that runs the pay', () => {
    expect(maySee('owner', 'owner_pay')).toBe(true);
    expect(maySee('commercial', 'owner_pay')).toBe(true);
    expect(maySee('gm', 'owner_pay')).toBe(false);
    expect(maySee('manager', 'owner_pay')).toBe(false);
    expect(maySee('tech', 'owner_pay')).toBe(false);
  });

  it('says why rather than refusing flatly', () => {
    expect(whyNotMoney('gm', 'owner_pay')).toContain('nobody above it');
  });
});

describe('what each seat sees', () => {
  it('gives a tech their own pay and nothing else', () => {
    expect(maySee('tech', 'own_pay')).toBe(true);
    for (const kind of ['team_pay', 'job_cost', 'job_margin', 'whole_position', 'customers'] as MoneyKind[]) {
      expect(maySee('tech', kind), kind).toBe(false);
    }
  });

  it('gives everybody their own pay', () => {
    for (const seat of ALL) expect(maySee(seat, 'own_pay'), seat).toBe(true);
  });

  it('keeps the customer list and the whole position with leadership', () => {
    for (const seat of ['manager', 'supervisor', 'tech'] as MoneySeat[]) {
      expect(maySee(seat, 'customers'), seat).toBe(false);
      expect(maySee(seat, 'whole_position'), seat).toBe(false);
    }
  });

  it('gives a supervisor costs on their own jobs, scoped', () => {
    expect(maySee('supervisor', 'job_cost')).toBe(true);
    /* The difference from a manager is scope, not category — and a screen that forgets that has
       handed a supervisor the whole business's costs. */
    expect(scopedToTheirOwn('supervisor')).toBe(true);
    expect(scopedToTheirOwn('manager')).toBe(true);
    expect(scopedToTheirOwn('owner')).toBe(false);
  });

  it('never explains away somebody’s own pay', () => {
    expect(whyNotMoney('tech', 'own_pay')).toBeNull();
  });

  it('maps the coarse seats without widening anything', () => {
    expect(fromSeat('leadership')).toBe('owner');
    expect(fromSeat('team')).toBe('tech');
    expect(fromSeat('subcontractor')).toBe('tech');
  });
});

describe('two-step sign-in', () => {
  it('cannot be turned off by anybody who can reach pay or money', () => {
    for (const seat of ['owner', 'gm', 'commercial', 'manager'] as MoneySeat[]) {
      expect(mayTurnOffTwoStep(seat), seat).toBe(false);
    }
  });

  it('tells such a seat it is required rather than suggesting it', () => {
    const r = twoStepReading('owner', { on: false, method: null });
    expect(r.ok).toBe(false);
    expect(r.says).toContain('cannot go without it');
  });

  it('is an encouragement for everybody else', () => {
    expect(twoStepReading('tech', { on: false, method: null }).says).toContain('takes a minute');
  });

  it('says how it is done when it is on', () => {
    expect(twoStepReading('tech', { on: true, method: 'sms' }).says).toContain('text message');
  });

  it('says why the busiest accounts are the ones locked', () => {
    expect(TWO_STEP_FOR_EVERYONE).toContain('most likely to switch it off');
  });
});

describe('your data is yours', () => {
  it('has benchmarks off until somebody says otherwise', () => {
    expect(BENCHMARKS_DEFAULT_ON).toBe(false);
    expect(DATA_IS_YOURS).toContain('off until you do');
  });

  it('says where it is stored, including the awkward part', () => {
    expect(STORED_IN_AUSTRALIA).toContain('overseas');
  });

  it('names what an export contains rather than promising "everything"', () => {
    expect(EXPORT_INCLUDES.length).toBeGreaterThanOrEqual(8);
    expect(EXPORT_INCLUDES.join(' ')).toContain('Pay runs');
  });

  it('lets only the owner walk out with it', () => {
    /* Not the Head of Commercial, who sees all money. Looking at it and leaving with it are
       different questions. */
    expect(mayExportEverything('owner')).toBe(true);
    expect(mayExportEverything('commercial')).toBe(false);
    expect(mayExportEverything('gm')).toBe(false);
    expect(WHY_OWNER_ONLY).toContain('walk out with it');
  });
});
