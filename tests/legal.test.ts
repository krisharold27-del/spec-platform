import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TERMS_VERSION, TERMS_UPDATED, PRIVACY_VERSION, PRIVACY_UPDATED,
  CONSENT_LABEL, CONSENT_REQUIRED, consentNow,
} from '../src/lib/legal';
import { tableShapes } from '../src/lib/schema-sql';

/**
 * Agreeing to the terms, and the record that somebody did.
 *
 * The question that gets asked later is never "did they tick a box". It is "what did they agree
 * to" — and only the version answers that, because the page gets edited and somebody who signed up
 * in March agreed to the March words.
 *
 * So the things held here are the ones that would quietly stop being true: the box unticked, the
 * check on the server rather than only in the browser, and the version on the page matching the
 * version stamped on an account.
 */

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
/** Comments stripped — a rule about what the CODE does is not about what a note explains. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the consent is asked for properly', () => {
  const forms = ['app/signup/page.tsx', 'app/seat/page.tsx'];

  it('BOTH PLACES AN ACCOUNT IS CREATED ASK FOR IT', () => {
    /*
      Signing up is the obvious one. Taking an invited seat is the one that gets forgotten — and it
      is the same act: an account is created and that person's work starts being stored. Their
      manager agreeing on their behalf is not agreement.
    */
    for (const f of forms) {
      expect(code(f), `${f} does not ask`).toContain('name="consent"');
    }
  });

  it('UNTICKED BY DEFAULT, always', () => {
    // A pre-ticked box is not agreement, and in Australia it is not worth the pixels it is drawn
    // with. `defaultChecked` or `checked` here would be the whole thing quietly undone.
    for (const f of forms) {
      const box = code(f).slice(code(f).indexOf('name="consent"') - 200, code(f).indexOf('name="consent"') + 300);
      expect(box, `${f} pre-ticks it`).not.toMatch(/defaultChecked|checked=/);
      expect(box, `${f} does not require it`).toContain('required');
    }
  });

  it('and links to both documents, in a new tab', () => {
    for (const f of forms) {
      const src = code(f);
      expect(src, f).toContain('href="/terms"');
      expect(src, f).toContain('href="/privacy"');
      // A new tab, so reading the terms does not throw away the form they have just filled in.
      expect(src, `${f} opens them in the same tab`).toContain('target="_blank"');
    }
  });
});

describe('the server decides, not the browser', () => {
  const actions = ['app/signup/actions.ts', 'app/seat/actions.ts'];

  it('EVERY ACTION REFUSES WITHOUT IT', () => {
    /*
      `required` on the input is a convenience for the person, not a control — it is one line of
      devtools away from gone. The record this creates has to be true, so the only check that counts
      is the one on the server.
    */
    for (const f of actions) {
      expect(code(f), `${f} trusts the browser`).toContain("formData.get('consent')");
      expect(code(f), f).toMatch(/!== 'yes'/);
    }
  });

  it('and the refusal has words, not silence', () => {
    expect(CONSENT_REQUIRED.length).toBeGreaterThan(40);
    // Answers the thing somebody actually fears when a form bounces.
    expect(CONSENT_REQUIRED.toLowerCase()).toContain('still here');
    for (const f of ['app/signup/page.tsx', 'app/seat/page.tsx']) {
      expect(code(f), `${f} shows no message for a refusal`).toContain('CONSENT_REQUIRED');
    }
  });
});

describe('the record that is kept', () => {
  it('THE ACCOUNT STORES BOTH THE VERSION AND THE MOMENT', () => {
    const users = tableShapes().find(t => t.name === 'users');
    expect(users, 'no users table').toBeTruthy();
    const columns = users!.columns.map(c => c.name);
    expect(columns).toContain('terms_version');
    expect(columns).toContain('terms_accepted_at');
  });

  it('never one without the other', () => {
    // A timestamp with no version says somebody agreed to something, which is not a record. A
    // version with no timestamp cannot be placed in a sequence.
    const c = consentNow(new Date('2026-09-18T01:02:03.000Z'));
    expect(c.termsVersion).toBe(TERMS_VERSION);
    expect(c.termsAcceptedAt).toBe('2026-09-18T01:02:03.000Z');
  });

  it('and is written where the account is created, in both flows', () => {
    expect(code('app/signup/actions.ts')).toContain('consentNow()');
    expect(code('app/seat/actions.ts')).toContain('consentNow()');
  });

  it('but NEVER for somebody who was not in the room', () => {
    /*
      `assignPerson` is also how a manager puts somebody else's name on the chart. That person has
      agreed to nothing, and recording consent for them would be worse than recording none: it
      would look like evidence.
    */
    const prov = code('lib/provision.ts');
    expect(prov).toContain('consent?: Consent');
    expect(prov).toContain('consent?.termsVersion ?? null');
  });
});

describe('the version on the page is the version in the record', () => {
  it('both pages print a version and a date', () => {
    for (const [page, ver, upd] of [
      ['app/terms/page.tsx', 'TERMS_VERSION', 'TERMS_UPDATED'],
      ['app/privacy/page.tsx', 'PRIVACY_VERSION', 'PRIVACY_UPDATED'],
    ] as const) {
      const src = code(page);
      expect(src, `${page} has no version`).toContain(`{${ver}}`);
      expect(src, `${page} has no date`).toContain(`{${upd}}`);
    }
  });

  it('and neither page hard-codes one of its own', () => {
    // Two sources for the same version is how a stored `termsVersion` becomes a lie: the page says
    // 1.2, the constant says 1.1, and every record made in between points at neither.
    for (const page of ['app/terms/page.tsx', 'app/privacy/page.tsx']) {
      expect(code(page), `${page} hard-codes a "Last updated" date`).not.toMatch(/Last updated \d/);
    }
  });

  it('the versions look like versions', () => {
    for (const v of [TERMS_VERSION, PRIVACY_VERSION]) expect(v).toMatch(/^\d+\.\d+$/);
    for (const d of [TERMS_UPDATED, PRIVACY_UPDATED]) expect(d).toMatch(/^\d{1,2} \w+ \d{4}$/);
  });
});

describe('what the pages must never contain', () => {
  it('NO UNFILLED PLACEHOLDERS, ever', () => {
    /*
      The starter draft handed over on 18 September carried [LEGAL ENTITY NAME / ABN], [DATE],
      [CONTACT EMAIL] and [12 months]. A live Terms page reading "[CONTACT EMAIL]" is worse than no
      page: it tells a customer nobody has read this, on the screen where they are deciding whether
      to trust us with their business.

      The existing text was kept precisely because it has none of these — it names the real
      sub-processors, the real contact address and the real governing law.
    */
    for (const page of ['app/terms/page.tsx', 'app/privacy/page.tsx']) {
      const found = read(page).match(/\[[A-Z][A-Z /]{3,}\]/g) ?? [];
      expect(found, `${page} still has ${found.join(', ')}`).toEqual([]);
    }
  });

  it('and both still say the things that make them Australian', () => {
    const terms = read('app/terms/page.tsx');
    expect(terms, 'the ACL clause has gone').toMatch(/Australian Consumer Law/);
    expect(terms, 'the governing law has gone').toMatch(/Victoria/);
    const privacy = read('app/privacy/page.tsx');
    expect(privacy, 'the Privacy Act reference has gone').toMatch(/Privacy Act 1988/);
    expect(privacy, 'the OAIC route has gone').toMatch(/Australian Information Commissioner|oaic/i);
  });

  it('the label is one sentence, said the same way in both places', () => {
    expect(CONSENT_LABEL).toBe('I agree to the Terms of Service and Privacy Policy');
    for (const f of ['app/signup/page.tsx', 'app/seat/page.tsx']) {
      expect(code(f), f).toContain('CONSENT_LABEL');
    }
  });
});
