import { describe, it, expect } from 'vitest';
import {
  assess, beyondHuman, duration, reviewRole, saving,
  mayReadAutomationReview, VERDICT_MEANING, VERDICT_LABEL, VERDICT_ORDER,
  type Measure,
} from '../src/lib/automation';
import { applyFocus, focusedTitle, needsFocus } from '../src/lib/role-focus';

/*
  ── The role review, and the case it was built from ──────────────────────────────────────────────

  JBI Electrical, September 2026. Solar quote turnaround was running at four days. The SPEC standard
  is one day. The team said one day was not achievable by a person — and they were right, which is
  the entire point. The role was not backfilled; the quoting became a coded process and the people
  kept the site visits and the closing.

  Kris called this "a key for this entire system", so the rules are held to here rather than left to
  read well in a comment.
*/

const m = (text: string, over: Partial<Measure> = {}): Measure =>
  ({ text, pillar: 'earnings', kpi: true, ...over });

describe('the standard a person cannot reach', () => {
  /*
    The trigger, in its original form. Not "this looks tedious" — a number the business already
    agreed to, which somebody then cannot hit at the cadence it asks for.
  */
  it('recognises the JBI case: four days against a one-day standard', () => {
    expect(beyondHuman('1 day', '4 days')).toBe(true);

    const a = assess(m('Solar quote turnaround within target', { target: '1 day' }), { actual: '4 days' });
    expect(a.verdict).toBe('automated');
    expect(a.why).toContain('1 day');
    expect(a.why).toContain('4 days');
    expect(a.why, 'it must not read as the team not trying').toMatch(/not a person trying harder/);
  });

  /*
    A near miss is a different situation and must not trigger this. Somebody at two days against a
    one-day standard can be helped to reach it, and telling a leader to replace that with software
    would be both wrong and expensive.
  */
  it('does not fire on a near miss', () => {
    expect(beyondHuman('1 day', '1.5 days')).toBe(false);
    expect(beyondHuman('2 days', '3 days')).toBe(false);
  });

  /* Missing by a multiple is the signal. Exactly double counts — that is a different way of working. */
  it('fires at a multiple, not a margin', () => {
    expect(beyondHuman('1 day', '2 days')).toBe(true);
    expect(beyondHuman('4 hours', '3 days')).toBe(true);
  });

  /*
    And when there is nothing to compare it says so. Null must never be read as "a person manages
    fine" — that is the silent-failure shape this whole codebase keeps stamping out.
  */
  it('says it cannot tell rather than saying everything is fine', () => {
    expect(beyondHuman(null, '4 days')).toBeNull();
    expect(beyondHuman('1 day', null)).toBeNull();
    expect(beyondHuman('80%', '65%'), 'not a duration at all').toBeNull();
  });

  it('reads the handful of ways a business writes a turnaround', () => {
    expect(duration('1 day')).toBe(8);
    expect(duration('2 days')).toBe(16);
    expect(duration('24 hrs')).toBe(24);
    expect(duration('same-day')).toBe(8);
    expect(duration('30 minutes')).toBe(0.5);
    expect(duration('1 week')).toBe(40);
    expect(duration('above target')).toBeNull();
  });
});

describe('what a process can and cannot take', () => {
  /*
    The line that matters most, and the one worth being hardest on: a measure about somebody being
    accountable stays with a person EVEN WHEN the number behind it arrives automatically. Gathering
    the figure and owning the decision are different jobs, and conflating them is how a business
    automates away the part that was holding it together.
  */
  it('keeps judgement with a person even when the number is automatic', () => {
    const a = assess(m('Supervisors signed off as genuinely capable', { pillar: 'people', fedBySystem: true }));
    expect(a.verdict).toBe('person');
    expect(a.why).toContain('their name on it');
  });

  it('keeps relationships and leadership with a person', () => {
    for (const text of [
      'One-to-ones held with every direct report',
      'Open, honest communication — safe to raise issues',
      'Team trained, confident and capable for their tasks',
      'Client visits completed',
    ]) {
      expect(assess(m(text, { pillar: 'people' })).verdict, text).toBe('person');
    }
  });

  /*
    `automated` is only ever earned on a FACT — the data already arrives from a connected system —
    never on the wording alone. Clerical-sounding work with nothing feeding it is `assisted`, which
    is an honest "worth doing, not yet possible".
  */
  it('will not call something automated on the strength of its wording', () => {
    const notFed = assess(m('Every enquiry logged in the client system and the job system'));
    expect(notFed.verdict).toBe('assisted');
    expect(notFed.why).toContain('nothing feeds it yet');

    const fed = assess(m('Every enquiry logged in the client system and the job system', { fedBySystem: true }));
    expect(fed.verdict).toBe('automated');
  });

  /* And it shrugs rather than guessing. An `unknown` a leader can act on beats a confident wrong. */
  it('says it cannot tell when it cannot tell', () => {
    const a = assess(m('Business unit performing to plan'));
    expect(a.verdict).toBe('unknown');
    expect(a.why).toContain('Somebody who does the job should say');
  });

  it('gives every verdict a reason, and every verdict a meaning in plain words', () => {
    for (const text of ['Timesheet submitted daily', 'One-to-ones held', 'Something vague']) {
      expect(assess(m(text)).why.length, text).toBeGreaterThan(20);
    }
    for (const v of VERDICT_ORDER) {
      expect(VERDICT_MEANING[v], v).toBeTruthy();
      expect(VERDICT_LABEL[v], v).toBeTruthy();
    }
  });
});

describe('the whole role', () => {
  /*
    The sentence that ends up being read as "we do not need to replace them". It is deliberately the
    hardest thing in the file to earn: one `unknown` means SPEC has not actually looked at part of
    the job, and a role should never be called absorbable on a partial reading.
  */
  it('will not call a role absorbable while any part of it is unread', () => {
    const r = reviewRole('Quoting Clerk', [
      m('Timesheet submitted daily', { fedBySystem: true }),
      m('Quotes issued within target', { fedBySystem: true }),
      m('Something nobody has described properly'),
    ]);
    expect(r.counts.unknown).toBe(1);
    expect(r.everyMeasureCouldMove).toBe(false);
    expect(r.headline).toContain('need somebody to look');
  });

  it('will not call a role absorbable while any part of it needs a person', () => {
    const r = reviewRole('Sales Supervisor', [
      m('Quotes issued within target', { fedBySystem: true }),
      m('Team trained, confident and capable', { pillar: 'people' }),
    ]);
    expect(r.everyMeasureCouldMove).toBe(false);
    expect(r.headline).toMatch(/could come off a person's plate/);
    expect(r.headline, 'and it says plainly what must not move').toMatch(/should not/);
  });

  /*
    And when everything measured could move, it says THAT — not the thing it is tempting to say.

    The engine brief is explicit: "Never insult the owner or the people. The output is 'here's the
    drudge we can take off your team,' not 'here's who's redundant'" and "No suggestion is ever
    phrased as a headcount reduction." The first version of this headline read "worth deciding
    whether this is a role or a system", which is the forbidden sentence wearing a suit.

    What is actually true is narrower: every measure ON THE CARD could move. A scorecard is not a
    job — the judgement, the relationships and the hundred things nobody wrote down are not on it.
  */
  it('says everything measured could move, and never says the role could go', () => {
    const r = reviewRole('Quote Preparation', [
      m('Quotes issued within target', { fedBySystem: true }),
      m('Every enquiry logged in both systems', { fedBySystem: true }),
    ]);
    expect(r.everyMeasureCouldMove).toBe(true);
    expect(r.headline).toContain('drudge a process could take on');
    expect(r.headline).toContain('time back');
    for (const forbidden of ['redundant', 'headcount', 'role or a system', 'replace', 'not need']) {
      expect(r.headline.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });

  /* No headline anywhere may reach for that language, whatever the mix of verdicts. */
  it('never phrases anything as a headcount reduction', () => {
    const mixes = [
      [m('Quotes issued within target', { fedBySystem: true })],
      [m('One-to-ones held', { pillar: 'people' })],
      [m('Quotes issued', { fedBySystem: true }), m('One-to-ones held', { pillar: 'people' })],
      [m('Something vague')],
      [m('Quotes issued', { fedBySystem: true }), m('Something vague')],
    ];
    for (const measures of mixes) {
      const h = reviewRole('Some Role', measures).headline.toLowerCase();
      for (const forbidden of ['redundant', 'headcount', 'replace', 'cut', 'surplus', 'no longer need']) {
        expect(h, `${forbidden} in "${h}"`).not.toContain(forbidden);
      }
    }
  });

  /*
    The other half of the principle, and the half that matters to the 40 people who are NOT being
    automated: a role a process cannot absorb is confirmed as a real job, in as many words.
  */
  it('confirms a real job as a real job', () => {
    const r = reviewRole('Site Supervisor', [
      m('Zero incidents on my sites', { pillar: 'safety' }),
      m('Team trained, confident and capable', { pillar: 'people' }),
      m('One-to-ones held', { pillar: 'people' }),
    ]);
    expect(r.counts.person).toBe(3);
    expect(r.headline).toContain("is a person's job from end to end");
    expect(r.headline).toContain('Nothing here should be automated');
  });

  it('has nothing to say about a role with nothing measured', () => {
    expect(reviewRole('New role', []).headline).toContain('nothing to assess');
    expect(reviewRole('New role', []).everyMeasureCouldMove).toBe(false);
  });
});

describe('what it is worth, and what it refuses to claim', () => {
  /*
    The most dangerous number in the product.

    A savings figure is the one a leader repeats to a board, and the one that makes every other
    number here untrustworthy the day somebody checks it. So hours are only ever counted where the
    business has SAID how many hours something takes. An honest small number beats an impressive one
    nobody can stand behind.
  */
  it('puts no figure on hours nobody has counted', () => {
    const r = reviewRole('Quoting', [
      m('Quotes issued within target', { fedBySystem: true }),
      m('Every enquiry logged', { fedBySystem: true }),
    ]);
    const s = saving(r.lines, 45);
    expect(s.hoursPerMonth).toBe(0);
    expect(s.costPerYear).toBe(0);
    expect(s.measured).toBe(false);
    expect(s.line).toContain('nobody has said how long they take');
    expect(s.line).toContain('SPEC will not put a figure on it');
  });

  it('counts only what was measured, and says when it counted less than everything', () => {
    const r = reviewRole('Quoting', [
      m('Quotes issued within target', { fedBySystem: true, hoursPerMonth: 20 }),
      m('Every enquiry logged', { fedBySystem: true }),
    ]);
    const s = saving(r.lines, 45);
    expect(s.hoursPerMonth).toBe(20);
    expect(s.hoursPerYear).toBe(240);
    expect(s.costPerYear).toBe(240 * 45);
    expect(s.measured, 'one of the two has no hours against it').toBe(false);
    expect(s.line).toContain('1 of 2');
    expect(s.line).toContain('not counted');
  });

  it('never counts work it said should stay with a person', () => {
    const r = reviewRole('Supervisor', [
      m('One-to-ones held', { pillar: 'people', hoursPerMonth: 40 }),
      m('Quotes issued within target', { fedBySystem: true, hoursPerMonth: 10 }),
    ]);
    expect(saving(r.lines, 45).hoursPerMonth, 'the 40 hours of one-to-ones are not a saving').toBe(10);
  });

  it('gives hours without money when nobody has said what an hour costs', () => {
    const r = reviewRole('Quoting', [m('Quotes issued within target', { fedBySystem: true, hoursPerMonth: 20 })]);
    const s = saving(r.lines, null);
    expect(s.hoursPerMonth).toBe(20);
    expect(s.costPerYear).toBe(0);
    expect(s.line).toContain('20 hours a month');
    expect(s.line, 'no invented rate').not.toContain('$');
  });

  it('claims nothing at all when nothing can move', () => {
    const r = reviewRole('Supervisor', [m('One-to-ones held', { pillar: 'people' })]);
    expect(saving(r.lines, 45).line).toContain('nothing to claim');
  });
});

describe('who may read it', () => {
  /*
    Kris: "only provide this info to the General Manager/CEO and the Board."

    Read one desk down, this is a page about whether somebody still has a job — while it is still a
    proposal, before any decision has been made. A manager cannot see it even for their own team.
  */
  it('is the board and the Managing Director, and nobody else', () => {
    expect(mayReadAutomationReview('director')).toBe(true);
    expect(mayReadAutomationReview('gm')).toBe(true);
    expect(mayReadAutomationReview('manager')).toBe(false);
    expect(mayReadAutomationReview('scored')).toBe(false);
    expect(mayReadAutomationReview('checklist')).toBe(false);
    expect(mayReadAutomationReview(null)).toBe(false);
    expect(mayReadAutomationReview(undefined)).toBe(false);
  });
});

describe('one role definition, varied at the edge', () => {
  /*
    A Sales Supervisor supervises selling. The job is the same whether it is solar systems, new
    homes or service contracts — only the noun changes. A template per industry would drift apart
    within six months, and nobody would be able to say which was the real one.
  */
  it('puts the business\'s own word into the measure', () => {
    expect(applyFocus('{focus} quote turnaround within target', 'Solar'))
      .toBe('Solar quote turnaround within target');
    expect(applyFocus('{focus} quote turnaround within target', 'New Homes'))
      .toBe('New Homes quote turnaround within target');
  });

  /* And reads correctly for a business that has not set one — never as a leaked variable name. */
  it('never shows the placeholder to anybody', () => {
    expect(applyFocus('{focus} quote turnaround within target', null))
      .toBe('Quote turnaround within target');
    expect(applyFocus('Every completed {focus} job asked for a review', '  '))
      .toBe('Every completed job asked for a review');
    for (const focus of ['Solar', '', null, undefined]) {
      expect(applyFocus('{focus} revenue at or above target', focus), String(focus)).not.toContain('{focus}');
    }
  });

  it('titles the role the way somebody would say it out loud', () => {
    expect(focusedTitle('Sales Supervisor', 'Solar')).toBe('Sales Supervisor — Solar');
    expect(focusedTitle('Sales Supervisor', null)).toBe('Sales Supervisor');
    expect(focusedTitle('Solar Sales Supervisor', 'Solar'), 'not "Solar Sales Supervisor — Solar"')
      .toBe('Solar Sales Supervisor');
  });

  /* Asking a Managing Director what their GM role "focuses on" is a question with no good answer. */
  it('only asks the roles where the question makes sense', () => {
    expect(needsFocus('sales_supervisor', [])).toBe(true);
    expect(needsFocus('operations_manager', ['{focus} revenue at target'])).toBe(true);
    expect(needsFocus('gm', ['Monthly revenue at or above target'])).toBe(false);
    expect(needsFocus(null, [])).toBe(false);
  });
});
