/**
 * These tests reproduce the numbers in SPEC_Master_Scorecard_Professional (snapshot 2025-03-05).
 * If the engine ever disagrees with the workbook, the engine is wrong.
 */
import { describe, it, expect } from 'vitest';
import {
  pillarScore, roleScore, teamScore, isSpec, gates, validateWeights,
  type Criterion, type Assessment, type RoleScore,
} from '../src/lib/scoring';

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

describe('pillar and role scores reproduce the Master Scorecard', () => {
  it('Rob', () => {
    const r = roleScore(robCriteria, robAnswers);
    expect(r.pillars.safety).toBe(1.0);
    expect(r.pillars.people).toBe(0.65);
    expect(r.pillars.earnings).toBe(0.70);
    // Source sheet shows 65% — its Compliance weights only sum to 85%, so 55/85 = 64.7%, displayed rounded.
    expect(Math.round(r.pillars.compliance * 100)).toBe(65);
    expect(Math.round(r.overall * 100)).toBe(75);
  });

  it('Janice', () => {
    const r = roleScore(janiceCriteria, janiceAnswers);
    expect(r.pillars.safety).toBe(0.75);
    expect(r.pillars.people).toBe(0.80);
    expect(r.pillars.earnings).toBe(1.0);
    expect(r.pillars.compliance).toBe(1.0);
    expect(Math.round(r.overall * 100)).toBe(89);
  });

  it('unanswered template scores 0, not an error (August 2026 board output case)', () => {
    const r = roleScore(robCriteria, []);
    expect(r.overall).toBe(0);
  });

  it('NA drops out of the denominator', () => {
    const crit: Criterion[] = [
      { id: 'a', pillar: 'safety', text: '', weight: 0.5 },
      { id: 'b', pillar: 'safety', text: '', weight: 0.5 },
    ];
    expect(pillarScore(crit, [{ criterionId: 'a', answer: 'Y' }, { criterionId: 'b', answer: 'NA' }], 'safety')).toBe(1);
  });
});

describe('team rollup', () => {
  it('averages Rob and Janice per pillar', () => {
    const t = teamScore([roleScore(robCriteria, robAnswers), roleScore(janiceCriteria, janiceAnswers)]);
    expect(t.pillars.safety).toBe(0.875);
    expect(t.pillars.people).toBe(0.725);
    expect(t.pillars.earnings).toBe(0.85);
    expect(Math.round(t.pillars.compliance * 1000) / 10).toBe(82.4); // (64.7 + 100) / 2
  });
});

describe('the 90% rule', () => {
  const good: RoleScore = { pillars: { safety: 0.95, people: 0.92, earnings: 0.9, compliance: 0.91 }, overall: 0.92 };
  const bad: RoleScore = { pillars: { safety: 0.95, people: 0.92, earnings: 0.89, compliance: 0.91 }, overall: 0.92 };
  it('needs two consecutive months', () => {
    expect(isSpec([good])).toBe(false);
    expect(isSpec([bad, good])).toBe(false);
    expect(isSpec([good, good])).toBe(true);
    expect(isSpec([good, good, bad])).toBe(false);
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
    // The engine normalises by applicable weight so scores still match the sheet, but the product must enforce 100%.
    expect(validateWeights(robCriteria)).toEqual([{ pillar: 'compliance', total: 0.85 }]);
    expect(validateWeights(janiceCriteria)).toEqual([{ pillar: 'earnings', total: 0.91 }]);
  });
});
