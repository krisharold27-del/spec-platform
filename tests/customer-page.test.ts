import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isToken, TOKEN_LENGTH, customerStage, headline, CUSTOMER_STAGES,
  VARIATION_ANSWERS, isVariationAnswer, mayAnswer, NEVER_SHOWN,
} from '../src/lib/customer-page';

/*
  ── The customer's own page ──────────────────────────────────────────────────────────────────────

  Design 17's new screen: the link that goes in every text and email. It is the only page in SPEC
  with no sign-in, which makes it the only page where a mistake is visible to somebody outside the
  business — so the checks here are about the fence, not the layout.
*/

const page = readFileSync('src/app/customer/[token]/page.tsx', 'utf8');
const actions = readFileSync('src/app/customer/[token]/actions.ts', 'utf8');

describe('the link is the key', () => {
  it('is long enough that guessing is not a strategy', () => {
    expect(TOKEN_LENGTH).toBe(32);
    expect(isToken('a'.repeat(32))).toBe(true);
    expect(isToken('a'.repeat(31)), 'one short').toBe(false);
    expect(isToken('A'.repeat(32)), 'not hex').toBe(false);
    expect(isToken('../../etc/passwd')).toBe(false);
    expect(isToken('')).toBe(false);
  });

  /*
    ── The one that matters on a page with no sign-in ───────────────────────────────────────────

    Every other write in SPEC starts by asking who is signed in. Nobody is here, so the token IS the
    authority — which means every action must find the job BY TOKEN and touch only what it finds. A
    job id accepted from the form would let anybody holding one link write to any job in any
    business. That is the whole risk of this page, in one mistake.
  */
  it('NEVER ACCEPTS A JOB ID FROM THE PAGE — only the token', () => {
    expect(actions).not.toMatch(/formData\.get\(\s*['"]jobId['"]/);
    expect(actions).toContain('eq(schema.jobs.customerToken, t)');
  });

  it('and checks the token’s shape before it reaches the database', () => {
    expect(actions).toContain('if (!isToken(t)) return null');
  });

  it('the page itself refuses a malformed token rather than querying on it', () => {
    expect(page).toContain('if (!isToken(token)) notFound()');
  });

  /* A customer's job has no business turning up in a search result. */
  it('IS NEVER INDEXED', () => {
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

describe('what the customer may never see', () => {
  /*
    Written down and checked, because the danger is not a decision anybody makes — it is a future
    edit passing the whole job row to a template that renders what it is given. A customer who sees
    a 42% margin on their switchboard does not come back.
  */
  it('SHOWS NO COST, MARGIN OR RATE, anywhere on the page', () => {
    for (const field of NEVER_SHOWN) {
      expect(page, `${field} must never reach the customer`).not.toContain(`view.${field}`);
      expect(page, `${field} must never reach the customer`).not.toContain(`job.${field}`);
    }
  });

  it('builds a narrow view rather than handing the job row to the template', () => {
    expect(page).toContain('const view: CustomerView');
    // The whole row is never spread into what is rendered.
    expect(page).not.toMatch(/\{\s*\.\.\.job\s*\}/);
  });

  it('and shows one job — never a list of the business’s work', () => {
    expect(page).not.toMatch(/jobs\.map|\.from\(schema\.jobs\)[\s\S]{0,200}orderBy/);
  });
});

describe('where the job has got to, in the customer’s words', () => {
  it('translates the board’s stages into what somebody waiting at home would say', () => {
    expect(customerStage({ stage: 'scheduled' })).toBe('booked');
    expect(customerStage({ stage: 'onsite' })).toBe('working');
    expect(customerStage({ stage: 'onsite', onWayAt: '2026-09-24T07:00:00Z' })).toBe('on_the_way');
    expect(customerStage({ stage: 'invoiced' })).toBe('done');
    expect(customerStage({ stage: 'paid' })).toBe('paid');
  });

  it('never shows a customer the word "enquiry"', () => {
    expect(CUSTOMER_STAGES.map(s => s.label).join(' ')).not.toMatch(/enquiry|invoiced|won/i);
  });

  it('the heading answers the question they opened the link to ask', () => {
    expect(headline('approved', 'Hemi', null)).toContain('Pick a time');
    expect(headline('booked', 'Hemi', 'Mon 29 Sep · 7am')).toContain('Mon 29 Sep');
    expect(headline('on_the_way', 'Hemi', null)).toContain('Hemi');
    expect(headline('done', 'Hemi', null)).toContain('invoice');
  });

  it('and works when SPEC does not know who is coming', () => {
    expect(headline('on_the_way', '', null)).toContain('Your electrician');
  });
});

describe('the variation, decided by the person paying for it', () => {
  /*
    "Approve" and "Call me first" — and NOT a bare "decline". Almost nobody hesitating over an extra
    cost wants to refuse the work; they want two minutes on the phone. A button that says so is what
    turns a variation into an AGREED variation instead of an argument at invoicing — and SPEC
    refuses to bill an unagreed one, so this is the moment that decides whether it is ever collected.
  */
  it('OFFERS A CALL RATHER THAN A DECLINE', () => {
    expect(VARIATION_ANSWERS.map(a => a.key)).toEqual(['approved', 'call_me']);
    expect(VARIATION_ANSWERS.map(a => a.label).join(' ')).not.toMatch(/decline|reject|no thanks/i);
  });

  it('and asking for a call is never recorded as a refusal', () => {
    expect(actions).not.toMatch(/state:\s*['"]declined['"]/);
    expect(actions).toContain('asked for a call before approving');
  });

  it('only answers one that is still open', () => {
    expect(mayAnswer({ state: 'draft' }, 'onsite')).toBe(true);
    expect(mayAnswer({ state: 'agreed' }, 'onsite'), 'already answered').toBe(false);
    expect(mayAnswer({ state: 'draft' }, 'paid'), 'after the invoice is not agreement').toBe(false);
    expect(mayAnswer(null, 'onsite')).toBe(false);
  });

  it('records who agreed and when, which is what makes it billable', () => {
    expect(actions).toContain('agreedBy');
    expect(actions).toContain('agreedAt');
  });

  it('refuses an answer it does not recognise', () => {
    expect(isVariationAnswer('approved')).toBe(true);
    expect(isVariationAnswer('whatever')).toBe(false);
    expect(actions).toContain('if (!isVariationAnswer(answer)) return');
  });
});

describe('picking a time', () => {
  /*
    Four real options, not a calendar. A customer given a calendar picks a day the crew is already
    booked, and somebody has to ring them back to say no.
  */
  it('OFFERS A FEW REAL TIMES rather than a free choice of any day', () => {
    expect(page).toContain('function nextSlots');
    expect(page).not.toMatch(/type="date"/);
  });

  it('and only before the work has started', () => {
    expect(actions).toContain("['enquiry', 'quoted', 'won', 'scheduled'].includes(job.stage)");
  });

  it('the buttons are big enough for a thumb', () => {
    expect(page).toContain('min-h-[48px]');
  });
});

import { greeting } from '../src/lib/customer-page';

describe('the customer page greets the person, never the company', () => {
  it('uses a person\'s first name only', () => {
    expect(greeting('priya shah')).toBe('Hi Priya');
    expect(greeting('Sam')).toBe('Hi Sam');
  });
  it('says "Hi there" to a business, an empty name, or a placeholder', () => {
    expect(greeting('Ridge Homes Pty Ltd')).toBe('Hi there');
    expect(greeting('')).toBe('Hi there');
    expect(greeting(null)).toBe('Hi there');
    expect(greeting('New client')).toBe('Hi there');
  });
});
