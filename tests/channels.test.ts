import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHANNELS, TOUCHPOINTS, channelFor, byChannel, NO_SMS, WHY_NOT_SMS, INSTEAD,
} from '../src/lib/channels';

/**
 * Email or phone. Never a text message.
 *
 * Kris, 26 September (Design 20): *"customer communication is EMAIL or PHONE only. No SMS… Where
 * other pages in the pack still say 'text' or 'SMS' to a customer, build them as a phone call or an
 * email instead."*
 *
 * SPEC sends no texts today — there is no gateway — so nothing was technically broken. What was
 * wrong is that screens PROMISED one. A customer told "we'll text you when we're on the way" and
 * then emailed has been misled by the product in a way they can point at, and the business wears
 * it. So this test reads the rendered strings rather than the plumbing.
 */

describe('how SPEC reaches a customer', () => {
  it('is two channels, and text is not one of them', () => {
    expect([...CHANNELS]).toEqual(['email', 'phone']);
  });

  it('has decided every touchpoint, rather than leaving it to whoever writes the screen', () => {
    expect(TOUCHPOINTS.length).toBeGreaterThanOrEqual(10);
    for (const t of TOUCHPOINTS) {
      expect(CHANNELS, `${t.key} has no channel`).toContain(t.channel);
      expect(t.why.length, `${t.key} has no reason`).toBeGreaterThan(30);
    }
  });

  /*
    The split, stated as a rule rather than a list: a CALL is for something that needs an answer
    now; an EMAIL is for something that needs to be kept. These four are where getting it backwards
    would be most obviously wrong to a customer.
  */
  it('calls when it is urgent and emails when it has to be kept', () => {
    expect(channelFor('missed_call')).toBe('phone');
    expect(channelFor('on_my_way')).toBe('phone');
    expect(channelFor('booking')).toBe('email');
    expect(channelFor('invoice')).toBe('email');
  });

  /* The review pair, which is the one most likely to be collapsed into a single message. */
  it('keeps "how did we go" a call and the review link an email', () => {
    /* The call comes first so anything wrong becomes a callback before it becomes a review. */
    expect(channelFor('how_did_we_go')).toBe('phone');
    /* The link cannot be read down a phone. */
    expect(channelFor('review')).toBe('email');
  });

  it('uses both, so this is not "email only" wearing a second name', () => {
    expect(byChannel('phone').length).toBeGreaterThan(0);
    expect(byChannel('email').length).toBeGreaterThan(0);
  });

  it('says no to a text without just saying no', () => {
    expect(NO_SMS).toMatch(/does not send text messages/i);
    /* "Customers prefer a text" is a real argument and deserves a real answer. */
    expect(WHY_NOT_SMS).toMatch(/cannot ring back/i);
    expect(INSTEAD).toMatch(/call/i);
    expect(INSTEAD).toMatch(/email/i);
  });

  it('does not know a channel it was never given', () => {
    expect(channelFor('carrier pigeon')).toBeNull();
  });
});

/**
 * The sweep: no rendered string may promise a customer a text.
 *
 * Reads STRING LITERALS only, not comments. An earlier check of this shape matched the explanation
 * of a rule and failed for the wrong reason, which is how a check gets weakened until it never
 * fails at all.
 */
describe('nothing promises a customer a text', () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (!['node_modules', '.next'].includes(e)) walk(p); }
      else if (/\.tsx?$/.test(p)) files.push(p);
    }
  };
  walk('src');

  /**
   * The three places a text is right, each for a reason that is not about customers.
   *
   * Written out because an exception nobody can read is an exception that grows.
   */
  const ALLOWED: Record<string, string> = {
    'src/lib/reach.ts':
      'the staff and subbie setup link, pasted into the message app already open on the admin’s phone — Kris, 24 September, and the reason SPEC needs no gateway',
    'src/lib/money-sight.ts':
      'two-step sign-in by text, which is a security choice about SPEC’s own logins and not a message to a customer',
    'src/lib/pay-run.ts':
      'names re-keying hours FROM a text message as a cause of underpayment — a warning about the practice, not an offer to send one',
    'src/lib/channels.ts': 'the rule itself',
  };

  /**
   * What a promise of a text actually looks like in a sentence.
   *
   * Deliberately narrow. The first version of this pulled out string literals and looked for the
   * WORD, and it accused `src/lib/email.ts` — where `text` is the plain-text half of an email
   * payload and `res.text()` reads a response body. A check that fires on the right word in the
   * wrong sense gets an exception added, then another, and by the fourth it is off.
   *
   * So it matches the phrases a person actually writes when offering one, and nothing else. "a text
   * file" is excluded by name for the same reason.
   */
  const PROMISES = [
    /\ba text\b(?!\s*(file|field|box|area|editor|string|column))/i,
    /\btext message\b/i,
    /\btext (you|them|the customer|the client)\b/i,
    /\b(by|via) SMS\b/i,
  ];
  const promising = (s: string) => PROMISES.some(p => p.test(s));

  it('no screen or library offers to text somebody', () => {
    const promises: string[] = [];
    for (const f of files) {
      if (f.replace(/\\/g, '/') in ALLOWED) continue;
      /* Comments stripped first: half this codebase explains WHY there are no texts. */
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const p of PROMISES) {
        const m = src.match(p);
        if (m && m.index !== undefined) {
          promises.push(`${f}: …${src.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' ')}…`);
        }
      }
    }
    expect(promises, 'these promise a text — make them a call or an email').toEqual([]);
  });

  /*
    Proved by putting the fault back rather than trusted. A check of this shape that matched nothing
    would pass just as quietly on the day somebody writes the sentence it exists to catch.
  */
  it('would catch the sentence it exists to catch', () => {
    const bad = [
      "We'll send you a text when we're on the way.",
      'You get a text the day before.',
      'Reminders go out by SMS.',
      'SPEC will text the customer a reminder.',
    ];
    expect(bad.filter(promising)).toHaveLength(bad.length);
  });

  /* And does not accuse the other meaning of the word, which is all over a codebase. */
  it('does not cry wolf over the other meaning of "text"', () => {
    const fine = [
      'Clear its text and save.',
      'SPEC reads CSV, plain text, Word (.docx) and PDF.',
      'not a free-text excuse',
      'await resend.emails.send({ from: FROM, to, subject, html, text });',
      'const body = await res.text();',
      'Save it as a text file.',
    ];
    expect(fine.filter(promising)).toEqual([]);
  });
});
