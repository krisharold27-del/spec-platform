import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readiness, READY_AFTER_MONTHS, switchOffer, sourceTitle, sourceNote,
  cashShield, taxShield, marginShield, owedShield, shields, broken,
  REVIEWS, reviewLine, signedCount, forBoardPack, reviewsLine,
  payrollPostsTo, NO_SHIELD_SETUP, WHAT_MOVES,
  type ShieldSetup, type PreparedReview,
} from '../src/lib/angus';
import { NO_FIGURES, type Figures } from '../src/lib/financials';

const src = readFileSync(join(process.cwd(), 'src/lib/angus.ts'), 'utf8');

describe('Angus Shield is not a connector', () => {
  /*
    The architecture rule from Design 19, enforced rather than described. The cheap way to build
    Angus Shield is to point the Xero connector at an internal API; this test is what stops that
    happening quietly in six months when somebody is in a hurry.
  */
  it('never imports the connector modules', () => {
    const imports = [...src.matchAll(/from '\.\/([\w-]+)'/g)].map(m => m[1]);
    for (const banned of ['xero', 'xero-link', 'xero-net', 'connected-data']) {
      expect(imports, `angus.ts must not import ${banned}`).not.toContain(banned);
    }
  });

  it('says so in words a person reads, not only in a comment', () => {
    expect(src).toContain('ANGUS_IS_NOT_A_CONNECTOR');
  });
});

describe('readiness', () => {
  it('is not ready before six months', () => {
    const r = readiness(3);
    expect(r.ready).toBe(false);
    expect(r.through).toBeCloseTo(0.5);
    expect(r.says).toContain('3 more months');
  });

  it('is ready at six', () => {
    expect(readiness(READY_AFTER_MONTHS).ready).toBe(true);
  });

  it('never runs past full', () => {
    expect(readiness(40).through).toBe(1);
  });

  it('treats no data as no data rather than as a negative', () => {
    const r = readiness(0);
    expect(r.through).toBe(0);
    expect(r.months).toBe(0);
  });
});

describe('the switch is offered once and never forced', () => {
  it('is not offered before there is enough history', () => {
    expect(switchOffer('connector', 2, null).offered).toBe(false);
  });

  it('is offered at six months', () => {
    expect(switchOffer('connector', 6, null).offered).toBe(true);
  });

  it('stops asking once a business has said stay', () => {
    const o = switchOffer('connector', 24, 'stay');
    expect(o.offered).toBe(false);
    expect(o.says).toContain('stopped asking');
  });

  it('is never offered to a business already on it', () => {
    expect(switchOffer('angus', 24, null).offered).toBe(false);
  });

  it('names everything that moves, so nobody has to trust a promise', () => {
    expect(WHAT_MOVES.length).toBeGreaterThanOrEqual(5);
    expect(WHAT_MOVES.map(w => w.what).join(' ')).toContain('Pay run history');
  });
});

describe('where the figures come from is always said', () => {
  it('names the connector when there is one', () => {
    expect(sourceTitle('connector', 'Xero')).toContain('Xero');
    expect(sourceNote('connector', 'Xero')).toContain('each morning');
  });

  it('says Angus figures cross within the minute and are checked nightly (separate product, one connection)', () => {
    expect(sourceNote('angus', null)).toContain('within the minute');
  });

  it('does not pretend a missing connector is one', () => {
    expect(sourceTitle('connector', null)).toContain('No financial system');
  });
});

describe('the four shields refuse to invent a benchmark', () => {
  const figures: Figures = { ...NO_FIGURES, cash: 10_000_00, gst: 3_000_00, payroll: 2_000_00 };

  it('will not turn a balance into weeks without knowing the weekly cost', () => {
    const s = cashShield(figures, NO_SHIELD_SETUP);
    expect(s.state).toBe('unknown');
    expect(s.says).toContain('not what a week costs');
  });

  it('will not judge a margin it has no benchmark for', () => {
    const s = marginShield(38, NO_SHIELD_SETUP);
    expect(s.state).toBe('unknown');
    expect(s.value).toBe('38.0%');
    expect(s.says).toContain('will not tell you whether that is good');
  });

  it('holds when the margin beats the benchmark the business set', () => {
    const setup: ShieldSetup = { ...NO_SHIELD_SETUP, benchmarkMarginPct: 35 };
    expect(marginShield(38, setup).state).toBe('held');
  });

  it('breaks the cash shield when cover is under half the buffer', () => {
    const setup: ShieldSetup = { bufferWeeks: 8, weeklyCostCents: 5_000_00, benchmarkMarginPct: null };
    /* $10,000 at $5,000 a week is 2 weeks, against a buffer of 8. */
    expect(cashShield(figures, setup).state).toBe('broken');
  });

  it('is thin rather than broken just under the buffer', () => {
    const setup: ShieldSetup = { bufferWeeks: 2.5, weeklyCostCents: 5_000_00, benchmarkMarginPct: null };
    expect(cashShield(figures, setup).state).toBe('thin');
  });

  it('holds tax when what is set aside covers what is owed', () => {
    expect(taxShield(figures, 6_000_00).state).toBe('held');
  });

  it('breaks tax when barely anything is set aside', () => {
    const s = taxShield(figures, 1_000_00);
    expect(s.state).toBe('broken');
    expect(s.says).toContain('ends companies');
  });

  it('calls nothing overdue held, and 90 days broken', () => {
    expect(owedShield(0, null).state).toBe('held');
    expect(owedShield(10_000_00, 95).state).toBe('broken');
    expect(owedShield(10_000_00, 20).state).toBe('thin');
  });

  it('does not count unknown as a problem', () => {
    const list = shields(NO_FIGURES, NO_SHIELD_SETUP, { setAsideCents: null, marginPct: null, overdueCents: null, oldestDays: null });
    expect(list).toHaveLength(4);
    expect(broken(list)).toHaveLength(0);
  });
});

describe('the reviews', () => {
  const kinds = REVIEWS.slice(0, 3);
  const made = (finding: string | null, signedAt: string | null): PreparedReview =>
    ({ kind: kinds[0], finding, signedAt, signedBy: signedAt ? 'Kris' : null });

  it('has the eight the design names', () => {
    expect(REVIEWS).toHaveLength(8);
    /* Three weekly — cash, debtors, creditors — because those are the ones that move in a week. */
    expect(REVIEWS.filter(r => r.cadence === 'weekly').map(r => r.key)).toEqual(['cash', 'debtors', 'creditors']);
  });

  it('never reports "no issues" for a review it could not write', () => {
    const line = reviewLine(made(null, null));
    expect(line).toContain('not a clean bill of health');
  });

  it('only puts signed reviews in the board pack', () => {
    const list = [made('a', '2026-09-01'), made('b', null)];
    expect(signedCount(list)).toBe(1);
    expect(forBoardPack(list)).toHaveLength(1);
  });

  it('counts what is waiting rather than what exists', () => {
    const list = [made('a', '2026-09-01'), made('b', null), made(null, null)];
    expect(reviewsLine(list)).toContain('2 reviews ready, 1 waiting');
  });
});

describe('payroll ends here and never starts here', () => {
  it('sends approved hours to Angus, which works out the pay (Angus processes, SiteVIP captures)', () => {
    expect(payrollPostsTo('angus', null)).toContain('works out the pay run');
  });

  it('posts into whatever they are on otherwise', () => {
    expect(payrollPostsTo('connector', 'Xero')).toContain('Xero');
  });
});
