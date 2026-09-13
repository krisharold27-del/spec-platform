/**
 * The engine against docs/BUILD_SPEC.md §3 and the worked examples in The Rules.
 * The workbook cases (SPEC_Master_Scorecard_Professional, snapshot 2025-03-05) are kept because
 * every KPI in them is Y or N, so they must still reproduce exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  pillarScore, roleScore, teamScore, isSpec, band, gates, validateWeights,
  type Criterion, type Assessment, type RoleScore, type Answer,
} from '../src/lib/scoring';
import { answerFor } from '../src/lib/status';

// ---- Rob (workbook: Safety 100%, People 65%, Earnings 70%, Compliance 65%, Overall 75%)
const robCriteria: Criterion[] = [
  { id: 'S1', pillar: 'safety', text: 'Zero LTI/MTI', weight: 0.25 },
  { id: 'S2', pillar: 'safety', text: '0 breaches to safety procedures', weight: 0.20 },
  { id: 'S3', pillar: 'safety', text: 'All incidents reported immediately', weight: 0.15 },
  { id: 'S4', pillar: 'safety', text: 'Fit for work', weight: 0.10 },
  { id: 'S5', pillar: 'safety', text: 'PPE compliance', weight: 0.10 },
  { id: 'S6', pillar: 'safety', text: 'Daily risk assessments', weight: 0.10 },
  { id: 'S7', pillar: 'safety', text: 'Training requirements met', weight: 0.10 },
  { id: 'P1', pillar: 'people', text: 'Fair compensation', weight: 0.25 },
  { id: 'P2', pillar: 'people', text: 'Respect between team members', weight: 0.25 },
  { id: 'P3', pillar: 'people', text: 'Punctuality', weight: 0.15 },
  { id: 'P4', pillar: 'people', text: 'Neat and tidy', weight: 0.15 },
  { id: 'P5', pillar: 'people', text: 'Acknowledge emails', weight: 0.10 },
  { id: 'P6', pillar: 'people', text: 'Work life balance', weight: 0.10 },
  { id: 'E1', pillar: 'earnings', text: 'Avg monthly turnover 260k', weight: 0.30 },
  { id: 'E2', pillar: 'earnings', text: '35%+ GP', weight: 0.30 },
  { id: 'E3', pillar: 'earnings', text: 'Drive turnover target', weight: 0.20 },
  { id: 'E4', pillar: 'earnings', text: 'Weekly income meeting', weight: 0.10 },
  { id: 'E5', pillar: 'earnings', text: 'Client meetings on other income', weight: 0.10 },
  { id: 'C1', pillar: 'compliance', text: 'Mandatory testing met', weight: 0.30 },
  { id: 'C2', pillar: 'compliance', text: 'Client meetings attended', weight: 0.30 },
  { id: 'C3', pillar: 'compliance', text: 'Nominee logbook sign-off', weight: 0.10 },
  { id: 'C4', pillar: 'compliance', text: 'Competency training up to date', weight: 0.05 },
  { id: 'C5', pillar: 'compliance', text: 'Job notes completed daily', weight: 0.05 },
  { id: 'C6', pillar: 'compliance', text: 'Team KPI requirements met', weight: 0.05 },
];
const robAnswers: Assessment[] = [
  ...['S1','S2','S3','S4','S5','S6','S7'].map(id => ({ criterionId: id, answer: 'Y' as const })),
  { criterionId: 'P1', answer: 'N' }, { criterionId: 'P2', answer: 'Y' }, { criterionId: 'P3', answer: 'Y' },
  { criterionId: 'P4', answer: 'Y' }, { criterionId: 'P5', answer: 'N' }, { criterionId: 'P6', answer: 'Y' },
  { criterionId: 'E1', answer: 'N' }, { criterionId: 'E2', answer: 'Y' }, { criterionId: 'E3', answer: 'Y' },
  { criterionId: 'E4', answer: 'Y' }, { criterionId: 'E5', answer: 'Y' },
  { criterionId: 'C1', answer: 'Y' }, { criterionId: 'C2', answer: 'N' }, { criterionId: 'C3', answer: 'Y' },
  { criterionId: 'C4', answer: 'Y' }, { criterionId: 'C5', answer: 'Y' }, { criterionId: 'C6', answer: 'Y' },
];

// ---- Janice (workbook: Safety 75%, People 80%, Earnings 100%, Compliance 100%, Overall 89%)
const janiceCriteria: Criterion[] = [
  { id: 'S1', pillar: 'safety', text: 'No LTI or MTI', weight: 0.25 },
  { id: 'S2', pillar: 'safety', text: 'Incidents reported', weight: 0.25 },
  { id: 'S3', pillar: 'safety', text: 'Fit for work', weight: 0.20 },
  { id: 'S4', pillar: 'safety', text: 'Test for dead', weight: 0.10 },
  { id: 'S5', pillar: 'safety', text: 'Daily risk assessments', weight: 0.10 },
  { id: 'S6', pillar: 'safety', text: 'PPE', weight: 0.10 },
  { id: 'P1', pillar: 'people', text: '2IC development', weight: 0.20 },
  { id: 'P2', pillar: 'people', text: '0 negative turnover', weight: 0.20 },
  { id: 'P3', pillar: 'people', text: 'Clients confident', weight: 0.10 },
  { id: 'P4', pillar: 'people', text: '95% trained', weight: 0.10 },
  { id: 'P5', pillar: 'people', text: 'High standard work', weight: 0.10 },
  { id: 'P6', pillar: 'people', text: 'Open communication', weight: 0.10 },
  { id: 'P7', pillar: 'people', text: 'Roster flexibility', weight: 0.10 },
  { id: 'P8', pillar: 'people', text: 'Neat appearance', weight: 0.10 },
  { id: 'E1', pillar: 'earnings', text: '200K/month', weight: 0.25 },
  { id: 'E2', pillar: 'earnings', text: '20% net', weight: 0.25 },
  { id: 'E3', pillar: 'earnings', text: 'Client meetings', weight: 0.25 },
  { id: 'E4', pillar: 'earnings', text: 'Rate reviews', weight: 0.08 },
  { id: 'E5', pillar: 'earnings', text: 'Labour hire roles', weight: 0.08 },
  { id: 'C1', pillar: 'compliance', text: 'Logbooks', weight: 0.25 },
  { id: 'C2', pillar: 'compliance', text: '0 breaches', weight: 0.25 },
  { id: 'C3', pillar: 'compliance', text: 'Client meetings', weight: 0.20 },
  { id: 'C4', pillar: 'compliance', text: 'Artik compliance', weight: 0.10 },
  { id: 'C5', pillar: 'compliance', text: 'Nominee sign-off', weight: 0.10 },
  { id: 'C6', pillar: 'compliance', text: 'Test sheets', weight: 0.10 },
];
const janiceAnswers: Assessment[] = [
  { criterionId: 'S1', answer: 'N' }, ...['S2','S3','S4','S5','S6'].map(id => ({ criterionId: id, answer: 'Y' as const })),
  { criterionId: 'P1', answer: 'Y' }, { criterionId: 'P2', answer: 'Y' }, { criterionId: 'P3', answer: 'Y' },
  { criterionId: 'P4', answer: 'N' }, { criterionId: 'P5', answer: 'N' }, { criterionId: 'P6', answer: 'Y' },
  { criterionId: 'P7', answer: 'Y' }, { criterionId: 'P8', answer: 'Y' },
  ...['E1','E2','E3','E4','E5','C1','C2','C3','C4','C5','C6'].map(id => ({ criterionId: id, answer: 'Y' as const })),
];

/** Equal-weight KPIs in one pillar, marked with the given answers. */
const pillarOf = (answers: Answer[]) => {
  const crit: Criterion[] = answers.map((_, i) => ({ id: `k${i}`, pillar: 'safety', text: '', weight: 1 }));
  const ans: Assessment[] = answers.map((a, i) => ({ criterionId: `k${i}`, answer: a }));
  return pillarScore(crit, ans, 'safety');
};
const rs = (safety: number | null, people: number | null, earnings: number | null, compliance: number | null): RoleScore => {
  const vals = [safety, people, earnings, compliance].filter((v): v is number => v !== null);
  return { pillars: { safety, people, earnings, compliance }, overall: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null };
};

describe('workbook cases (every KPI Y or N) still reproduce the Master Scorecard', () => {
  it('Rob', () => {
    const r = roleScore(robCriteria, robAnswers);
    expect(r.pillars.safety).toBeCloseTo(1.0, 10);
    expect(r.pillars.people).toBeCloseTo(0.65, 10);
    expect(r.pillars.earnings).toBeCloseTo(0.70, 10);
    // Source sheet shows 65% — its Compliance weights only sum to 85%, so 55/85 = 64.7%, displayed rounded.
    expect(Math.round(r.pillars.compliance! * 100)).toBe(65);
    expect(Math.round(r.overall! * 100)).toBe(75);
  });

  it('Janice', () => {
    const r = roleScore(janiceCriteria, janiceAnswers);
    expect(r.pillars.safety).toBeCloseTo(0.75, 10);
    expect(r.pillars.people).toBeCloseTo(0.80, 10);
    expect(r.pillars.earnings).toBeCloseTo(1.0, 10);
    expect(r.pillars.compliance).toBeCloseTo(1.0, 10);
    expect(Math.round(r.overall! * 100)).toBe(89);
  });
});

describe('NA rows are absences, not zeros (§3.2)', () => {
  it('NA drops out of both sides', () => {
    expect(pillarOf(['Y', 'NA'])).toBe(1);
  });

  it('a blank — nothing marked yet — is Pending, so it drops out too', () => {
    // The old rule kept blanks in the denominator and this scored 50%. An unmarked KPI must never drag a score down.
    expect(pillarOf(['Y', ''])).toBe(1);
  });

  it('Watch, Pending and Not tracked all score NA; only Not met scores N', () => {
    expect(['watch', 'pending', 'not_tracked'].map(answerFor)).toEqual(['NA', 'NA', 'NA']);
    expect(['confirmed', 'met', 'on_track'].map(answerFor)).toEqual(['Y', 'Y', 'Y']);
    expect(answerFor('not_met')).toBe('N');
  });

  it('worked example — Head of Operations, Earnings: Met, Not met, Met, Not tracked = 66.7%', () => {
    const v = pillarOf(['Y', 'N', 'Y', answerFor('not_tracked')]);
    expect(Math.round(v! * 1000) / 10).toBe(66.7);
  });

  it('a pillar where everything is NA has no score — null, not 0', () => {
    expect(pillarOf(['NA', '', 'NA'])).toBeNull();
    expect(pillarOf([])).toBeNull();
  });

  it('a template nobody has marked has no score anywhere', () => {
    const r = roleScore(robCriteria, []);
    expect(r.overall).toBeNull();
    expect(Object.values(r.pillars)).toEqual([null, null, null, null]);
  });
});

describe('role overall (§3.3)', () => {
  it('worked example — Head of Operations, September: (100 + 66.7 + 66.7 + 100) ÷ 4 = 83.3%', () => {
    const crit: Criterion[] = [
      ...['s1', 's2'].map(id => ({ id, pillar: 'safety' as const, text: '', weight: 1 })),
      ...['p1', 'p2', 'p3'].map(id => ({ id, pillar: 'people' as const, text: '', weight: 1 })),
      ...['e1', 'e2', 'e3'].map(id => ({ id, pillar: 'earnings' as const, text: '', weight: 1 })),
      ...['c1', 'c2'].map(id => ({ id, pillar: 'compliance' as const, text: '', weight: 1 })),
    ];
    const ans: Assessment[] = [
      { criterionId: 's1', answer: 'Y' }, { criterionId: 's2', answer: 'Y' },
      { criterionId: 'p1', answer: 'Y' }, { criterionId: 'p2', answer: 'Y' }, { criterionId: 'p3', answer: 'N' },
      { criterionId: 'e1', answer: 'Y' }, { criterionId: 'e2', answer: 'Y' }, { criterionId: 'e3', answer: 'N' },
      { criterionId: 'c1', answer: 'Y' }, { criterionId: 'c2', answer: 'Y' },
    ];
    expect(Math.round(roleScore(crit, ans).overall! * 1000) / 10).toBe(83.3);
  });

  it('an unscored pillar is left out of the mean, not counted as zero', () => {
    const crit: Criterion[] = [
      { id: 's', pillar: 'safety', text: '', weight: 1 },
      { id: 'p', pillar: 'people', text: '', weight: 1 },
      { id: 'e', pillar: 'earnings', text: '', weight: 1 },
      { id: 'c', pillar: 'compliance', text: '', weight: 1 },
    ];
    const r = roleScore(crit, [
      { criterionId: 's', answer: 'NA' }, { criterionId: 'p', answer: 'Y' },
      { criterionId: 'e', answer: 'Y' }, { criterionId: 'c', answer: 'N' },
    ]);
    expect(r.pillars.safety).toBeNull();
    expect(r.overall).toBeCloseTo(2 / 3, 10); // divided by three, not four
  });
});

describe('team roll-up (§3.4)', () => {
  it('averages Rob and Janice per pillar', () => {
    const t = teamScore([roleScore(robCriteria, robAnswers), roleScore(janiceCriteria, janiceAnswers)]);
    expect(t.pillars.safety).toBeCloseTo(0.875, 10);
    expect(t.pillars.people).toBeCloseTo(0.725, 10);
    expect(t.pillars.earnings).toBeCloseTo(0.85, 10);
    expect(Math.round(t.pillars.compliance! * 1000) / 10).toBe(82.4); // (64.7 + 100) / 2
  });

  it('team % is the mean of role %, not the mean of the pillar means', () => {
    const t = teamScore([rs(1, 1, 1, 1), rs(null, 0.4, 0.4, 0.4)]);
    expect(t.overall).toBeCloseTo(0.7, 10);  // (100 + 40) / 2
    expect(t.pillars.safety).toBe(1);        // only the person scored in Safety counts
  });

  it('people with no score are left out, not counted as zero', () => {
    const t = teamScore([rs(0.8, 0.8, 0.8, 0.8), rs(null, null, null, null)]);
    expect(t.overall).toBeCloseTo(0.8, 10);
  });

  it('a team where nobody is scored has no light at all', () => {
    const t = teamScore([rs(null, null, null, null)]);
    expect(t.overall).toBeNull();
    expect(band(t.overall)).toBe('pending');
    expect(teamScore([]).overall).toBeNull();
  });
});

describe('bands (§3.4)', () => {
  /*
    On track from 90%, Watch 75–89%, Behind under 75% — the same lines as the colour beside it.

    band() used to say on track only at 100% and behind only under 50%, while the COLOUR on the same
    card used 90 and 75. Both appear on one tile, so the tile contradicted itself: 95% was a GREEN
    card labelled "Watch", and 60% a RED card labelled "Watch". Two of those were live in front of
    customers. A card that disagrees with itself is not a scoring instrument.

    The money is a separate and LOWER line — lib/incentive deducts only under 50% for a quadrant —
    so a pillar at 60% reads Behind and costs nobody a payment. Kris settled both.
  */
  it('On track from 90% · Watch 75–89% · Behind under 75% · Pending no score', () => {
    expect(band(1)).toBe('on_track');
    expect(band(0.9)).toBe('on_track');
    expect(band(0.899)).toBe('watch');
    expect(band(0.75)).toBe('watch');
    expect(band(0.749)).toBe('behind');
    expect(band(0.5)).toBe('behind');     // red on the card, and still no deduction
    expect(band(0)).toBe('behind');
    expect(band(null)).toBe('pending');   // pending is never red
  });
});

describe('the 90% rule (§3.5)', () => {
  const good = rs(0.95, 0.92, 0.9, 0.91);
  const bad = rs(0.95, 0.92, 0.89, 0.91);
  it('needs every pillar at 90%+ for two consecutive closed months', () => {
    expect(isSpec([good])).toBe(false);
    expect(isSpec([bad, good])).toBe(false);
    expect(isSpec([good, good])).toBe(true);
    expect(isSpec([good, good, bad])).toBe(false);
  });

  it('an unscored month breaks the run rather than pausing it', () => {
    expect(isSpec([good, null, good])).toBe(false);
    expect(isSpec([good, rs(null, null, null, null), good])).toBe(false);
  });

  it('a pillar with no score does not qualify', () => {
    const noSafety = rs(null, 0.95, 0.95, 0.95);
    expect(isSpec([noSafety, noSafety])).toBe(false);
  });
});

describe('hard gates', () => {
  it('zero harm has no partial credit', () => {
    expect(gates({ lti: 0, mti: 0, psychosocial: 0, trainingCompliance: 1 })).toEqual({ zeroHarm: true, clearToWork: true });
    expect(gates({ lti: 0, mti: 1, psychosocial: 0, trainingCompliance: 1 }).zeroHarm).toBe(false);
  });
  it('clear to work requires 100% training compliance', () => {
    expect(gates({ lti: 0, mti: 0, psychosocial: 0, trainingCompliance: 0.99 }).clearToWork).toBe(false);
  });
});

describe('weight validation', () => {
  it('flags source-sheet pillars whose weights do not sum to 100%', () => {
    // Real finding from the Master Scorecard: Rob's Compliance sums to 85%, Janice's Earnings to 91%.
    // The engine normalises by decided weight so scores still match the sheet, but the product must enforce 100%.
    expect(validateWeights(robCriteria)).toEqual([{ pillar: 'compliance', total: 0.85 }]);
    expect(validateWeights(janiceCriteria)).toEqual([{ pillar: 'earnings', total: 0.91 }]);
  });
});
