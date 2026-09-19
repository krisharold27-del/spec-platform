import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGES, PACKAGE_KEYS, SEAT_PRICES, everyPublishedSeatPrice } from '../src/lib/pricing';

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

  it('EVERY PACKAGE PRICE REDUCES TO 8', () => {
    for (const k of PACKAGE_KEYS) {
      expect(digitSum(PACKAGES[k].aud), `${k} is A$${PACKAGES[k].aud}`).toBe(8);
    }
  });

  it('and every seat price in every currency', () => {
    for (const [currency, p] of Object.entries(SEAT_PRICES)) {
      for (const amount of everyPublishedSeatPrice(p)) {
        expect(digitSum(amount), `${currency} publishes ${amount}`).toBe(8);
      }
    }
  });

  it('INCLUDING THE TRAINING PRICE, which is 1502 and not the 1,007 the design still draws', () => {
    // A$1,007 → A$1,502 on 18 September. 1+5+0+2 = 8; 1500 would be 6.
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

  it('THE CONSULTING PRICE IS NOT', () => {
    /*
      Not secrecy and not negotiability — it is fixed, and /admin shows it to whoever sets a business
      up. It is about order: a five-figure monthly number read before anybody has explained what a
      full day a week buys ends the conversation rather than starting it.
    */
    expect(PACKAGES.full_control.publishPrice).toBe(false);
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
