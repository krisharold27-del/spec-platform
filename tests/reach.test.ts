import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { reachBy, NEITHER_SAYS, EITHER_WILL_DO, ROUTE_SAYS } from '../src/lib/reach';

/**
 * Whatever you've got is enough.
 *
 * Kris, 26 September: an invite takes an email OR a phone number, never both, because the owner who
 * is stopped here does not come back. The test that matters is not that `reachBy` classifies
 * strings — it is that no route through the invite ends in a refusal with nothing to do next.
 */

describe('reading whatever the owner typed', () => {
  it('takes an address', () => {
    expect(reachBy('hemi@jbielectrical.com.au')).toEqual({ kind: 'email', email: 'hemi@jbielectrical.com.au' });
  });

  it('takes a number, in any of the ways anybody writes one', () => {
    for (const typed of ['0412 345 678', '0412345678', '+61 412 345 678', '(07) 3255 1234', '07-3255-1234']) {
      expect(reachBy(typed).kind, typed).toBe('phone');
    }
  });

  /* An admin scanning down a list recognises their own formatting; SPEC does not tidy it up. */
  it('keeps the number as they typed it', () => {
    expect(reachBy('0412 345 678')).toEqual({ kind: 'phone', phone: '0412 345 678' });
  });

  it('lower-cases an address, because a login is not case-sensitive and people shout', () => {
    expect(reachBy('  Hemi@JBI.com.au ')).toEqual({ kind: 'email', email: 'hemi@jbi.com.au' });
  });

  /*
    The '@' decides alone. Somebody who typed "hemi@jbi" is trying to write an address, and telling
    them it is not a valid phone number is useless advice about a question they did not ask.
  */
  it('treats anything with an @ as an attempt at an address', () => {
    expect(reachBy('hemi@jbi')).toEqual({ kind: 'unreadable', typed: 'hemi@jbi' });
  });

  it('will not guess at something that is neither', () => {
    expect(reachBy('Hemi Walker').kind).toBe('unreadable');
    expect(reachBy('1234').kind, 'four digits is not a phone number').toBe('unreadable');
  });

  it('says an empty box is empty rather than wrong', () => {
    expect(reachBy('').kind).toBe('nothing');
    expect(reachBy('   ').kind).toBe('nothing');
  });

  /*
    The expensive message. "That is not an email address" teaches the owner their number is no good,
    which is the belief that made them park the whole thing.
  */
  it('names both routes when it cannot read what was typed', () => {
    expect(NEITHER_SAYS).toMatch(/phone number/i);
    expect(NEITHER_SAYS).toMatch(/email/i);
    expect(NEITHER_SAYS).toMatch(/whichever you have/i);
  });

  it('says on the screen that one of the two is enough', () => {
    expect(EITHER_WILL_DO).toMatch(/do not need both/i);
  });

  /* The bill is decided before it is charged — and only one of the two routes charges. */
  it('says which route spends a seat and which does not', () => {
    expect(ROUTE_SAYS.email).toMatch(/takes a seat/i);
    expect(ROUTE_SAYS.phone).toMatch(/no seat is charged/i);
  });
});

/**
 * The give-up-point law, as a check.
 *
 * Kris, 26 September: *"Where could someone give up here?" Find it, remove it.* A law that lives in
 * a document is a law until the first person in a hurry adds `required` to a contact field, which
 * compiles, looks tidy, passes every test about its own behaviour and quietly costs a rollout its
 * people.
 *
 * So the law is enforced where it can be: no form in SPEC may REQUIRE a way of contacting somebody.
 * Names, dates and amounts may be required — a leave request with no dates is not a record of
 * anything. A contact detail may not, because there is always another way to reach a person and
 * there is never another owner.
 */
describe('the give-up-point law', () => {
  const FORMS = [
    'src/components/org-canvas.tsx',
    'src/app/people/setup-tab.tsx',
    'src/app/people/subbies-tab.tsx',
    'src/app/people/hr-tabs.tsx',
    'src/app/setup/people/page.tsx',
    'src/app/join/[token]/page.tsx',
    'src/app/subbie/[token]/page.tsx',
  ];

  it('no screen demands a way of contacting somebody', () => {
    const demanding: string[] = [];
    for (const file of FORMS) {
      const src = readFileSync(file, 'utf8');
      /*
        An input element carrying both a contact name and `required`. Matched over the whole tag
        rather than a line, because these are written across several lines and a line-at-a-time
        check would pass while looking at nothing.
      */
      for (const tag of src.match(/<input[^>]*>/gs) ?? []) {
        const named = /name="(email|phone|mobile|contact)"/.test(tag);
        if (named && /\brequired\b/.test(tag)) demanding.push(`${file}: ${tag.slice(0, 80)}`);
      }
    }
    expect(demanding, 'these fields stop an owner who does not have that detail').toEqual([]);
  });

  /*
    The org chart's invite is the one that cost the most, so it is checked by name rather than left
    to the sweep above: a `type="email"` input refuses a phone number in the BROWSER, before SPEC
    is even asked, so no amount of server-side generosity would have been reached.
  */
  it('the invite box does not refuse a phone number before SPEC sees it', () => {
    const src = readFileSync('src/components/org-canvas.tsx', 'utf8');
    const box = src.slice(src.indexOf('id="org-invite"'), src.indexOf('id="org-invite"') + 400);
    expect(box).not.toMatch(/type="email"/);
  });

  /*
    And the refusal it used to give — proved gone by naming the words themselves.

    Comments are stripped first, because this file EXPLAINS the old refusal in a comment and a
    check that cannot tell an explanation from the behaviour it describes is a check that fails for
    the wrong reason, then gets weakened until it never fails at all.
  */
  it('no longer tells an owner their phone number is not an email address', () => {
    const code = readFileSync('src/app/org/actions.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('That does not look like an email address.');
    /* What it says instead names both routes. */
    expect(code).toContain('NEITHER_SAYS');
  });

  /*
    The phone route must not be its own dead end.

    Recording a number and saying "done" would be the same fault one screen further on: the owner
    has nothing to send, and the person is still not in. So the action issues a link and the chart
    hands back the message itself.
  */
  it('a phone number produces a message to send, not just a saved number', () => {
    const action = readFileSync('src/app/org/actions.ts', 'utf8');
    expect(action).toMatch(/reach\.kind === 'phone'/);
    expect(action, 'the person needs a link, not just their number stored').toMatch(/setupToken/);

    const page = readFileSync('src/app/org/page.tsx', 'utf8');
    expect(page, 'the chart has to show the message').toContain('inviteText(');
    expect(page).toContain('CopyBox');
  });

  /* No account is created, so no seat is spent — the bill is decided before it is charged. */
  it('charges nothing for somebody reached by phone', () => {
    const action = readFileSync('src/app/org/actions.ts', 'utf8');
    const phoneBranch = action.slice(action.indexOf("reach.kind === 'phone'"));
    const untilRedirect = phoneBranch.slice(0, phoneBranch.indexOf('redirect('));
    expect(untilRedirect).not.toContain('inviteToSeat');
  });

  /*
    ── The same law on the Subcontractors screen (26 September) ─────────────────────────────────

    The mirror image, and worse. It required a MOBILE, refusing with "A mobile is how they get the
    link to set themselves up" — and there was no link: no token, no message, no route. A required
    field justified by a capability that did not exist, in front of a screen promising the subbie
    would "set themselves up on their phone in about ten minutes" while the office typed in all six
    checks.
  */
  it('does not demand a mobile for a subcontractor either', () => {
    const code = readFileSync('src/app/people/actions.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('A mobile is how they get the link to set themselves up.');
    expect(code, 'it should read whatever was typed').toContain('reachBy(');
  });

  /* And the link it names is now real, which is the half prose cannot prove. */
  it('the subcontractor link exists, rather than being described', () => {
    expect(existsSync('src/app/subbie/[token]/page.tsx'), 'the page the link opens').toBe(true);
    expect(existsSync('src/app/subbie/[token]/actions.ts'), 'what they may record').toBe(true);

    const invite = readFileSync('src/app/people/actions.ts', 'utf8');
    expect(invite, 'inviting one has to issue a token').toMatch(/setupToken: randomBytes/);

    const tab = readFileSync('src/app/people/subbies-tab.tsx', 'utf8');
    expect(tab, 'and the office needs the message, not the token').toContain('inviteText(');
    expect(tab).toContain('/subbie/');
  });

  /*
    The fence on that page, checked in the code rather than trusted to the markup. A form is a thing
    anybody can post to, so "the page does not draw a button for it" is not a rule.
  */
  it('a subcontractor cannot tick the two checks that are not theirs', () => {
    const actions = readFileSync('src/app/subbie/[token]/actions.ts', 'utf8');
    expect(actions).toContain('isTheirs(');
    /* Every write finds the subbie BY TOKEN — an id from the form would open every business. */
    expect(actions).not.toMatch(/txt\(form, 'subbieId'/);
  });
});
