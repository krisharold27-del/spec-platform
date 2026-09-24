import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isSetupToken, SETUP_TOKEN_LENGTH, inviteText, PHONE_STEPS, phoneProgress } from '../src/lib/onboarding';

const ACTIONS = readFileSync('src/app/join/[token]/actions.ts', 'utf8');
const PAGE = readFileSync('src/app/join/[token]/page.tsx', 'utf8');

/*
  The page with no sign-in.

  Two of these in SPEC now — the customer's job page and this one — and both stand on the same
  single rule: the token is the authority, so every action must find its subject BY TOKEN and work
  only on what it finds. An id read from the form would let anybody holding one link write to any
  record in any business. That is the whole risk of a page without a sign-in, available in one
  mistake, which is why it is a test rather than a convention.
*/
describe('the token is the only way in', () => {
  it('takes a 32-character hex token and nothing else', () => {
    expect(SETUP_TOKEN_LENGTH).toBe(32);
    expect(isSetupToken('a'.repeat(32))).toBe(true);
    expect(isSetupToken('A'.repeat(32))).toBe(false);      // upper case is not what we issue
    expect(isSetupToken('a'.repeat(31))).toBe(false);
    expect(isSetupToken('a'.repeat(33))).toBe(false);
    expect(isSetupToken('../../etc/passwd')).toBe(false);
    expect(isSetupToken('')).toBe(false);
    expect(isSetupToken('g'.repeat(32))).toBe(false);      // hex only
  });

  it('every action finds the person by token, never by an id from the page', () => {
    /*
      Proved by reading the file, because this is a rule about what the code may NOT contain. A
      runtime test can only show that the paths it happened to try are safe; this shows there is no
      path at all.
    */
    expect(ACTIONS).toContain('schema.staff.setupToken');
    expect(ACTIONS).not.toMatch(/get\('staffId'\)/);
    expect(ACTIONS).not.toMatch(/get\('personId'\)/);
    expect(ACTIONS).not.toMatch(/get\('tenantId'\)/);
  });

  it('every exported action starts by resolving the token', () => {
    const bodies = ACTIONS.split(/export async function /).slice(1);
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf('('));
      const first = body.slice(0, body.indexOf('\n}'));
      expect(first, `${name} does not start from the token`).toMatch(/personFor\(form\.get\('token'\)\)/);
      expect(first, `${name} does not bail when the token is no good`).toMatch(/if \(!person\) return;/);
    }
  });

  it('the one row it deletes is checked to belong to this person', () => {
    const remove = ACTIONS.slice(ACTIONS.indexOf('export async function removeMyLicence'));
    expect(remove).toMatch(/row\.staffId !== person\.id/);
  });

  it('the page is never indexed', () => {
    expect(PAGE).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

describe('what the person may and may not do to their own record', () => {
  it('cannot mark themselves inducted — that stays the business’s mark', () => {
    /*
      The check that keeps somebody off a site they are not inducted for. A link that arrives as a
      text message is a link that can be forwarded and read over a shoulder, so it may buy the
      ability to fill your own details in and nothing that decides whether you can be sent to work.
    */
    expect(ACTIONS).toContain('inductionReadAt');
    expect(ACTIONS).not.toMatch(/inductedAt:\s*stamp\(\)/);
    expect(ACTIONS).not.toContain('seatKind');
    expect(ACTIONS).not.toContain('isSubcontractor');
  });

  it('never reads or writes anything about money', () => {
    for (const word of ['price', 'cents', 'stripe', 'subscription', 'invoice', 'billFor']) {
      expect(ACTIONS.toLowerCase(), `the join actions mention ${word}`).not.toContain(word.toLowerCase());
      expect(PAGE.toLowerCase(), `the join page mentions ${word}`).not.toContain(word.toLowerCase());
    }
  });

  it('shows one person and never a list', () => {
    /*
      A forwarded link must not become a staff directory. So every read on this page is narrowed:
      each `.from(...)` is followed immediately by a `.where(...)`, and the staff read is narrowed
      by the token itself rather than by the business — which is the difference between showing one
      person and showing everybody who works there.
    */
    const reads = [...PAGE.matchAll(/\.from\((schema\.\w+)\)([\s\S]{0,200})/g)];
    expect(reads.length).toBeGreaterThan(0);
    for (const [, table, after] of reads) {
      expect(after.trimStart().startsWith('.where('), `${table} is read without a where`).toBe(true);
    }
    expect(PAGE).toContain('eq(schema.staff.setupToken, token)');
  });
});

describe('the three things, and the message that carries the link', () => {
  it('is three steps, in the order somebody does them', () => {
    expect(PHONE_STEPS).toHaveLength(3);
    expect(PHONE_STEPS.map(s => s.key)).toEqual(['you', 'licences', 'induction']);
    for (const s of PHONE_STEPS) expect(s.why.length).toBeGreaterThan(20);
  });

  it('counts how far through somebody is', () => {
    const base = { name: 'Jamie', email: null, licences: [], inductedAt: null };
    expect(phoneProgress({ ...base } as never).done).toBe(0);
    expect(phoneProgress({ ...base, email: 'j@co.com.au' } as never).done).toBe(1);
    expect(phoneProgress({ ...base, email: 'j@co.com.au', licences: [{ what: 'A-grade' }] } as never).next)
      .toBe(PHONE_STEPS[2].label);
  });

  it('the message is short enough to be read on a phone, and carries the link', () => {
    const t = inviteText('JBI Electrical', 'Jamie Rivers', 'https://www.sitevipapp.com/join/' + 'a'.repeat(32));
    expect(t).toContain('Jamie');
    expect(t).toContain('JBI Electrical');
    expect(t).toMatch(/\/join\/[0-9a-f]{32}/);
    /* One SMS is 160 characters; the link eats 70 of them. Anything longer gets skimmed. */
    expect(t.length).toBeLessThan(200);
    /* No password, no app, no account — saying otherwise is what makes people not press it. */
    expect(t.toLowerCase()).not.toMatch(/password|download|install|app store/);
  });
});
