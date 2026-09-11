import { describe, it, expect } from 'vitest';
import {
  clearToWork, onboarding, costOfVacancy, parseRatings, candidateScore,
  STAGES, HIRING_CHECKS, INTERVIEW_PROMPTS,
  type PersonRow, type Vacancy,
} from '../src/lib/people';
import { PILLARS } from '../src/lib/scoring';

const person = (over: Partial<PersonRow> = {}): PersonRow => ({
  roleId: 'r1', roleTitle: 'Site Supervisor', name: 'T. Alderson',
  placement: 'held', seated: true, blocking: [], overdue: [], ...over,
});

describe('clearToWork', () => {
  it('is clear when nothing on the role is blocking', () => {
    expect(clearToWork(person()).state).toBe('clear');
  });

  it('is blocked by a missed compliance measure, and names it', () => {
    const c = clearToWork(person({ blocking: ['Tickets current'] }));
    expect(c.state).toBe('blocked');
    expect(c.note).toContain('Tickets current');
    expect(c.note).toContain('pass or fail');
  });

  it('is blocked by overdue training too', () => {
    expect(clearToWork(person({ overdue: ['Clear to Work, end to end'] })).state).toBe('blocked');
  });

  // Assuming clear because nobody checked is the exact failure the gate exists to prevent.
  it('says not established rather than clear for somebody never invited', () => {
    const c = clearToWork(person({ seated: false }));
    expect(c.state).toBe('unknown');
    expect(c.note).toContain('not the same as clear');
  });

  it('has nothing to establish for a vacant role', () => {
    expect(clearToWork(person({ placement: 'vacant', name: null })).state).toBe('unknown');
  });
});

describe('onboarding', () => {
  it('runs in the order it actually happens', () => {
    const steps = onboarding(person(), true, true, true);
    expect(steps.map(s => s.key)).toEqual(['placed', 'seated', 'path', 'trained', 'signed']);
    expect(steps.every(s => s.done)).toBe(true);
  });

  it('reads each step from what the business did, not from a tick', () => {
    const steps = onboarding(person({ placement: 'pencilled', seated: false }), false, false, false);
    expect(steps.map(s => s.done)).toEqual([true, false, false, false, false]);
    expect(steps[0].note).toContain('Free, silent, and reversible');
    expect(steps[1].note).toContain('nothing is charged');
  });

  it('says a role with no path has nothing to complete rather than blaming the person', () => {
    expect(onboarding(person(), false, false, false)[2].note).toContain('nothing for them to complete');
  });

  it('keeps sign-off as a manager decision', () => {
    expect(onboarding(person(), true, true, false)[4].note).toContain('never something the bar awards itself');
  });
});

describe('costOfVacancy', () => {
  const vacancy = (over: Partial<Vacancy> = {}): Vacancy => ({
    roleId: 'r9', title: 'Yard Lead', scored: true, pillars: [], orphaned: 0, ...over,
  });

  // SPEC does not know what the work was worth, and a made-up figure would undermine the real ones.
  it('never puts a dollar figure on it', () => {
    const text = costOfVacancy(vacancy({ pillars: ['safety', 'people'], orphaned: 3 }));
    expect(text).not.toMatch(/[$£€]/);
    expect(text).not.toMatch(/\d+k/);
  });

  it('names what stops being measured', () => {
    expect(costOfVacancy(vacancy({ pillars: ['safety'] }))).toContain('Safety has nothing measuring it');
  });

  it('counts the roles left without a manager', () => {
    expect(costOfVacancy(vacancy({ orphaned: 3 }))).toContain('3 roles report into it with no direct manager');
  });

  it('says plainly when only the chart is missing it', () => {
    expect(costOfVacancy(vacancy({ scored: false }))).toContain('the chart is the only thing missing it');
  });
});

describe('ratings', () => {
  it('reads a well-formed rating', () => {
    expect(parseRatings('{"safety":4,"people":3}')).toEqual({ safety: 4, people: 3 });
  });

  it('drops anything out of range or the wrong shape', () => {
    expect(parseRatings('{"safety":9,"people":"x","earnings":0}')).toEqual({});
    expect(parseRatings('not json')).toEqual({});
    expect(parseRatings(null)).toEqual({});
    expect(parseRatings('[1,2,3]')).toEqual({});
  });

  it('rounds a fractional rating to the scale it is on', () => {
    expect(parseRatings('{"safety":3.6}')).toEqual({ safety: 4 });
  });
});

describe('candidateScore', () => {
  it('averages what was rated', () => {
    expect(candidateScore({ safety: 4, people: 3, earnings: 4, compliance: 5 })).toBe(4);
  });

  // An absence is not a low score — the same rule an unmarked KPI gets.
  it('leaves unrated pillars out rather than counting them as zero', () => {
    expect(candidateScore({ safety: 4 })).toBe(4);
    expect(candidateScore({})).toBeNull();
  });
});

describe('the fixed lists', () => {
  it('asks an interview question for every pillar', () => {
    for (const p of PILLARS) expect(INTERVIEW_PROMPTS[p]).toBeTruthy();
  });

  it('runs the stages from applied to placed, with a way to close one out', () => {
    expect(STAGES.map(s => s.key)).toEqual(['applied', 'screening', 'interview', 'offer', 'placed', 'declined']);
  });

  // Hardcoding one industry's licences and pay bands would make SPEC fit exactly one client.
  it('keeps the hiring checks generic rather than naming any industry', () => {
    const text = HIRING_CHECKS.map(c => `${c.label} ${c.note}`).join(' ');
    // Word-bounded: "answer" contains NSW, which is how a sloppy check like this passes for months.
    expect(text).not.toMatch(/\b(electrical|NSW|QLD|Fair Trading|TAFE|Seek|Indeed)\b/i);
    expect(HIRING_CHECKS.map(c => c.key)).toContain('right_to_work');
  });
});
