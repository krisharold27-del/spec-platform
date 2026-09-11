import { describe, it, expect } from 'vitest';
import {
  light, pillarNote, whatNeedsMe, changesToKnowAbout, answerFor, clearToWork, ASK_PROMPTS,
  type TodoInputs, type ChangeInputs, type AskInputs,
} from '../src/lib/today';
import type { ScorecardRow } from '../src/lib/queries';
import type { Pillar, RoleScore } from '../src/lib/scoring';

const row = (over: Partial<ScorecardRow> & { pillar: Pillar; text: string }): ScorecardRow => ({
  criterionId: over.text.replace(/\W+/g, '-').toLowerCase(),
  weight: 0.5, kpi: true, target: null, answer: '', note: null, status: null, result: null, source: null,
  ...over,
});

const score = (p: Partial<Record<Pillar, number | null>>, overall: number | null = null): RoleScore => ({
  pillars: { safety: null, people: null, earnings: null, compliance: null, ...p },
  overall,
});

const todo = (over: Partial<TodoInputs> = {}): TodoInputs => ({
  myRoleId: 'r1', myRows: [], reports: [], meetingLogged: true, brokenConnections: [], canManage: true, ...over,
});

describe('light — the 90% rule as a traffic light', () => {
  it('is green at the standard and above', () => {
    expect(light(0.9)).toBe('green');
    expect(light(1)).toBe('green');
  });

  it('is amber close to it and red below', () => {
    expect(light(0.89)).toBe('amber');
    expect(light(0.75)).toBe('amber');
    expect(light(0.749)).toBe('red');
    expect(light(0)).toBe('red');
  });

  // The rule that matters most on this page: not-measured-yet is not doing-badly.
  it('has no light at all when there is no score, and never a red', () => {
    expect(light(null)).toBe('pending');
    expect(light(null)).not.toBe('red');
  });

  it('takes a different standard when one is passed', () => {
    expect(light(0.8, 0.8)).toBe('green');
  });
});

describe('pillarNote', () => {
  it('says so when the pillar has no KPIs', () => {
    expect(pillarNote([], 'safety')).toMatch(/No KPIs set/);
  });

  it('counts only decided rows, and says what is still unmarked', () => {
    const rows = [
      row({ pillar: 'safety', text: 'Inspections done', answer: 'Y' }),
      row({ pillar: 'safety', text: 'Actions closed', answer: 'N' }),
      row({ pillar: 'safety', text: 'Toolbox talks', answer: '' }),
    ];
    expect(pillarNote(rows, 'safety')).toBe('1 of 2 KPIs met. 1 still to mark — excluded from the score.');
  });

  it('reassures rather than alarms when nothing is marked', () => {
    const rows = [row({ pillar: 'people', text: 'One-to-ones held' })];
    expect(pillarNote(rows, 'people')).toMatch(/none marked yet. Nothing is counted against you/);
  });
});

describe('whatNeedsMe', () => {
  it('is empty when the month is in order', () => {
    expect(whatNeedsMe(todo())).toEqual([]);
  });

  it('leads with a compliance miss, because it is a hard gate', () => {
    const items = whatNeedsMe(todo({
      myRows: [
        row({ pillar: 'earnings', text: 'Margin against quote', answer: 'N' }),
        row({ pillar: 'compliance', text: 'Tickets current', answer: 'N' }),
      ],
    }));
    expect(items[0].pillar).toBe('compliance');
    expect(items[0].meta).toMatch(/hard gate/);
  });

  it('asks for a note on an unexplained miss, and stays quiet once one is written', () => {
    const miss = { pillar: 'earnings' as Pillar, text: 'Margin against quote', answer: 'N' as const };
    expect(whatNeedsMe(todo({ myRows: [row(miss)] }))).toHaveLength(1);
    expect(whatNeedsMe(todo({ myRows: [row({ ...miss, note: 'Two jobs repriced.' })] }))).toHaveLength(0);
  });

  // One item per pillar, in Safety-People-Earnings-Compliance order however the rows arrived.
  it('groups unmarked KPIs into one item per pillar, in pillar order', () => {
    const items = whatNeedsMe(todo({
      myRows: [
        row({ pillar: 'people', text: 'One-to-ones held' }),
        row({ pillar: 'people', text: 'Turnover' }),
        row({ pillar: 'safety', text: 'Inspections done' }),
      ],
    }));
    expect(items.map(i => i.label)).toEqual([
      'Mark 1 number against Safety',
      'Mark 2 numbers against People',
    ]);
  });

  // A readonly seat cannot mark anything, so a list telling them to would be noise.
  it('gives a readonly seat nothing it cannot act on', () => {
    const input = todo({
      canManage: false,
      myRows: [row({ pillar: 'people', text: 'One-to-ones held' })],
      reports: [{ roleId: 'r2', title: 'Scheduler', holder: null, rows: [], score: score({}) }],
    });
    expect(whatNeedsMe(input)).toEqual([]);
  });

  it('names an unscored report, by person where there is one and by role where there is not', () => {
    const items = whatNeedsMe(todo({
      reports: [
        { roleId: 'r2', title: 'Scheduler', holder: 'A. Kaur', rows: [], score: score({}) },
        { roleId: 'r3', title: 'Yard Lead', holder: null, rows: [], score: score({}) },
        { roleId: 'r4', title: 'Supervisor', holder: 'D. W.', rows: [], score: score({ safety: 1 }, 1) },
      ],
    }));
    expect(items.map(i => i.label)).toEqual([
      'Go through the month with A. Kaur',
      'Yard Lead has nobody in it — its month cannot be scored',
    ]);
  });

  it('always points somewhere the work is actually done', () => {
    const items = whatNeedsMe(todo({
      meetingLogged: false,
      myRows: [row({ pillar: 'compliance', text: 'Tickets current', answer: 'N' })],
      brokenConnections: [{ id: 'c1', category: 'Financials' }],
    }));
    expect(items.length).toBe(3);
    for (const i of items) expect(i.href).toMatch(/^\//);
  });
});

describe('changesToKnowAbout', () => {
  const base = (over: Partial<ChangeInputs> = {}): ChangeInputs => ({
    myRoleId: 'r1', renegotiated: [], vacantReports: [], complianceMisses: [], pendingConnections: [], ...over,
  });

  it('reports nothing when nothing moved', () => {
    expect(changesToKnowAbout(base())).toEqual([]);
  });

  it('shows a renegotiated target with both numbers, because the negotiation is kept', () => {
    const [c] = changesToKnowAbout(base({
      renegotiated: [{ criterionId: 'c1', text: 'Margin against quote', proposedTarget: '30%', target: '32%' }],
    }));
    expect(c.kind).toBe('KPI change');
    expect(c.title).toContain('32%');
    expect(c.body).toContain('30%');
  });

  it('says a vacant report is left out of the average rather than counted as zero', () => {
    const [c] = changesToKnowAbout(base({ vacantReports: [{ roleId: 'r9', title: 'Yard Lead' }] }));
    expect(c.body).toMatch(/left out of your team average rather than counted as a zero/);
  });

  it('collapses compliance misses into one gate item naming each of them', () => {
    const items = changesToKnowAbout(base({
      complianceMisses: [
        row({ pillar: 'compliance', text: 'Tickets current', answer: 'N' }),
        row({ pillar: 'compliance', text: 'Inductions complete', answer: 'N' }),
      ],
    }));
    expect(items).toHaveLength(1);
    expect(items[0].title).toMatch(/^2 things/);
    expect(items[0].body).toContain('Tickets current; Inductions complete');
  });

  it('describes a system that is not connected as a permanent mode, not a downgrade', () => {
    const [c] = changesToKnowAbout(base({
      pendingConnections: [{ id: 's1', category: 'Safety and compliance', status: 'requested' }],
    }));
    expect(c.body).toMatch(/not a downgrade/);
  });
});

describe('answerFor', () => {
  const ask = (over: Partial<AskInputs> = {}): AskInputs => ({
    rows: [], score: score({}), reports: [], meetingLogged: false, ...over,
  });

  it('treats a blank month as blank, not bad', () => {
    const a = answerFor(ASK_PROMPTS[0], ask());
    expect(a.text).toMatch(/blank month, not a bad one/);
  });

  it('names the pillar furthest from 90% and the size of the gap', () => {
    const a = answerFor(ASK_PROMPTS[0], ask({
      score: score({ safety: 0.96, people: 0.72, earnings: 0.89 }, 0.85),
      rows: [row({ pillar: 'people', text: 'One-to-ones held', answer: 'N' })],
    }));
    expect(a.source).toBe('People, this month');
    expect(a.text).toContain('72%');
    expect(a.text).toContain('18 points under');
  });

  it('says so when the lowest pillar is already at the standard', () => {
    const a = answerFor(ASK_PROMPTS[0], ask({ score: score({ safety: 0.96, people: 0.94 }, 0.95) }));
    expect(a.text).toMatch(/^None\./);
  });

  it('builds the meeting list from the pillars under 90% and the unexplained misses', () => {
    const a = answerFor(ASK_PROMPTS[1], ask({
      score: score({ safety: 0.96, earnings: 0.82 }, 0.89),
      rows: [row({ pillar: 'earnings', text: 'Margin against quote', answer: 'N' })],
    }));
    expect(a.text).toContain('Earnings at 82%');
    expect(a.text).not.toContain('Safety');
    expect(a.text).toContain('1 miss');
    expect(a.text).toContain('not logged yet');
  });

  it('answers clear-to-work from the compliance rows', () => {
    expect(answerFor(ASK_PROMPTS[2], ask()).text).toMatch(/Nothing on your own card/);
    const a = answerFor(ASK_PROMPTS[2], ask({
      rows: [row({ pillar: 'compliance', text: 'Tickets current', answer: 'N' })],
    }));
    expect(a.text).toContain('Tickets current');
    expect(a.text).toMatch(/no partial credit/);
  });

  it('does not pretend to answer a question it was not asked', () => {
    const a = answerFor('what is our revenue', ask());
    expect(a.text).toMatch(/without sending anything anywhere/);
  });
});

describe('clearToWork', () => {
  it('reads only the compliance pillar', () => {
    const lines = clearToWork([
      row({ pillar: 'safety', text: 'Inspections done', answer: 'Y' }),
      row({ pillar: 'compliance', text: 'Tickets current', answer: 'Y', status: 'confirmed' }),
    ]);
    expect(lines.map(l => l.name)).toEqual(['Tickets current']);
    expect(lines[0].status).toBe('Confirmed');
    expect(lines[0].light).toBe('green');
  });

  it('shows an unmarked row as pending, never red', () => {
    const [l] = clearToWork([row({ pillar: 'compliance', text: 'Inductions complete' })]);
    expect(l.light).toBe('pending');
    expect(l.status).toBe('Pending');
  });

  it('prefers the note that was written over the status help text', () => {
    const [l] = clearToWork([
      row({ pillar: 'compliance', text: 'Tickets current', answer: 'N', status: 'not_met', note: 'Two renewals booked.' }),
    ]);
    expect(l.note).toBe('Two renewals booked.');
    expect(l.light).toBe('red');
  });
});
