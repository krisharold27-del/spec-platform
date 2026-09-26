import { describe, it, expect } from 'vitest';
import {
  TYPES, typeInfo, isJobType, PROJECT_FROM_CENTS, suggest,
  STEPS, stepsFor, showsStep, PROJECT_ONLY, FILTERS, isFilter, matches, mix, typeOf,
} from '../src/lib/job-type';

describe('the type comes from the work kind SPEC already holds', () => {
  /*
    One copy of the answer. A second jobType column beside workKind would let a job be maintenance
    on the pipeline and a project on the billing screen, with nobody able to say which was right.
  */
  it('reads maintenance as maintenance', () => {
    expect(typeOf('maintenance')).toBe('maintenance');
  });

  it('reads a shutdown as a project, because the money works identically', () => {
    expect(typeOf('shutdown')).toBe('project');
    expect(typeOf('project')).toBe('project');
  });

  it('falls back to maintenance for a job that predates the field', () => {
    expect(typeOf(null)).toBe('maintenance');
    expect(typeOf(undefined)).toBe('maintenance');
  });
});

describe('two types, and the difference is how you get paid', () => {
  it('is two', () => {
    expect(TYPES).toHaveLength(2);
    expect(isJobType('maintenance')).toBe(true);
    expect(isJobType('project')).toBe(true);
    expect(isJobType('big')).toBe(false);
  });

  it('says how each is paid, which is the actual difference', () => {
    expect(typeInfo('maintenance').paid).toContain('same day');
    expect(typeInfo('project').paid).toContain('Security of Payment');
  });
});

describe('the type is suggested, never decided', () => {
  it('calls a tender a project whatever it is worth', () => {
    const s = suggest({ valueCents: 4_000_00, fromTender: true, fromTakeoff: false });
    expect(s.type).toBe('project');
    expect(s.because).toContain('tender');
  });

  it('calls work priced off plans a project', () => {
    expect(suggest({ valueCents: 4_000_00, fromTender: false, fromTakeoff: true }).type).toBe('project');
  });

  it('uses the threshold otherwise', () => {
    expect(suggest({ valueCents: PROJECT_FROM_CENTS, fromTender: false, fromTakeoff: false }).type).toBe('project');
    expect(suggest({ valueCents: PROJECT_FROM_CENTS - 1, fromTender: false, fromTakeoff: false }).type).toBe('maintenance');
  });

  it('gives a reason somebody can argue with', () => {
    /* The point of a reason: an estimator disagrees with the reasoning, not with a mystery. */
    for (const q of [
      { valueCents: 50_000_00, fromTender: false, fromTakeoff: false },
      { valueCents: 500_00, fromTender: false, fromTakeoff: false },
    ]) {
      expect(suggest(q).because.length).toBeGreaterThan(20);
    }
  });

  it('tells the estimator to change it when the threshold is the only reason', () => {
    expect(suggest({ valueCents: 60_000_00, fromTender: false, fromTakeoff: false }).because)
      .toContain('Change it if this one is not');
  });
});

describe('project-only steps appear only on projects', () => {
  /*
    The whole simplicity argument against SimPro in one rule. A sparkie doing a two-hour service
    call should never see a retention field.
  */
  it('keeps claims, variations, retention, defects and takeoff off maintenance', () => {
    for (const key of PROJECT_ONLY) {
      expect(showsStep('maintenance', key), key).toBe(false);
      expect(showsStep('project', key), key).toBe(true);
    }
  });

  it('gives maintenance the four steps that are just doing work', () => {
    expect(stepsFor('maintenance').map(s => s.key)).toEqual(['schedule', 'do', 'signoff', 'invoice']);
  });

  it('gives a project all nine', () => {
    expect(stepsFor('project')).toHaveLength(STEPS.length);
  });

  it('sends every step somewhere real', () => {
    for (const s of STEPS) expect(s.where, s.key).toMatch(/^\//);
  });
});

describe('the pipeline switch', () => {
  it('is All, Maintenance, Projects', () => {
    expect(FILTERS.map(f => f.key)).toEqual(['all', 'maintenance', 'project']);
    expect(isFilter('all')).toBe(true);
    expect(isFilter('nope')).toBe(false);
  });

  it('treats a job with no work kind as maintenance', () => {
    /* Every existing job predates the field, and the common case is the small quick one. */
    expect(matches({ workKind: null }, 'maintenance')).toBe(true);
    expect(matches({ workKind: null }, 'project')).toBe(false);
    expect(matches({ workKind: null }, 'all')).toBe(true);
  });
});

describe('what is on the books, split', () => {
  const rows = [
    { workKind: 'maintenance', valueCents: 5_000_00 },
    { workKind: 'project', valueCents: 220_000_00 },
    { workKind: 'shutdown', valueCents: 80_000_00 },
    { workKind: null, valueCents: 2_000_00 },
  ];

  it('counts each side', () => {
    const m = mix(rows);
    expect(m.maintenance).toEqual({ jobs: 2, cents: 7_000_00 });
    expect(m.project).toEqual({ jobs: 2, cents: 300_000_00 });
  });

  it('says why the two numbers mean different things', () => {
    /* One combined figure reads as cash that is coming and is not. */
    expect(mix(rows).says).toContain('lands this month');
    expect(mix(rows).says).toContain('as the work does');
  });

  it('says nothing rather than zero when there is nothing', () => {
    expect(mix([]).says).toBe('Nothing on the books yet.');
  });
});
