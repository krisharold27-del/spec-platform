import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARD_NOT_ISSUED, CARD_ROLES, NOT_APPRENTICES, limitFor, limitsReady,
  BLOCKED, isBlocked, RECEIPT_WITHIN_HOURS, spendWatch, remindLeader, readSpends,
  CARD_IS_NOT_PAUSED, EVERY_SPEND_PICKS_A_JOB,
  type Limit, type Spend,
} from '../src/lib/angus-card';

const src = readFileSync(join(process.cwd(), 'src/lib/angus-card.ts'), 'utf8');
const NOW = new Date('2026-09-25T12:00:00Z');

const spend = (over: Partial<Spend> = {}): Spend => ({
  id: 's1', who: 'Tom Reyes', leader: 'Amrit Kaur', merchant: 'Rexel Botany',
  cents: 18_420, at: '2026-09-25T09:00:00Z', jobRef: 'J-4402', toOverhead: false,
  receiptAt: '2026-09-25T09:05:00Z', blockedAs: null,
  ...over,
});

describe('SPEC does not claim to have issued anything', () => {
  /*
    The no-false-feed rule in a new place. There is no card-issuing partner, so a screen implying a
    card exists would be the product claiming something happened that did not.
  */
  it('says plainly that it cannot issue a card', () => {
    expect(CARD_NOT_ISSUED).toContain('cannot issue');
    expect(CARD_NOT_ISSUED).toContain('card-issuing partner');
  });

  it('never claims a card was issued, activated or loaded', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const strings = [...code.matchAll(/'((?:[^'\\]|\\.)*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2]);
    const claims = strings.filter(v =>
      /\b(card (issued|activated|loaded)|your card is (ready|active))\b/i.test(v));
    expect(claims, `claims a card exists: ${claims.join(' | ')}`).toEqual([]);
  });

  it('talks to nothing', () => {
    expect(src).not.toMatch(/\bfetch\(|axios|https?:\/\//);
  });
});

describe('who gets one', () => {
  it('is the four roles the design names', () => {
    expect(CARD_ROLES.map(r => r.key)).toEqual(['owner_manager', 'supervisor', 'technician', 'office']);
  });

  it('says apprentices do not, rather than leaving them out silently', () => {
    /* An absence reads as an oversight and somebody adds them. This reads as a decision. */
    expect(NOT_APPRENTICES).toContain('Apprentices do not get one');
    expect(NOT_APPRENTICES).toContain('Not about trust');
  });
});

describe('no card goes out without a limit', () => {
  const some: Limit[] = [
    { role: 'owner_manager', monthlyCents: 500_000 },
    { role: 'supervisor', monthlyCents: 200_000 },
  ];

  it('reads a limit', () => {
    expect(limitFor(some, 'owner_manager')).toBe(500_000);
    expect(limitFor(some, 'office')).toBeNull();
  });

  it('refuses until every role has one', () => {
    const r = limitsReady(some);
    expect(r.ready).toBe(false);
    expect(r.missing.map(m => m.key)).toEqual(['technician', 'office']);
    expect(r.says).toContain('signed blank cheque');
  });

  it('is ready when they all do', () => {
    expect(limitsReady(CARD_ROLES.map(r => ({ role: r.key, monthlyCents: 100_000 }))).ready).toBe(true);
  });
});

describe('what is blocked', () => {
  it('is three, and no more', () => {
    /*
      A long block list stops somebody buying a part at a hardware shop that miscoded itself, on a
      Saturday, with a customer waiting — and the card ends up in a drawer. These three are the ones
      where a false block costs nothing.
    */
    expect(BLOCKED).toHaveLength(3);
    expect(BLOCKED.map(b => b.key)).toEqual(['alcohol', 'gambling', 'cash']);
  });

  it('knows one when it sees it', () => {
    expect(isBlocked('gambling')).toBe(true);
    expect(isBlocked('hardware')).toBe(false);
  });

  it('reports a blocked spend as blocked and nothing else', () => {
    const w = spendWatch(spend({ blockedAs: 'alcohol', jobRef: null, receiptAt: null }), NOW);
    expect(w.state).toBe('blocked');
    expect(w.remind).toBeNull();
  });
});

describe('every spend picks a job', () => {
  it('flags one that picked nothing', () => {
    const w = spendWatch(spend({ jobRef: null, toOverhead: false }), NOW);
    expect(w.state).toBe('uncoded');
    /* The real cost: it reaches neither the job's margin nor overhead. */
    expect(w.says).toContain('does not reach overhead either');
  });

  it('accepts a deliberate overhead', () => {
    expect(spendWatch(spend({ jobRef: null, toOverhead: true }), NOW).state).toBe('good');
  });

  it('puts uncoded ahead of a missing receipt', () => {
    /* A cost that lands nowhere makes the numbers quietly wrong rather than visibly incomplete. */
    const w = spendWatch(spend({ jobRef: null, toOverhead: false, receiptAt: null, at: '2026-09-20T09:00:00Z' }), NOW);
    expect(w.state).toBe('uncoded');
  });

  it('says so where anybody building the screen will read it', () => {
    expect(EVERY_SPEND_PICKS_A_JOB).toContain('at the till');
  });
});

describe('a missing receipt reminds the leader and never pauses the card', () => {
  it('says nothing inside the window', () => {
    const w = spendWatch(spend({ receiptAt: null, at: '2026-09-25T09:00:00Z' }), NOW);
    expect(w.state).toBe('good');
    expect(w.remind).toBeNull();
  });

  it('reminds the leader past it', () => {
    const w = spendWatch(spend({ receiptAt: null, at: '2026-09-23T09:00:00Z' }), NOW);
    expect(w.state).toBe('no_receipt');
    expect(w.remind).toBe('Amrit Kaur');
    expect(RECEIPT_WITHIN_HOURS).toBe(24);
  });

  it('never reminds the cardholder', () => {
    const w = spendWatch(spend({ receiptAt: null, at: '2026-09-23T09:00:00Z' }), NOW);
    expect(w.remind).not.toBe('Tom Reyes');
  });

  it('tells the leader the card still works', () => {
    const w = spendWatch(spend({ receiptAt: null, at: '2026-09-23T09:00:00Z' }), NOW);
    const said = remindLeader(w)!;
    expect(said).toContain('still works');
    expect(said).toContain('Tom Reyes');
    expect(CARD_IS_NOT_PAUSED).toContain('never pauses');
  });

  it('records a receipt that came in late without making a fuss of it', () => {
    const w = spendWatch(spend({ at: '2026-09-23T09:00:00Z', receiptAt: '2026-09-25T09:00:00Z' }), NOW);
    expect(w.state).toBe('late_receipt');
    expect(w.remind).toBeNull();
  });

  it('cannot remind anybody with nobody to remind', () => {
    const w = spendWatch(spend({ leader: null, receiptAt: null, at: '2026-09-23T09:00:00Z' }), NOW);
    expect(remindLeader(w)).toBeNull();
  });
});

describe('the whole card programme at a glance', () => {
  it('counts what needs somebody', () => {
    const r = readSpends([
      spend(),
      spend({ id: 's2', jobRef: null, toOverhead: false }),
      spend({ id: 's3', receiptAt: null, at: '2026-09-23T09:00:00Z' }),
      spend({ id: 's4', blockedAs: 'alcohol' }),
    ], NOW);
    expect(r.uncoded).toBe(1);
    expect(r.noReceipt).toBe(1);
    expect(r.blocked).toBe(1);
    expect(r.needing).toHaveLength(2);
    expect(r.says).toContain('blocked at the till');
  });

  it('says so when everything is in order', () => {
    expect(readSpends([spend()], NOW).says).toContain('all costed with receipts');
  });

  it('says there is nothing rather than zero', () => {
    expect(readSpends([], NOW).says).toBe('No spend on cards yet.');
  });
});
