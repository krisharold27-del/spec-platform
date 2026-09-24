import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  wipRow, wipStats, wipLine, byWipAttention, forecastMargin, earnedCents,
  MARGIN_AT_RISK, WIP_TOLERANCE_CENTS, type WipJob,
} from '../src/lib/wip';
import {
  runForward, lowest, cashStats, cashAdvice, cashLine, DEFAULT_BUFFER_CENTS, type Week,
} from '../src/lib/cashflow';
import {
  reworkStats, reworkLine, pattern, recoverFrom, CAUSES, REWORK_TARGET, PATTERN_AT, type Callback,
} from '../src/lib/rework';
import {
  thankYou, mayAsk, reviewStats, reviewLine, needsReply, isComplaint, type Review,
} from '../src/lib/reviews';

/*
  ── Get paid and keep them ───────────────────────────────────────────────────────────────────────

  Design 17's third group. Four screens that are all the same question asked at different distances:
  is the work turning into money, and is the customer coming back.
*/

/* ═══ Work in progress ═══════════════════════════════════════════════════════════════════════════ */

const job = (over: Partial<WipJob> = {}): WipJob => ({
  id: 'j1', ref: 'J-1001', title: 'Riser rough-in',
  quotedCents: 10_000_00, costCents: 3_000_00, billedCents: 5_000_00, done: 0.5, ...over,
});

describe('work in progress', () => {
  it('earns the quote in proportion to how far through it is', () => {
    expect(earnedCents({ quotedCents: 10_000_00, done: 0.5 })).toBe(5_000_00);
    expect(earnedCents({ quotedCents: 10_000_00, done: 2 }), 'never more than the quote').toBe(10_000_00);
  });

  /*
    Cost against the quote reads healthy on every job that has barely started. The honest forecast
    scales what has been spent to the whole job.
  */
  it('FORECASTS FROM THE RATE OF SPEND, not from cost against the quote', () => {
    // Half done, 30% of the quote spent → 60% to finish → 40% margin.
    expect(forecastMargin({ quotedCents: 10_000_00, costCents: 3_000_00, done: 0.5 })).toBeCloseTo(0.4, 5);
    // The naive version would call this a 70% margin.
  });

  it('AND HAS NO FORECAST AT ALL when nothing has been recorded', () => {
    expect(forecastMargin({ quotedCents: 10_000_00, costCents: 0, done: 0 }))
      .toBeNull();
  });

  it('says a job is under-billed, and what to claim', () => {
    const r = wipRow(job({ billedCents: 2_000_00 }));
    expect(r.state).toBe('under_billed');
    expect(r.advice).toContain('$3,000');
    expect(r.action).toContain('Raise the claim');
  });

  /* Billed ahead is good for cash and owed back in work — reporting it as a fault trains people to ignore the screen. */
  it('DOES NOT TREAT BILLED AHEAD AS A FAULT', () => {
    const r = wipRow(job({ billedCents: 8_000_00 }));
    expect(r.state).toBe('billed_ahead');
    expect(r.action, 'nothing to press').toBeNull();
    expect(r.advice).toContain('Good for cash');
  });

  it('leaves small differences alone', () => {
    expect(wipRow(job({ billedCents: 5_000_00 + WIP_TOLERANCE_CENTS })).state).toBe('on_track');
  });

  /*
    A job that has stopped making money is not fixed by an invoice. Sending somebody to raise a
    claim on it, rather than a variation, is the wrong instruction at the only moment it can still
    be acted on.
  */
  it('PUTS MARGIN AT RISK ABOVE ANY BILLING GAP, and asks for a variation not a claim', () => {
    // Half done, 90% of the quote already spent — a loss running.
    const r = wipRow(job({ costCents: 9_000_00, billedCents: 0, done: 0.5 }));
    expect(r.state).toBe('at_risk');
    expect(r.action).toBe('Draft the variation');
    expect(r.advice).toContain('while the work is still going on');
    expect(MARGIN_AT_RISK).toBe(0.2);
  });

  it('sorts the worst first', () => {
    const rows = [
      wipRow(job({ id: 'ok', billedCents: 5_000_00 })),
      wipRow(job({ id: 'under', billedCents: 1_000_00 })),
      wipRow(job({ id: 'risk', costCents: 9_500_00 })),
    ];
    expect(byWipAttention(rows).map(r => r.id)).toEqual(['risk', 'under', 'ok']);
  });

  it('NEVER READS AS FINE while a job has stopped making money', () => {
    const s = wipStats([wipRow(job({ costCents: 9_500_00 }))]);
    expect(wipLine(s)).toContain('stopped making money');
    expect(wipLine(wipStats([]))).toBe('No open jobs.');
  });
});

/* ═══ Cash flow ══════════════════════════════════════════════════════════════════════════════════ */

const weeks = (ins: number[], outs: number[]): Week[] =>
  ins.map((v, i) => ({ n: i + 1, startsAt: `2026-10-${String(5 + i * 7).padStart(2, '0')}`, inCents: v, outCents: outs[i] }));

describe('cash flow', () => {
  /*
    The question is never "how much comes in in week 7", it is "what is left by week 7". Those are
    different questions with different answers, and only the second one is worth a screen.
  */
  it('RUNS THE BALANCE FORWARD rather than totalling each week on its own', () => {
    const b = runForward(100_00, weeks([10_00, 10_00], [20_00, 20_00]));
    expect(b.map(w => w.balanceCents)).toEqual([90_00, 80_00]);
  });

  it('finds the week it gets tightest', () => {
    const b = runForward(100_00, weeks([10_00, 5_00, 40_00], [20_00, 30_00, 10_00]));
    expect(lowest(b)?.n).toBe(2);
    expect(lowest([])).toBeNull();
  });

  it('marks every week that closes under the buffer', () => {
    const b = runForward(100_00, weeks([0, 0], [50_00, 10_00]), 60_00);
    expect(b.map(w => w.short)).toEqual([true, true]);
  });

  it('has a default buffer, and it is the business’s to change', () => {
    expect(DEFAULT_BUFFER_CENTS).toBe(8_000_000);
    const b = runForward(100_000_00, weeks([0], [0]), 200_000_00);
    expect(b[0].short, 'a business can set its own floor').toBe(true);
  });

  /* Named actions with amounts on them, never "improve cash flow". */
  it('NAMES WHAT TO DO, AND WHAT IT IS WORTH', () => {
    const b = runForward(100_000_00, weeks([0], [40_000_00]));
    const s = cashStats(100_000_00, b, 0, 0);
    const said = cashAdvice(s, [{ says: 'Claim the $22,300 Harbourview has earned.', worthCents: 2_230_000, where: '/jobs?tab=wip' }]);
    expect(said).toContain('Harbourview');
    expect(said).toContain('stays above');
  });

  /* And says so when the actions are not enough, rather than implying they are. */
  it('AND SAYS WHEN THE ACTIONS DO NOT COVER IT', () => {
    const b = runForward(100_000_00, weeks([0], [90_000_00]));
    const s = cashStats(100_000_00, b, 0, 0);
    const said = cashAdvice(s, [{ says: 'Claim the $2,000.', worthCents: 200_000, where: '' }]);
    expect(said).toContain('still');
    expect(said).toContain('something else has to move');
  });

  it('is honest when SPEC has nothing to offer', () => {
    const b = runForward(0, weeks([0], [0]));
    const s = cashStats(0, b, 0, 0);
    expect(cashAdvice(s, [])).toContain('needs a conversation');
  });

  it('never reads as fine while a week closes under the buffer', () => {
    const b = runForward(100_000_00, weeks([0], [50_000_00]));
    expect(cashLine(cashStats(100_000_00, b, 0, 0))).toContain('under your');
  });
});

/* ═══ Callbacks and rework ═══════════════════════════════════════════════════════════════════════ */

const cb = (over: Partial<Callback> = {}): Callback => ({
  id: 'c1', jobRef: 'J-1001', cause: 'workmanship', hours: 4, costCents: 40_000,
  recoveredCents: 0, who: 'Jack', at: '2026-09-01', ...over,
});

describe('callbacks and rework', () => {
  /*
    Four causes, one honest consequence each. Getting this wrong in either direction is expensive:
    a supplier's fault written off as workmanship is money never claimed, and a genuine workmanship
    callback invoiced to the customer is a customer lost.
  */
  it('KNOWS WHO CARRIES EACH CAUSE', () => {
    expect(recoverFrom('material')).toBe('supplier');
    expect(recoverFrom('subbie')).toBe('subcontractor');
    expect(recoverFrom('not_ours')).toBe('customer');
    expect(recoverFrom('workmanship'), 'ours — fixed free').toBeNull();
    expect(CAUSES).toHaveLength(4);
  });

  it('counts rework as a share of hours, not as a number of jobs', () => {
    const s = reworkStats([cb({ hours: 4 }), cb({ id: 'c2', hours: 6 })], 500);
    expect(s.hours).toBe(10);
    expect(s.rate).toBeCloseTo(0.02, 5);
  });

  /*
    The target is under 2%, not zero. A business reporting zero rework is a business where nobody
    writes it down, and a target of zero is exactly what produces that.
  */
  it('HAS A TARGET SOMEBODY WILL ACTUALLY RECORD AGAINST', () => {
    expect(REWORK_TARGET).toBe(0.02);
    expect(reworkStats([cb({ hours: 15 })], 500).overTarget).toBe(true);
    expect(reworkStats([cb({ hours: 5 })], 500).overTarget).toBe(false);
  });

  /* One callback is a bad day. Three with the same cause is a way of working. */
  it('NAMES A PATTERN ONLY WHEN THERE IS ONE', () => {
    expect(pattern([cb(), cb({ id: 'c2' })]), 'two is not a trend').toBeNull();
    const p = pattern([cb(), cb({ id: 'c2' }), cb({ id: 'c3' })]);
    expect(p?.count).toBe(PATTERN_AT);
    expect(p?.says).toContain('checklist');
  });

  it('says nothing rather than congratulating an empty register', () => {
    expect(reworkLine(reworkStats([], 500))).toContain('No callbacks');
  });
});

/* ═══ Reviews ════════════════════════════════════════════════════════════════════════════════════ */

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1', who: 'Sam', stars: 5, text: 'Great job', at: '2026-09-01', repliedAt: null, ...over,
});

describe('reviews', () => {
  it('sends the same message to everybody', () => {
    const t = thankYou('JBI Electrical', 'Sam Lee', 'https://g.page/r/x');
    expect(t).toContain('Sam');
    expect(t).toContain('JBI Electrical');
    expect(t).toContain('https://g.page/r/x');
  });

  it('asks once the job is paid, and never twice', () => {
    expect(mayAsk({ stage: 'paid', reviewAskedAt: null }, 'link').ok).toBe(true);
    expect(mayAsk({ stage: 'invoiced', reviewAskedAt: null }, 'link').ok).toBe(false);
    expect(mayAsk({ stage: 'paid', reviewAskedAt: '2026-09-01' }, 'link').ok).toBe(false);
    expect(mayAsk({ stage: 'paid', reviewAskedAt: null }, null).ok, 'no link to send').toBe(false);
  });

  /*
    ── The rule this whole file exists to keep ──────────────────────────────────────────────────

    No review gating. Asking how it went and then sending the link only to the happy ones is
    against Google's own policy — a business caught doing it can have its reviews removed — and it
    is a lie about what the rating means. So there is no branch on sentiment anywhere in the ask.
  */
  it('HAS NO WAY TO ASK ONLY THE HAPPY CUSTOMERS', () => {
    const src = readFileSync('src/lib/reviews.ts', 'utf8');
    const ask = src.slice(src.indexOf('export function mayAsk'), src.indexOf('export interface Review'));
    expect(ask).not.toMatch(/stars|rating|happy|sentiment|score/i);
  });

  it('and says why, so nobody adds it back as an improvement', () => {
    const src = readFileSync('src/lib/reviews.ts', 'utf8');
    expect(src).toContain('No review gating');
    expect(src).toMatch(/Google/);
  });

  /* Answering the complaints and ignoring the compliments reads as a business that only shows up when there is trouble. */
  it('WANTS A REPLY TO EVERY REVIEW, not only the bad ones', () => {
    expect(needsReply(review({ stars: 5 }))).toBe(true);
    expect(needsReply(review({ stars: 1 }))).toBe(true);
    expect(needsReply(review({ repliedAt: '2026-09-02' }))).toBe(false);
  });

  it('sends an unhappy customer to the supervisor as a callback', () => {
    expect(isComplaint(review({ stars: 2 }))).toBe(true);
    expect(isComplaint(review({ stars: 4 }))).toBe(false);
    const s = reviewStats([review({ stars: 2 })], 10, 0);
    expect(reviewLine(s)).toContain('callback');
  });

  it('counts the paid jobs nobody asked, which is the gap between the rule and what happened', () => {
    expect(reviewLine(reviewStats([], 5, 3))).toContain('3 paid jobs have not been asked');
  });
});
