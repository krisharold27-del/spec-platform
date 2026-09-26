/*
  Asking for a mirror, and what the answer is not allowed to contain.

  Kris, 26 September: *"mirrors are for the business to use for all sorts of important things -
  exactly the same as artifacts... have chat function at the top and then produce the mirrors -
  artifacts - then the staff have a fabulous resource to help them be succesful."*

  The whole risk of this feature is in one sentence: a mirror gets PINNED. It is not a chat reply
  that scrolls away — a supervisor plans around it and a crew works to it. So the tests that matter
  most here are the ones about what must never come out of it.
*/
import { describe, it, expect } from 'vitest';
import {
  starter, readDraft, kindFor, wantsNumbers, stripNumbers, systemPrompt,
  CAN_DRAFT, WILL_NOT_DRAFT, MIN_ASK,
  dropped, revisePrompt, currentAsText,
} from '../src/lib/mirror-maker';

describe('a drafted mirror never invents a number', () => {
  it('TAKES FIGURES OUT OF WHATEVER COMES BACK', () => {
    /*
      A model asked for a training mirror will slip in "aim for 95% first-time fix" without being
      asked, because that is what good-looking prose contains. Pinned to a board it reads as the
      business's own target, and somebody will be measured against it.
    */
    expect(stripNumbers('Aim for 95% first-time fix')).not.toMatch(/95\s*%/);
    expect(stripNumbers('Budget $4,500 per van')).not.toMatch(/\$\s?4,500/);
    expect(stripNumbers('callback rate of 4.2 across the quarter')).not.toContain('4.2');
  });

  it('leaves the numbers that are just facts about the work', () => {
    /* Step 1, 8am and a 32A breaker are all real and all useful. A rule that ate them would make
       every drafted checklist useless, and people would stop using the box. */
    const kept = stripNumbers('Step 1: isolate at the 32A breaker before 8am');
    expect(kept).toContain('32A');
    expect(kept).toContain('8am');
    expect(kept).toContain('Step 1');
  });

  it('SCRUBS A DRAFT ON THE WAY IN, not just on the way out', () => {
    const draft = readDraft(JSON.stringify({
      title: 'Hit 98% on time',
      summary: 'Lift first-time fix to 95% this quarter.',
      kind: 'training',
      steps: [{ text: 'Keep callbacks under 3%', owner: 'Site supervisor' }],
    }));
    expect(draft).not.toBeNull();
    expect(draft!.title).not.toMatch(/98\s*%/);
    expect(draft!.summary).not.toMatch(/95\s*%/);
    expect(draft!.steps[0].text).not.toMatch(/3\s*%/);
  });

  it('tells the model the rule too, so scrubbing is the second line of defence', () => {
    /* Stripping after the fact is a net, not a plan. If the only thing stopping invented figures
       were a regex, the first one written in words ("about a fifth") would sail through. */
    expect(systemPrompt()).toContain('NEVER invent a figure');
    expect(systemPrompt()).toContain('your own figure'.split(' ')[1]);
  });
});

describe('what it will and will not draft', () => {
  it('OFFERS ONLY THE FOUR KINDS MADE OF WORDS', () => {
    /* Live data and Scorecards are made of figures read from the business's own systems. Drafting
       one would be inventing readings, which is the one thing this feature must never do. */
    expect(CAN_DRAFT.map(k => k.id).sort()).toEqual(['improve', 'meetings', 'plans', 'training']);
    expect(CAN_DRAFT.map(k => k.id)).not.toContain('live');
    expect(CAN_DRAFT.map(k => k.id)).not.toContain('kpi');
  });

  it('says out loud why the other two are not on offer', () => {
    /* A refusal that just says no teaches nothing. Somebody who asked for the callback rate should
       be told where it actually comes from, not left thinking the product cannot do it. */
    expect(WILL_NOT_DRAFT.map(w => w.label)).toEqual(['Live data', 'Scorecards']);
    for (const w of WILL_NOT_DRAFT) expect(w.why.length).toBeGreaterThan(30);
  });

  it('notices when somebody is really asking for figures', () => {
    expect(wantsNumbers('build me a scorecard for the crew')).toBe(true);
    expect(wantsNumbers('what is our callback rate')).toBe(true);
    expect(wantsNumbers('a pre-start checklist for switchboard work')).toBe(false);
  });

  it('opens on the kind the words point at', () => {
    expect(kindFor('how to induct a new apprentice')).toBe('training');
    expect(kindFor('what we decided at the toolbox meeting')).toBe('meetings');
    expect(kindFor('plan the solar rollout')).toBe('plans');
    expect(kindFor('vans keep turning up without parts')).toBe('improve');
  });
});

describe('it drafts, and it works without a key', () => {
  it('GIVES A REAL STARTER WHEN THERE IS NO CLAUDE', () => {
    /* Every caller in this codebase that reaches Claude degrades to something true rather than to
       an empty box — a revoked key must not become a dead feature. */
    const d = starter('a pre-start checklist for switchboard work');
    expect(d.title.toLowerCase()).toContain('pre-start');
    expect(d.kind).toBe('training');
    expect(d.steps.length).toBeGreaterThanOrEqual(3);
    expect(d.summary).toContain('Nothing has been filled in for you');
  });

  it('does not pretend the starter is finished work', () => {
    /* The worst version of this feature is one that hands somebody a confident-looking empty
       template. "Never present an empty template as a result" is already the board pack's rule. */
    const d = starter('how the crew closes down a site');
    expect(d.summary).toContain('what was asked for');
    expect(d.steps.every(s => s.state === 'todo')).toBe(true);
  });

  it('every drafted step starts as todo, and owners are roles not people', () => {
    const d = readDraft(JSON.stringify({
      title: 'Closing down a site', summary: 'What to do at the end of the day.', kind: 'training',
      steps: [{ text: 'Lock the board', owner: 'Site supervisor' }],
    }))!;
    expect(d.steps[0].state).toBe('todo');
    expect(d.steps[0].owner).toBe('Site supervisor');
    expect(systemPrompt()).toContain("never a person's name");
  });
});

describe('a bad answer costs one more press, not the afternoon', () => {
  it('returns null on prose instead of throwing', () => {
    expect(readDraft('Sure! Here is a great checklist for you:')).toBeNull();
    expect(readDraft('')).toBeNull();
    expect(readDraft('{"title":"x"}')).toBeNull();
  });

  it('reads it anyway when it arrives wrapped in a code fence', () => {
    /* Models fence JSON about a third of the time whatever they are told. Failing on that would
       make the feature look broken at random. */
    const d = readDraft('```json\n{"title":"Site close down","summary":"End of day.","kind":"training","steps":[{"text":"Lock the board","owner":""}]}\n```');
    expect(d?.title).toBe('Site close down');
  });

  it('refuses a draft with no steps, because that is an empty template', () => {
    expect(readDraft('{"title":"A","summary":"B","kind":"training","steps":[]}')).toBeNull();
  });

  it('caps the length, so one runaway answer cannot fill a board', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ text: `Step ${i}`, owner: '' }));
    const d = readDraft(JSON.stringify({ title: 'Long', summary: 'Long one.', kind: 'plans', steps: many }));
    expect(d!.steps.length).toBeLessThanOrEqual(12);
  });

  it('asks for a sentence before spending a call on two words', () => {
    expect(MIN_ASK).toBeGreaterThan(5);
  });
});

describe('changing a mirror that people are already working to', () => {
  /*
    The dangerous half. A drafted mirror nobody has read is harmless; one somebody asks to CHANGE is
    already pinned and already has judgement in it. A rewrite regenerates the list, and a step can
    fail to come back without anything deciding to remove it — the new version reads perfectly.
  */
  const before = [
    { text: 'Isolate at the board and lock it off', owner: 'Electrician' },
    { text: 'Test for dead', owner: 'Electrician' },
    { text: 'Fit the new breaker', owner: 'Electrician' },
  ];

  it('SAYS WHAT A REWRITE TOOK OUT', () => {
    const after = [{ text: 'Test for dead', owner: '' }, { text: 'Fit the new breaker', owner: '' }];
    expect(dropped(before, after)).toEqual(['Isolate at the board and lock it off']);
  });

  it('says nothing when nothing went', () => {
    /* A check that cries wolf is worse than no check: a warning on every revision teaches people to
       press past it, and then the one that mattered goes past too. */
    const after = [...before, { text: 'Sign it off', owner: 'Site supervisor' }];
    expect(dropped(before, after)).toEqual([]);
  });

  it('is not fooled by reordering, or by a capital letter', () => {
    const after = [
      { text: 'Fit the new breaker', owner: '' },
      { text: 'isolate at the board and lock it off', owner: '' },
      { text: 'Test for dead', owner: '' },
    ];
    expect(dropped(before, after)).toEqual([]);
  });

  it('counts a reworded step as dropped, which is the right way to be wrong', () => {
    /* Telling somebody a step went when it was only reworded costs them a glance. Missing a real
       removal costs a crew the step that stopped the job. */
    const after = [{ text: 'Isolate the board', owner: '' }, { text: 'Test for dead', owner: '' }, { text: 'Fit the new breaker', owner: '' }];
    expect(dropped(before, after)).toContain('Isolate at the board and lock it off');
  });

  it('TELLS THE MODEL TO KEEP WHAT IT WAS NOT ASKED TO CHANGE', () => {
    const p = revisePrompt();
    expect(p).toContain('Keep every step the request did not ask you to change');
    expect(p).toContain('stops a job');
    /* It inherits the no-invented-figures rule rather than restating it — one copy of the answer. */
    expect(p).toContain('NEVER invent a figure');
  });

  it('sends the whole current mirror, not just the request', () => {
    /* Asked to "make it shorter" with no mirror attached, a model writes a new one from nothing and
       the business loses everything it had written. */
    const text = currentAsText({ title: 'Switchboard work', summary: 'Before you open it.', steps: before }, 'make it shorter');
    expect(text).toContain('Switchboard work');
    expect(text).toContain('Isolate at the board');
    expect(text).toContain('make it shorter');
  });
});
