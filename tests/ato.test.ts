import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  looksLikeAbn, NO_ABN_CHECK, RECHECK_AFTER_DAYS, readAbn, WHY_PAYMENT_STOPS,
  TESTS, readTests, SPEC_DOES_NOT_DECIDE, ASKED_ONCE,
  buildTpar, suggest, LIMIT_IS_YOURS, overLimit,
  type AbnCheck, type TestKey, type Answer, type TparRow, type ClientCheck,
} from '../src/lib/ato';

const src = readFileSync(join(process.cwd(), 'src/lib/ato.ts'), 'utf8');
const NOW = new Date('2026-09-25T00:00:00Z');

/* A real-shaped ABN that passes the published checksum. */
const GOOD_ABN = '51824753556';

const abn = (over: Partial<AbnCheck> = {}): AbnCheck => ({
  abn: GOOD_ABN,
  registeredTo: 'Sparky Pty Ltd',
  current: true,
  gstRegistered: true,
  checkedAt: '2026-09-20T00:00:00Z',
  ...over,
});

describe('no rates, thresholds or lodgement dates live here', () => {
  /*
    The rule lib/certificates set, with the ATO on the other end of it. The 47% withholding rate is
    in a comment where it explains the reasoning; it must never be in code that computes anything.
  */
  it('has no withholding rate or lodgement date in the code', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const found = [
      ...code.matchAll(/\b\d+(?:\.\d+)?\s*%/g),
      ...code.matchAll(/\b\d{1,2}\s+(?:Aug|Jul|Jun|Sep)\w*/gi),
    ].map(m => m[0]);
    expect(found, `a rate or date was written into the code: ${found.join(', ')}`).toEqual([]);
  });

  it('does not name who lodges as SPEC', () => {
    expect(buildTpar('2026', []).lodgedBy).toContain('accountant');
  });
});

describe('the ABN', () => {
  it('knows a well-formed one from a wrong one', () => {
    expect(looksLikeAbn(GOOD_ABN)).toBe(true);
    expect(looksLikeAbn('51 824 753 556')).toBe(true);
    expect(looksLikeAbn('51824753557')).toBe(false);
    expect(looksLikeAbn('123')).toBe(false);
    expect(looksLikeAbn('abcdefghijk')).toBe(false);
  });

  it('blocks payment with no ABN at all', () => {
    const r = readAbn(NO_ABN_CHECK, NOW);
    expect(r.mayPay).toBe(false);
    expect(r.says).toContain('business’s problem');
  });

  it('blocks a number that is not a real ABN', () => {
    const r = readAbn(abn({ abn: '51824753557' }), NOW);
    expect(r.state).toBe('malformed');
    expect(r.mayPay).toBe(false);
  });

  it('blocks one that has never been looked up', () => {
    /* A number that looks right is not the same as one that is registered. */
    expect(readAbn(abn({ checkedAt: null }), NOW).mayPay).toBe(false);
  });

  it('blocks one that is not current', () => {
    const r = readAbn(abn({ current: false }), NOW);
    expect(r.state).toBe('not_current');
    expect(r.mayPay).toBe(false);
  });

  it('blocks a check that has gone stale', () => {
    /*
      The case this exists for: an ABN cancelled in March, last checked in January. It looks
      identical to a good one until somebody looks again.
    */
    const r = readAbn(abn({ checkedAt: '2026-01-01T00:00:00Z' }), NOW);
    expect(r.state).toBe('stale');
    expect(r.mayPay).toBe(false);
    expect(RECHECK_AFTER_DAYS).toBe(90);
  });

  it('lets a good one through and says whether they charge GST', () => {
    const r = readAbn(abn(), NOW);
    expect(r.mayPay).toBe(true);
    expect(r.says).toContain('Sparky Pty Ltd');
    expect(r.says).toContain('registered for GST');
  });

  it('says why a payment stops rather than just stopping it', () => {
    expect(WHY_PAYMENT_STOPS).toContain('tax liability');
  });
});

describe('contractor or employee — SPEC asks and does not answer', () => {
  const all = (v: Answer): Partial<Record<TestKey, Answer>> =>
    Object.fromEntries(TESTS.map(t => [t.key, v]));

  it('is the four the ATO publishes', () => {
    expect(TESTS).toHaveLength(4);
    expect(TESTS.map(t => t.key)).toEqual(['delegate', 'result', 'tools', 'own_business']);
  });

  it('says nothing at all until all four are answered', () => {
    const r = readTests({ delegate: 'yes' });
    expect(r.leaning).toBe('unanswered');
    expect(r.says).toContain('one on its own says nothing');
    expect(r.suggestARole).toBe(false);
  });

  it('leans contractor when they all point that way', () => {
    const r = readTests(all('yes'));
    expect(r.leaning).toBe('contractor');
    expect(r.suggestARole).toBe(false);
  });

  it('leans employee and suggests offering them a job', () => {
    const r = readTests(all('no'));
    expect(r.leaning).toBe('employee');
    expect(r.suggestARole).toBe(true);
    /* The outcome that fixes it rather than the one that argues about it. */
    expect(r.says).toContain('offer them a job');
  });

  it('never claims to have decided', () => {
    expect(readTests(all('no')).says).toContain('cannot decide');
    expect(SPEC_DOES_NOT_DECIDE).toContain('prompt to think');
  });

  it('calls a split a split', () => {
    const r = readTests({ delegate: 'yes', result: 'yes', tools: 'no', own_business: 'no' });
    expect(r.leaning).toBe('mixed');
    expect(r.says).toContain('gets challenged');
  });

  it('is asked once, at onboarding', () => {
    expect(ASKED_ONCE).toContain('box people tick');
  });
});

describe('TPAR', () => {
  const row = (over: Partial<TparRow> = {}): TparRow =>
    ({ subbie: 'Sparky Pty Ltd', abn: GOOD_ABN, grossCents: 4_200_000, gstCents: 420_000, complete: true, missing: [], ...over });

  it('says what is missing rather than producing a report with holes', () => {
    const t = buildTpar('2026', [row(), row({ subbie: 'Nobody', abn: null, complete: false, missing: ['ABN'] })]);
    expect(t.incomplete).toHaveLength(1);
    expect(t.says).toContain('missing something the report needs');
  });

  it('is ready when it is ready', () => {
    expect(buildTpar('2026', [row()]).says).toContain('Ready for your accountant');
  });

  it('says nothing dramatic with no subbies', () => {
    expect(buildTpar('2026', []).says).toContain('No subcontractor payments');
  });
});

describe('a new client asking for an account', () => {
  const client = (over: Partial<ClientCheck> = {}): ClientCheck => ({
    name: 'Harbourview',
    abn: abn(),
    creditScore: 720,
    creditSource: 'Equifax',
    paysInDays: 28,
    paysSource: 'three other trades',
    ...over,
  });

  it('suggests nothing when the ABN does not check out', () => {
    const s = suggest(client({ abn: NO_ABN_CHECK }), NOW);
    expect(s.termDays).toBeNull();
    expect(s.says).toContain('knowing who they are');
  });

  it('refuses to suggest on one fact', () => {
    /*
      The important refusal. A default dressed as a recommendation is how a business gives an
      unknown customer thirty days on SPEC's say-so.
    */
    const s = suggest(client({ creditScore: null, creditSource: null, paysInDays: null, paysSource: null }), NOW);
    expect(s.termDays).toBeNull();
    expect(s.says).toContain('looks like it was worked out');
  });

  it('suggests when it has real facts, and shows them', () => {
    const s = suggest(client(), NOW);
    expect(s.termDays).toBe(30);
    expect(s.basedOn.length).toBeGreaterThanOrEqual(2);
    expect(s.says).toContain('Equifax');
  });

  it('tightens terms for a slow payer, and says why plainly', () => {
    const s = suggest(client({ paysInDays: 60 }), NOW);
    expect(s.termDays).toBe(14);
    /* Never an accusation — their habit and your cash flow simply disagree. */
    expect(s.says).toContain('not because they are bad for it');
  });

  it('never suggests a dollar limit', () => {
    expect(suggest(client(), NOW).limitCents).toBeNull();
    expect(LIMIT_IS_YOURS).toContain('only you can see both');
  });
});

describe('over the limit', () => {
  it('says nothing when no limit is set', () => {
    expect(overLimit(50_000_00, null).over).toBe(false);
  });

  it('stops more work going on account', () => {
    const r = overLimit(60_000_00, 50_000_00);
    expect(r.over).toBe(true);
    expect(r.says).toContain('until some of it comes back');
  });

  it('treats exactly the limit as inside it', () => {
    expect(overLimit(50_000_00, 50_000_00).over).toBe(false);
  });
});
