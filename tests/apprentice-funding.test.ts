import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  claimState, daysUntil, needsAttention, byUrgency, fundingStats, fundingLine, amountLabel,
  CLAIM_LABEL, SOON_DAYS, type Claim,
} from '../src/lib/apprentice-funding';

/*
  ── Apprentice funding ───────────────────────────────────────────────────────────────────────────

  Design 17: *"incentive and rebate claims per apprentice from their training contract, when each
  opens, received/not yet claimed. Amounts confirmed with the Apprenticeship Support Network
  provider (not hard-coded)."*

  Real money a business is entitled to and routinely does not claim — not by decision, but because
  the window opens on a date buried in a training contract and nobody is watching for it. The DATE
  is the whole product here.
*/

const TODAY = '2026-09-24';

const claim = (over: Partial<Claim> = {}): Claim => ({
  id: 'c1', who: 'Sione Tui', what: 'Commonwealth incentive · claim 2',
  opensAt: '2026-10-04', closesAt: null, amountCents: null,
  claimedAt: null, receivedAt: null, ...over,
});

describe('where a claim has got to', () => {
  it('reads it from the dates, not from a stored status', () => {
    expect(claimState(claim({ opensAt: '2026-10-04' }), TODAY)).toBe('not_open');
    expect(claimState(claim({ opensAt: '2026-09-01' }), TODAY)).toBe('claimable');
    expect(claimState(claim({ claimedAt: '2026-09-10' }), TODAY)).toBe('claimed');
    expect(claimState(claim({ receivedAt: '2026-09-20' }), TODAY)).toBe('received');
  });

  /*
    A claim recorded as claimable in March is not claimable in October if its window shut in June —
    and a stored status would go on saying it was.
  */
  it('KNOWS A WINDOW THAT HAS CLOSED, whatever anybody recorded', () => {
    expect(claimState(claim({ opensAt: '2026-01-01', closesAt: '2026-06-30' }), TODAY)).toBe('missed');
  });

  it('and received outranks everything, because the money is in', () => {
    expect(claimState(claim({ opensAt: '2026-01-01', closesAt: '2026-06-30', receivedAt: '2026-05-01' }), TODAY))
      .toBe('received');
  });

  it('counts the days until it opens, which is what makes it worth looking at', () => {
    expect(daysUntil('2026-10-04', TODAY)).toBe(10);
    expect(daysUntil(null, TODAY)).toBeNull();
  });
});

describe('what needs somebody today', () => {
  it('is what is claimable now, or opening soon enough to get ready', () => {
    expect(needsAttention(claim({ opensAt: '2026-09-01' }), TODAY), 'open now').toBe(true);
    expect(needsAttention(claim({ opensAt: '2026-10-04' }), TODAY), 'in 10 days').toBe(true);
    expect(needsAttention(claim({ opensAt: '2027-06-01' }), TODAY), 'next year').toBe(false);
    expect(SOON_DAYS).toBe(30);
  });

  /* A missed window sinks: it cannot be acted on, and it must not sit above something that can. */
  it('SORTS CLAIMABLE FIRST AND A MISSED WINDOW LAST', () => {
    const rows = [
      claim({ id: 'missed', opensAt: '2026-01-01', closesAt: '2026-06-30' }),
      claim({ id: 'soon', opensAt: '2026-10-04' }),
      claim({ id: 'now', opensAt: '2026-09-01' }),
    ];
    expect(byUrgency(rows, TODAY).map(c => c.id)).toEqual(['now', 'soon', 'missed']);
  });
});

describe('SPEC never invents an amount', () => {
  /*
    ── The rule the whole file exists to keep ───────────────────────────────────────────────────

    The figures change with the scheme, the state, the year of the apprenticeship and the employer.
    A number SPEC made up and showed as claimable is worse than no number: it is a business
    budgeting for money that is not coming.
  */
  it('SHOWS NOTHING RATHER THAN A ZERO when the amount is not confirmed', () => {
    expect(amountLabel(null)).toBe('Amount not confirmed yet');
    expect(amountLabel(null)).not.toContain('0');
    expect(amountLabel(150_000)).toBe('$1,500');
  });

  it('AND HARD-CODES NO FIGURE ANYWHERE IN THE FILE', () => {
    const src = readFileSync('src/lib/apprentice-funding.ts', 'utf8');
    /* No dollar amounts, and no cent constants dressed up as defaults. */
    expect(src).not.toMatch(/\$\s?\d/);
    expect(src).not.toMatch(/amountCents\s*[:=]\s*\d/);
  });

  it('and says so on the screen when a claim is open with no confirmed amount', () => {
    const s = fundingStats([claim({ opensAt: '2026-09-01' })], TODAY);
    expect(s.unconfirmed).toBe(true);
    expect(fundingLine(s)).toContain('Apprenticeship Support Network');
  });

  it('counts only money actually received, never a forecast', () => {
    const s = fundingStats([
      claim({ id: 'a', receivedAt: '2026-08-12', amountCents: 150_000 }),
      claim({ id: 'b', opensAt: '2026-09-01', amountCents: 400_000 }),
    ], TODAY);
    expect(s.receivedCents, 'the claimable 4,000 is not counted').toBe(150_000);
  });
});

describe('the headline', () => {
  it('leads on money that can be claimed today', () => {
    expect(fundingLine(fundingStats([claim({ opensAt: '2026-09-01' })], TODAY))).toContain('open now');
  });

  it('then on what opens soon', () => {
    expect(fundingLine(fundingStats([claim({ opensAt: '2026-10-04' })], TODAY))).toContain('within 30 days');
  });

  /* A closed window is not an alarm — it is over. Saying so, and moving on, is the honest version. */
  it('IS NOT AN ALARM ABOUT A WINDOW THAT HAS ALREADY CLOSED', () => {
    const line = fundingLine(fundingStats([claim({ opensAt: '2026-01-01', closesAt: '2026-06-30' })], TODAY));
    expect(line).toContain('Nothing to do about those');
  });

  it('and says nothing rather than congratulating an empty register', () => {
    expect(fundingLine(fundingStats([], TODAY))).toBe('Nothing claimable right now.');
    expect(CLAIM_LABEL.claimable).toBe('Claimable now');
  });
});
