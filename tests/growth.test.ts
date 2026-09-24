import { describe, it, expect } from 'vitest';
import {
  QUOTE_CHASE, GONE_COLD_DAYS, quoteWatch, chaseDraft,
  worthGoingBackFor, PATTERN_NEEDS, LAPSED_DAYS, OVERDUE_BY,
  tenderWatch, TENDER_WARN_DAYS, growthLine,
} from '../src/lib/growth';
import { REMINDERS } from '../src/lib/billing-job';

const at = (iso: string) => new Date(`${iso}T09:00:00.000Z`);
const day = (n: number) => new Date(Date.parse('2026-06-01T09:00:00.000Z') + n * 86_400_000);
const q = (over: Partial<Parameters<typeof quoteWatch>[0]> = {}) => ({
  id: 'q1', ref: 'Q-1001', client: 'Dana Ward', valueCents: 480_000,
  sentAt: '2026-06-01T09:00:00.000Z', ...over,
});

/*
  ── The gap this closes ─────────────────────────────────────────────────────────────────────────

  Money already EARNED has been chased automatically since September. Money about to be earned was
  not, and nobody decided that — the invoice side was built by somebody thinking about cash and the
  quote side by somebody thinking about screens.
*/
describe('quotes chase themselves, the way invoices already did', () => {
  it('chases sooner than an invoice, because it is a different animal', () => {
    expect([...QUOTE_CHASE]).toEqual([3, 7, 14]);
    /* An invoice is owed and will still be owed in a month. A quote is a decision being made now. */
    expect(QUOTE_CHASE[0]).toBeLessThan(REMINDERS[0]);
    expect(QUOTE_CHASE[QUOTE_CHASE.length - 1]).toBeLessThan(REMINDERS[REMINDERS.length - 1]);
  });

  it('says nothing while it is too new to chase', () => {
    const w = quoteWatch(q(), day(2));
    expect(w.state).toBe('waiting');
    expect(w.due).toBeNull();
  });

  it('raises each chase as it comes round', () => {
    expect(quoteWatch(q(), day(3)).due).toBe(3);
    expect(quoteWatch(q({ chasedDays: [3] }), day(7)).due).toBe(7);
    expect(quoteWatch(q({ chasedDays: [3, 7] }), day(14)).due).toBe(14);
  });

  it('never sends the same chase twice', () => {
    expect(quoteWatch(q({ chasedDays: [3] }), day(4)).due).toBeNull();
    expect(quoteWatch(q({ chasedDays: [3, 7, 14] }), day(15)).due).toBeNull();
  });

  it('on a quote nobody touched, sends the chase that is DUE, not the first one', () => {
    /*
      A quote eleven days out needs the day-seven chase now. Sending the gentle first nudge eleven
      days late reads as a business that has not been paying attention — which it is.
    */
    const w = quoteWatch(q(), day(11));
    expect(w.due).toBe(7);
  });

  it('stops chasing and says so once it has gone cold', () => {
    const w = quoteWatch(q(), day(GONE_COLD_DAYS));
    expect(w.state).toBe('cold');
    expect(w.due).toBeNull();
    expect(w.says).toMatch(/mark it lost|ring them/i);
  });

  it('an answered quote is never chased, however old', () => {
    const w = quoteWatch(q({ answeredAt: '2026-06-02T09:00:00.000Z' }), day(40));
    expect(w.state).toBe('answered');
    expect(w.due).toBeNull();
  });

  it('each chase says something different, and the last one lets them off the hook', () => {
    const drafts = QUOTE_CHASE.map(d => chaseDraft(q(), d, 'JBI Electrical'));
    expect(new Set(drafts).size).toBe(QUOTE_CHASE.length);
    for (const d of drafts) {
      expect(d).toContain('Dana');
      expect(d).toContain('Q-1001');
      expect(d).toContain('JBI Electrical');
      expect(d.length).toBeLessThan(320);
    }
    /* Three copies of "just following up" is what makes somebody stop replying. */
    expect(drafts[2]).toMatch(/gone another way|completely fine/i);
  });
});

describe('work worth going back for', () => {
  const hist = (key: string, dates: string[], each = 200_000) =>
    ({ key, name: key, jobs: dates.map(d => ({ at: `${d}T00:00:00.000Z`, valueCents: each })) });

  it('needs a real rhythm before it calls somebody overdue', () => {
    /*
      Two jobs give one gap, and one gap is not a rhythm. Ringing people because their single
      previous job was a year ago is how a business stops trusting the list.
    */
    expect(PATTERN_NEEDS).toBe(3);
    const two = worthGoingBackFor([hist('Pair', ['2024-01-01', '2024-07-01'])], at('2025-02-01'));
    expect(two.filter(r => r.reason === 'pattern')).toEqual([]);
  });

  it('names somebody who is past their own rhythm', () => {
    /* Back roughly every six months, and it has been ten. */
    const r = worthGoingBackFor(
      [hist('Regular', ['2024-06-01', '2024-12-01', '2025-06-01'])], at('2026-04-01'),
    );
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe('pattern');
    expect(r[0].everyDays).toBeGreaterThan(150);
    expect(r[0].says).toMatch(/Normally back about every/);
  });

  it('leaves alone somebody who is not yet due', () => {
    const r = worthGoingBackFor(
      [hist('Regular', ['2025-06-01', '2025-12-01', '2026-06-01'])], at('2026-07-01'),
    );
    expect(r).toEqual([]);
  });

  it('uses the median gap, so one ancient job does not distort it', () => {
    /*
      Average would say this customer comes back every sixteen months and is not due. The median
      says every six, and they are four months overdue. The median is what the customer DOES.
    */
    const r = worthGoingBackFor(
      [hist('Lumpy', ['2020-01-01', '2025-01-01', '2025-07-01', '2026-01-01'])], at('2026-09-01'),
    );
    expect(r).toHaveLength(1);
    expect(r[0].everyDays).toBeLessThan(250);
  });

  it('picks up somebody long gone even with no pattern', () => {
    const r = worthGoingBackFor([hist('Gone', ['2024-01-01'])], at('2026-01-02'));
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe('lapsed');
    expect(r[0].quiet).toBeGreaterThanOrEqual(LAPSED_DAYS);
  });

  it('ranks by what they have been worth, not by how long they have been quiet', () => {
    /*
      A business has time to ring five people this week. The longest-quiet list puts the smallest
      customers at the top, every time.
    */
    const r = worthGoingBackFor([
      hist('Small', ['2022-01-01'], 40_000),
      hist('Big', ['2024-06-01'], 900_000),
    ], at('2026-06-01'));
    expect(r.map(x => x.name)).toEqual(['Big', 'Small']);
  });

  it('says nothing about a customer with no jobs', () => {
    expect(worthGoingBackFor([{ key: 'new', name: 'New', jobs: [] }], at('2026-06-01'))).toEqual([]);
  });
});

describe('tenders do not close by accident', () => {
  const t = (closesAt: string, submittedAt: string | null = null) =>
    ({ id: 't1', title: 'Switchboard upgrade', client: 'Builder', closesAt: `${closesAt}T09:00:00.000Z`, submittedAt });

  it('counts down, and shouts on the day', () => {
    expect(tenderWatch(t('2026-06-20'), at('2026-06-01')).state).toBe('open');
    expect(tenderWatch(t('2026-06-05'), at('2026-06-01')).state).toBe('soon');
    expect(tenderWatch(t('2026-06-01'), at('2026-06-01')).state).toBe('today');
    expect(tenderWatch(t('2026-06-01'), at('2026-06-01')).says).toMatch(/TODAY/);
  });

  it('warns with enough time to do it properly', () => {
    expect(TENDER_WARN_DAYS).toBeGreaterThanOrEqual(3);
    const w = tenderWatch(t('2026-06-04'), at('2026-06-01'));
    expect(w.state).toBe('soon');
    expect(w.says).toMatch(/properly/);
  });

  it('says plainly when one was missed, because it is the only one that cannot be fixed', () => {
    const w = tenderWatch(t('2026-05-20'), at('2026-06-01'));
    expect(w.state).toBe('closed');
    expect(w.says).toMatch(/nothing went in/i);
  });

  it('a submitted tender is never chased', () => {
    expect(tenderWatch(t('2026-06-01', '2026-05-30'), at('2026-06-10')).state).toBe('submitted');
  });
});

describe('the stream in one line', () => {
  it('leads with what is about to be lost, not with what is pleasant', () => {
    const line = growthLine({ chasesReady: 4, goingCold: 2, toRingBack: 9, closingSoon: 1, missedTenders: 0 });
    /* Order: things stop being possible in this order. */
    expect(line.indexOf('tender')).toBeLessThan(line.indexOf('quote'));
    expect(line.indexOf('quote')).toBeLessThan(line.indexOf('ringing'));
  });

  it('says nothing is waiting when nothing is', () => {
    expect(growthLine({ chasesReady: 0, goingCold: 0, toRingBack: 0, closingSoon: 0, missedTenders: 0 }))
      .toMatch(/Nothing waiting/);
  });

  it('reads as English with one of each', () => {
    const line = growthLine({ chasesReady: 1, goingCold: 1, toRingBack: 1, closingSoon: 1, missedTenders: 0 });
    expect(line).toContain('1 tender closes');
    expect(line).toContain('1 quote has');
    expect(line).toContain('1 customer is');
    expect(line).not.toContain('  ');
  });
});
