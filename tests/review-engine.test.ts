import { describe, it, expect } from 'vitest';
import templates from '../seed/criteria_templates.json';
import {
  tagTask, sortTask, score, rank, summarise, topAndBacklog, fitOf, bestMatch,
  BUCKET_LABEL, BUCKET_MEANING, KIND_MEANING,
  type Task, type Scored,
} from '../src/lib/tasks';
import { howBrief, briefText, effortOf } from '../src/lib/how-brief';
import { applyFocus } from '../src/lib/role-focus';

/*
  ── The engine, and the test the brief itself sets ───────────────────────────────────────────────

  The solar quoting build was the first instance, done by hand. This is the thing that finds the
  next hundred. Its acceptance criterion is written into the brief:

    "first run on JBI surfaces at least 10 credible automate/streamline candidates with a HOW, and
     the solar quote appears in the top three without being told about it."

  "Without being told" is the part worth being careful about. The engine is never handed "automate
  solar quoting". It is handed a business, its task lists, and the fact that one KPI is being missed
  — and it has to work out for itself that the quoting work is what to build first.
*/

type TemplateTask = { name: string; systems: string; critical: boolean; kpi?: string };
type TemplateRole = {
  template_id: string; title: string; level: string;
  criteria: Record<string, { text: string }[] | string>;
  tasks?: TemplateTask[];
};

const ROLES = templates.roles as unknown as TemplateRole[];

/** A JBI-shaped business, built the way provisioning builds one: from the shipped seed. */
function jbi(opts: { failing?: string[]; live?: string[] } = {}) {
  const failing = new Set(opts.failing ?? []);
  const tasks: Task[] = [];

  for (const role of ROLES) {
    const criteria: string[] = [];
    for (const list of Object.values(role.criteria)) {
      if (Array.isArray(list)) criteria.push(...list.map(c => c.text));
    }
    for (const t of role.tasks ?? []) {
      // Focus is applied exactly as the product applies it: JBI's Sales Supervisor sells Solar.
      const focus = role.template_id === 'sales_supervisor' ? 'Solar' : null;
      const kpiText = t.kpi && criteria.includes(t.kpi) ? applyFocus(t.kpi, focus) : null;
      tasks.push({
        id: `${role.template_id}:${t.name}`,
        name: applyFocus(t.name, focus),
        kind: tagTask(t.name).kind,
        systems: t.systems ? t.systems.split(',').filter(Boolean) : [],
        critical: t.critical,
        kpi: kpiText ? { text: kpiText, met: failing.has(kpiText) ? false : null } : null,
      });
    }
  }
  return tasks.map(t => score(t, opts.live ?? []));
}

/* The one KPI JBI is missing, in the words the product actually renders for them. */
const SOLAR_TURNAROUND = 'Solar quote turnaround within target';

describe('the acceptance test the brief sets', () => {
  /*
    Ten credible candidates. Not ten rows — ten things somebody could actually start on, each with a
    trigger, steps, guardrails and a size.
  */
  it('surfaces at least ten candidates, every one of them with a HOW', () => {
    const ranked = rank(jbi({ live: ['crm', 'job_management', 'financials'] }));
    expect(ranked.length).toBeGreaterThanOrEqual(10);

    for (const c of ranked.slice(0, 10)) {
      const b = howBrief(c);
      expect(b.trigger, c.name).toBeTruthy();
      expect(b.steps.length, c.name).toBeGreaterThanOrEqual(3);
      expect(b.guardrails.length, c.name).toBeGreaterThanOrEqual(2);
      expect(['small', 'medium', 'large'], c.name).toContain(b.effort);
    }
  });

  /*
    THE ONE THAT MATTERS. Nobody tells the engine about solar. It is told that a KPI is being missed
    — which is a fact off JBI's own scorecard — and the quoting work has to rise on its own.
  */
  it('puts the solar quote in the top three without being told about it', () => {
    const ranked = rank(jbi({
      failing: [SOLAR_TURNAROUND],
      live: ['crm', 'job_management'],
    }));
    const topThree = ranked.slice(0, 3).map(t => t.name);
    expect(
      topThree.some(n => /quote|roof|enquiry/i.test(n)),
      `top three were: ${topThree.join(' | ')}`,
    ).toBe(true);
  });

  /*
    And it must NOT do that when the KPI is fine.

    A ranking that puts quoting first whatever the numbers say is not reading the business, it is
    reading a hard-coded preference — which would pass the test above for the wrong reason and be
    worthless on the second customer.
  */
  it('does not favour quoting when nothing is failing', () => {
    const failing = rank(jbi({ failing: [SOLAR_TURNAROUND], live: ['crm', 'job_management'] }));
    const nothingFailing = rank(jbi({ live: ['crm', 'job_management'] }));
    expect(failing.map(t => t.name).slice(0, 3))
      .not.toEqual(nothingFailing.map(t => t.name).slice(0, 3));
  });
});

describe('what kind of work each task is', () => {
  it('reads the obvious ones the obvious way', () => {
    expect(tagTask('Chase timesheets that have not been submitted').kind).toBe('sequential');
    expect(tagTask('Walk sites and check the work').kind).toBe('judgement');
    expect(tagTask('Coach the apprentices').kind).toBe('judgement');
  });

  /*
    Mixed is the most valuable answer this makes, and the one a cruder tool gets wrong in both
    directions. A weekly site report is judgement (what did I see) wrapped in admin (finding the
    numbers, formatting it, chasing stragglers). Automate it whole and the observation — the only
    part worth having — is gone. Leave it alone and a supervisor does data entry on a Friday.
  */
  it('calls a judgement wrapped in admin what it is', () => {
    const t = tagTask('Walk the site and compile the weekly report');
    expect(t.kind).toBe('mixed');
    expect(t.why).toContain('Worth splitting');
  });

  /*
    And the corollary, which is the reason the seed data had to be corrected rather than the tagger
    loosened: "Compile the weekly site report" really is pure admin AS WRITTEN. The tagger reads
    words and there is no judgement in those ones.

    That was a fault in how the task had been written down, not in the reading of it — the seed said
    only the admin half of a supervisor's job out loud, and the engine would have moved the whole
    thing to the build queue and thrown away the observation. Two seed tasks were renamed to say the
    whole job. The lesson generalises: a task list that describes only the paperwork will get the
    paperwork's answer.
  */
  it('reads a task exactly as it was written down, for better or worse', () => {
    expect(tagTask('Compile the weekly site report').kind).toBe('sequential');
    expect(tagTask('Walk the site and compile the weekly report').kind).toBe('mixed');
  });

  /*
    And when it cannot read a description it leaves the work with the person, never with the queue.
    Wrong in that direction costs a leader one line to correct. Wrong the other way puts work nobody
    understood into a build.
  */
  it('leaves what it cannot read with the person who does it', () => {
    const t = tagTask('Handle the Thursday thing');
    expect(t.kind).toBe('judgement');
    expect(t.why).toContain('could not read');
  });
});

describe('the three buckets', () => {
  const t = (over: Partial<Task>): Task =>
    ({ id: 'x', name: 'Something', kind: 'sequential', systems: [], ...over });

  it('builds the whole thing only when everything it needs is connected', () => {
    const ready = sortTask(t({ systems: ['crm'] }), ['crm']);
    expect(ready.bucket).toBe('automate');
    expect(ready.needs).toEqual([]);
    expect(fitOf(t({ systems: ['crm'] }), ready)).toBe('high');
  });

  /*
    A missing connection is a BLOCKER, never a reason to hide the task. The brief: "still list it,
    mark 'needs [system] connected first,' don't hide it." A task nobody can see is a task nobody
    connects the system for.
  */
  it('still lists a task whose system is not connected, and says what it needs', () => {
    const blocked = sortTask(t({ systems: ['crm', 'financials'] }), ['crm']);
    expect(blocked.bucket).toBe('automate');
    expect(blocked.needs).toEqual(['financials']);
    expect(blocked.why).toContain('financials');
    expect(fitOf(t({ systems: ['crm', 'financials'] }), blocked)).toBe('medium');
  });

  it('takes the admin off a mixed task and leaves the thinking', () => {
    const s = sortTask(t({ kind: 'mixed' }), []);
    expect(s.bucket).toBe('streamline');
    expect(s.humanSignOff).toBe(true);
    expect(s.why).toContain('leave the thinking');
  });

  it('protects a judgement task and says it is the job', () => {
    const s = sortTask(t({ kind: 'judgement' }), []);
    expect(s.bucket).toBe('keep_human');
    expect(s.why).toContain('This is the job');
  });

  /*
    ── The override nothing outranks ──────────────────────────────────────────────────────────────

    "Compliance or safety-critical task → never fully automate. Best case is streamline with
    mandatory human sign-off, and the brief must say so."

    A perfectly sequential description with every system connected still does not get automated. The
    day a safety sign-off is produced by a process with nobody's name on it is the day SPEC has
    misunderstood its own Safety pillar.
  */
  it('NEVER fully automates safety or compliance, however sequential it looks', () => {
    const s = sortTask(t({ kind: 'sequential', critical: true, systems: ['safety'] }), ['safety']);
    expect(s.bucket).toBe('streamline');
    expect(s.humanSignOff).toBe(true);
    expect(s.why).toContain('never gets fully automated');

    // And the brief has to say so, in capitals, where somebody building it cannot miss it.
    const b = howBrief({ ...t({ critical: true, systems: ['safety'] }), ...s, fit: 'medium' } as Scored);
    expect(b.guardrails[0]).toContain('SAFETY OR COMPLIANCE');
    expect(b.guardrails[0]).toContain('never fully automated');
  });

  it('explains every bucket in plain words', () => {
    for (const b of ['automate', 'streamline', 'keep_human'] as const) {
      expect(BUCKET_LABEL[b]).toBeTruthy();
      expect(BUCKET_MEANING[b].length).toBeGreaterThan(30);
    }
    for (const k of ['sequential', 'judgement', 'mixed'] as const) {
      expect(KIND_MEANING[k].length).toBeGreaterThan(20);
    }
  });
});

describe('the order to do them in', () => {
  const t = (name: string, over: Partial<Task> = {}): Scored =>
    score({ id: name, name, kind: 'sequential', systems: [], ...over }, []);

  /*
    A failing KPI outranks a bigger time saving, and that is a deliberate inversion of what most
    tools do. Ten hours a week on a KPI the business is hitting is ten hours of something that
    works. Two hours on a KPI nobody can meet is the promise the business is currently breaking.
  */
  it('puts a failing KPI above a bigger saving', () => {
    const ranked = rank([
      t('Big saving, KPI fine', { hoursPerWeek: 10, kpi: { text: 'A', met: true } }),
      t('Small saving, KPI failing', { hoursPerWeek: 2, kpi: { text: 'B', met: false } }),
    ]);
    expect(ranked[0].name).toBe('Small saving, KPI failing');
  });

  it('then hours, then pain', () => {
    const ranked = rank([
      t('Painful', { hoursPerWeek: 3, pain: 5 }),
      t('Long', { hoursPerWeek: 9 }),
      t('Neither', {}),
    ]);
    expect(ranked.map(r => r.name)).toEqual(['Long', 'Painful', 'Neither']);
  });

  /* Nothing to queue means nothing to rank. Keep-human work is listed, never ordered for building. */
  it('never puts a person\'s job in the build order', () => {
    const ranked = rank([t('Walk the site', { kind: 'judgement' }), t('Send the quote')]);
    expect(ranked.map(r => r.name)).toEqual(['Send the quote']);
  });

  it('does not reshuffle itself on reload when everything ties', () => {
    const once = rank([t('Beta'), t('Alpha'), t('Gamma')]).map(r => r.name);
    const twice = rank([t('Gamma'), t('Beta'), t('Alpha')]).map(r => r.name);
    expect(once).toEqual(twice);
  });

  it('leads with ten and keeps the rest as a backlog rather than hiding it', () => {
    const many = Array.from({ length: 14 }, (_, i) => t(`Task ${String(i).padStart(2, '0')}`));
    const { top, backlog } = topAndBacklog(rank(many));
    expect(top).toHaveLength(10);
    expect(backlog).toHaveLength(4);
  });
});

describe('what it refuses to claim', () => {
  const t = (name: string, over: Partial<Task> = {}): Scored =>
    score({ id: name, name, kind: 'sequential', systems: [], ...over }, []);

  /*
    "The engine never invents a KPI target or a cost saving. If it doesn't have the number, it says
    so." Same rule as the savings figure on the role review, for the same reason: this is the number
    a leader repeats to a board.
  */
  it('counts only hours somebody actually stated, and says how many it could not', () => {
    const s = summarise(3, [t('Counted', { hoursPerWeek: 4 }), t('Not counted'), t('Also not')]);
    expect(s.sequentialHoursPerWeek).toBe(4);
    expect(s.uncounted).toBe(2);
    expect(s.line).toContain('4 hours a week');
    expect(s.line).toContain('1 of 3');
  });

  it('says plainly when nobody has counted anything at all', () => {
    const s = summarise(2, [t('A'), t('B')]);
    expect(s.sequentialHoursPerWeek).toBe(0);
    expect(s.line).toContain('Nobody has said how long any of them take');
    expect(s.line, 'and no figure is offered').not.toMatch(/\d+ hours/);
  });

  it('never predicts how much a KPI will improve', () => {
    const b = howBrief(t('Send the quote', { kpi: { text: 'Turnaround within 1 day', met: false } }));
    expect(b.moves).toContain('Turnaround within 1 day');
    expect(b.moves).toContain('NOT being met');
    expect(b.moves, 'no invented percentage').not.toMatch(/\d+\s*%/);
  });

  /* A task whose KPI has never been scored is not a task whose KPI is fine. */
  it('keeps "not scored yet" separate from "being met"', () => {
    const b = howBrief(t('Send the quote', { kpi: { text: 'Turnaround', met: null } }));
    expect(b.moves).toContain('not scored yet');
  });
});

describe('the build brief somebody pastes into Claude Code', () => {
  const t = score({
    id: 'x', name: 'Send the customer their quote', kind: 'sequential',
    systems: ['crm'], kpi: { text: 'Turnaround within 1 day', met: false },
  }, ['crm']);

  it('carries everything a build needs, in the shape the solar brief used', () => {
    const text = briefText(howBrief(t));
    for (const heading of ['## Trigger', '## Steps', '## Systems touched', '## Guardrails']) {
      expect(text, heading).toContain(heading);
    }
    expect(text).toContain('# Send the customer their quote');
    expect(text).toContain('Turnaround within 1 day');
  });

  /*
    The step the solar brief would not go without, and it is not boilerplate: "Any step failing after
    the lead is created → the lead still exists... Never silently drop an enquiry."
  */
  it('never lets a build drop something quietly', () => {
    const text = briefText(howBrief(t));
    expect(text).toContain('Never drop it quietly');
  });

  it('sizes the work by what it touches rather than by a day count nobody could defend', () => {
    expect(effortOf(score({ id: 'a', name: 'a', kind: 'sequential', systems: ['crm'] }, ['crm']))).toBe('small');
    expect(effortOf(score({ id: 'b', name: 'b', kind: 'sequential', systems: ['crm', 'financials'] }, ['crm', 'financials']))).toBe('medium');
    expect(effortOf(score({ id: 'c', name: 'c', kind: 'sequential', systems: ['crm', 'financials', 'payroll', 'safety'] }, []))).toBe('large');
  });

  /* A missing connection counts toward the size, because connecting it IS part of the work. */
  it('counts an unconnected system as part of the job, not as free', () => {
    const connected = effortOf(score({ id: 'd', name: 'd', kind: 'sequential', systems: ['crm'] }, ['crm']));
    const not = effortOf(score({ id: 'e', name: 'e', kind: 'sequential', systems: ['crm', 'payroll'] }, []));
    expect(connected).toBe('small');
    expect(not).not.toBe('small');
  });
});

describe('the intake box', () => {
  const tasks = [
    { id: '1', name: 'Chase timesheets that have not been submitted' },
    { id: '2', name: 'Compile the monthly board pack' },
    { id: '3', name: 'Walk sites and check the work' },
  ];

  /* Somebody writes "chasing"; the task says "Chase". The box has to see through that. */
  it('matches a complaint to the work it is about, through ordinary word endings', () => {
    expect(bestMatch('I spend Friday afternoons chasing timesheets', tasks)).toBe('1');
    expect(bestMatch('I want the board pack to build itself', tasks)).toBe('2');
    expect(bestMatch('the site walks take all morning', tasks)).toBe('3');
  });

  /*
    One shared word is a coincidence. "Report", "job" and "site" appear in half the task list of a
    trade business, and matching on one would quietly file every complaint under the same heading —
    which looks like the box is working and means nobody's problem is ever read.
  */
  it('will not match on a single shared word', () => {
    expect(bestMatch('The site is a mess', tasks)).toBeNull();
    expect(bestMatch('Something completely unrelated to anything', tasks)).toBeNull();
  });

  it('matches nothing when there is nothing to match against', () => {
    expect(bestMatch('Anything at all', [])).toBeNull();
    expect(bestMatch('', tasks)).toBeNull();
  });
});
