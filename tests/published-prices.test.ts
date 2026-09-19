import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PACKAGES, PACKAGE_KEYS, SEAT_PRICES, RULE_OF_EIGHT, pricesObeyingTheRule,
} from '../src/lib/pricing';

/**
 * The rules about money that a page may say out loud.
 *
 * Kris, 18 September, setting the three tiers: show the seat price, show the training price, and
 * **do not show the consulting price** — *"At this level people buy trust, not a price tag."* Plus
 * a standing rule: never an hourly rate anywhere, only a total and what is in the box.
 *
 * None of this was written down as a rule before today. It was true, and true is not the same as
 * enforced: the consulting price was published on /pricing until this morning, put there in good
 * faith by somebody (me) who had no way to know it should not be.
 */

const SRC = join(process.cwd(), 'src');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
};
/** Source with comments stripped — a rule about what a PAGE says is not about what a note explains. */
const code = (p: string) =>
  readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the rule of 8, on every published figure', () => {
  const digitSum = (n: number): number => (n < 10 ? n : digitSum(String(n).split('').reduce((a, d) => a + Number(d), 0)));

  /*
    ── The two package prices that are left still obey it ───────────────────────────────────────

    Four packages, two of which now have no AUD figure of their own to check: `seat_training` is
    the AI seat at A$227, which Stripe carries and which does not reduce to 8, and `full_control`
    is quote-only with no price at all.

    So this checks the ones that DO have a number and are not seat prices — the plain leadership
    seat and Training — and `tests/pricing.test.ts` holds the seat table to its recorded set of
    exceptions. Between them nothing is unchecked.
  */
  it('EVERY PACKAGE PRICE THAT IS STILL A CHOSEN NUMBER REDUCES TO 8', () => {
    for (const k of PACKAGE_KEYS) {
      const aud = PACKAGES[k].aud;
      if (aud === null) continue;                       // quote-only: there is nothing to check
      if (aud === SEAT_PRICES.aud.leadershipWithAi) continue;  // Stripe's 227 — see RULE_OF_EIGHT
      expect(digitSum(aud), `${k} is A$${aud}`).toBe(8);
    }
  });

  /*
    ── And the seat table's exceptions are the recorded ones ────────────────────────────────────

    This used to read "and every seat price in every currency". Sixteen of the twenty-four no
    longer reduce to 8 — the Stripe handoff of 19 September — so the check that still bites is
    that the set of survivors is EXACTLY `RULE_OF_EIGHT`. Deleting the rule would have been the
    easy edit and would have left nothing at all guarding the next price.
  */
  it('and the seat prices obey it in exactly the places on record', () => {
    expect(pricesObeyingTheRule()).toEqual([...RULE_OF_EIGHT]);
    for (const amount of RULE_OF_EIGHT) expect(digitSum(amount), `${amount}`).toBe(8);
  });

  it('INCLUDING THE TRAINING PRICE, which is 1502 and not the 1,007 the old design drew', () => {
    // A$1,007 → A$1,502 on 18 September, live in Stripe on 19 September. 1+5+0+2 = 8; 1500 is 6.
    expect(PACKAGES.sessions.aud).toBe(1502);
    expect(digitSum(1500)).not.toBe(8);
  });
});

describe('which prices may be said out loud', () => {
  it('the seat and the training price are published', () => {
    expect(PACKAGES.seat.publishPrice).toBe(true);
    expect(PACKAGES.seat_training.publishPrice).toBe(true);
    expect(PACKAGES.sessions.publishPrice).toBe(true);
  });

  /*
    ── And the consulting price is not merely unpublished, it is gone ───────────────────────────

    It used to be A$20,888 with `publishPrice: false`, which kept it off the marketing page and
    printed it on /admin. Kris's Stripe handoff of 19 September archives the product — *"Not part
    of the current offer"* — and makes consulting quote-only: *"'Speak to us'. No Stripe product.
    Internal reference rate $500/hr is never shown to customers."*

    Null rather than a hidden number, because "hidden" only ever held on the pages somebody
    remembered to check.
  */
  it('THE CONSULTING PRICE IS NOT — there is no longer one to print', () => {
    expect(PACKAGES.full_control.publishPrice).toBe(false);
    expect(PACKAGES.full_control.aud).toBeNull();
  });

  /* The internal A$500/hr reference must not reach the source at all. It is not a price SPEC
     charges, it is the number behind a quote, and the hourly-rate ban below would not catch it
     written as a bare 500. */
  it('AND THE INTERNAL HOURLY REFERENCE IS NOWHERE IN THE SOURCE', () => {
    for (const file of walk(SRC)) {
      expect(readFileSync(file, 'utf8'), `${file.replace(SRC, 'src')} names the internal rate`)
        .not.toMatch(/\$\s?500\s*(?:\/|per\s+|an\s+)\s*h(?:ou)?r/i);
    }
  });

  it('and the public pricing page never prints it', () => {
    const page = code(join(SRC, 'app/pricing/page.tsx'));
    expect(page, 'the consulting price is on the public page again').not.toMatch(/20,?888/);
    // It shows the invitation instead.
    expect(page).toContain('Let&apos;s talk');
  });

  it('nor does any other page a stranger can open', () => {
    const publicPages = ['app/page.tsx', 'app/pricing/page.tsx', 'app/sectors/page.tsx', 'app/how/page.tsx', 'app/terms/page.tsx', 'app/privacy/page.tsx'];
    for (const rel of publicPages) {
      const p = join(SRC, rel);
      try {
        expect(code(p), `${rel} publishes the consulting price`).not.toMatch(/20,?888/);
      } catch (e) {
        if ((e as { code?: string }).code !== 'ENOENT') throw e;
      }
    }
  });
});

describe('never an hourly rate, anywhere', () => {
  /*
    Kris's standing rule: a total and what is in the box, never a rate per hour. An hourly rate
    invites the customer to audit the hours instead of the outcome, and it is the frame the training
    price was just moved AWAY from — A$1,007 for four sessions read as A$250 an hour, which is what
    a freelancer costs rather than what this is.
  */
  it('NO PAGE QUOTES A PRICE PER HOUR', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = code(file);
      // A currency figure followed by a per-hour phrase, in either order.
      const m = src.match(/(?:A\$|NZ\$|US\$|CA\$|£|€)\s?[\d,]+\s*(?:\/|per\s+|an\s+)h(?:ou)?r|\bh(?:ou)?rly rate of\b/i);
      if (m) offenders.push(`${file.replace(SRC, 'src')}: ${m[0]}`);
    }
    expect(offenders, offenders.join(' | ')).toEqual([]);
  });

  it('and the training package is described by its sessions, not by an hour', () => {
    expect(PACKAGES.sessions.what).toMatch(/four one-to-one sessions/i);
    expect(PACKAGES.sessions.what).not.toMatch(/\bper hour\b|\ban hour\b/i);
  });
});
