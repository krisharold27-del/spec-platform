import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { appUrl, ourDomain, isOurs, originFrom } from '../src/lib/origin';

/**
 * The first real payment SPEC ever took finished on the wrong website.
 *
 * The customer signed up on www.specbizhq.com. Stripe charged the card, the webhook landed, the
 * database was correct — and then Checkout returned them to app.specbizhq.com, because every link
 * back was built from APP_URL, a single fixed address. A browser keeps its sign-in per address, so
 * they arrived signed in as somebody else's business and were shown "Payment received" above a page
 * that still said nothing had been charged.
 *
 * Nothing threw, nothing failed, and no existing test could have caught it: they all asked whether
 * the checkout worked, and it did. What nobody asked was where it sent the person afterwards.
 */

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
});

const APP = 'https://app.specbizhq.com';

describe('which part of an address is us', () => {
  it('drops the subdomain, so the other subdomains are ours too', () => {
    expect(ourDomain(APP)).toBe('specbizhq.com');
  });

  it('keeps a bare domain as it is', () => {
    expect(ourDomain('https://specbizhq.com')).toBe('specbizhq.com');
  });

  /*
    The one that would have shipped. "Take the last two labels" is the obvious rule and it turns
    app.specbiz.com.au into `com.au` — at which point every Australian business on the internet
    counts as us, and SPEC is an Australian company selling to Australian businesses.
  */
  it('NEVER reduces an Australian address to com.au', () => {
    expect(ourDomain('https://app.specbiz.com.au')).toBe('specbiz.com.au');
    expect(isOurs('anyone-at-all.com.au', 'https://app.specbiz.com.au')).toBe(false);
  });

  it('answers nothing for an APP_URL that is not an address', () => {
    expect(ourDomain('not-a-url')).toBe(null);
  });
});

describe('addresses SPEC will send a customer back to', () => {
  it('the one the bug was about', () => {
    expect(isOurs('www.specbizhq.com', APP)).toBe(true);
  });

  it('itself, and any other subdomain of ours', () => {
    expect(isOurs('app.specbizhq.com', APP)).toBe(true);
    expect(isOurs('specbizhq.com', APP)).toBe(true);
    expect(isOurs('staging.specbizhq.com', APP)).toBe(true);
  });

  it('this desk, with whatever port', () => {
    expect(isOurs('localhost:3000', APP)).toBe(true);
    expect(isOurs('127.0.0.1:54321', APP)).toBe(true);
  });

  /*
    A Host header is written by whoever makes the request. These are the ways somebody would try to
    turn a return address into a site they own, and the missing leading dot in `endsWith` is how the
    first one gets through.
  */
  it('refuses an address that only looks like ours', () => {
    expect(isOurs('evilspecbizhq.com', APP)).toBe(false);
    expect(isOurs('specbizhq.com.attacker.example', APP)).toBe(false);
    expect(isOurs('attacker.example', APP)).toBe(false);
    expect(isOurs('specbizhq.com.au', APP)).toBe(false);
  });

  it('refuses anything that is not just a host', () => {
    expect(isOurs('www.specbizhq.com/../evil', APP)).toBe(false);
    expect(isOurs('www.specbizhq.com evil.example', APP)).toBe(false);
    expect(isOurs('', APP)).toBe(false);
    expect(isOurs(null, APP)).toBe(false);
  });
});

describe('the address a request came in on', () => {
  it('SENDS SOMEBODY BACK WHERE THEY STARTED', () => {
    const where = originFrom(headers({ 'x-forwarded-host': 'www.specbizhq.com', 'x-forwarded-proto': 'https' }), APP);
    expect(where).toBe('https://www.specbizhq.com');
    expect(`${where}/billing?upgraded=1`).toBe('https://www.specbizhq.com/billing?upgraded=1');
  });

  it('prefers what the proxy says over what the proxy is called', () => {
    // Behind Vercel, `host` is the internal name. Reading it instead is how this breaks quietly.
    expect(originFrom(headers({ 'x-forwarded-host': 'www.specbizhq.com', host: 'internal.vercel' }), APP))
      .toBe('https://www.specbizhq.com');
  });

  it('reads a plain host when there is no proxy', () => {
    expect(originFrom(headers({ host: 'localhost:3000' }), APP)).toBe('http://localhost:3000');
  });

  it('assumes TLS for a real address that did not say', () => {
    expect(originFrom(headers({ host: 'www.specbizhq.com' }), APP)).toBe('https://www.specbizhq.com');
  });

  it('takes the first hop when the proto header is a list', () => {
    expect(originFrom(headers({ host: 'www.specbizhq.com', 'x-forwarded-proto': 'https,http' }), APP))
      .toBe('https://www.specbizhq.com');
  });

  it('falls back to APP_URL rather than trusting a strange address', () => {
    expect(originFrom(headers({ 'x-forwarded-host': 'attacker.example' }), APP)).toBe(APP);
    expect(originFrom(headers({}), APP)).toBe(APP);
  });
});

describe('APP_URL', () => {
  const was = process.env.APP_URL;
  afterEach(() => { if (was === undefined) delete process.env.APP_URL; else process.env.APP_URL = was; });

  it('is the fallback, and this desk when it is not set', () => {
    process.env.APP_URL = 'https://app.specbizhq.com';
    expect(appUrl()).toBe('https://app.specbizhq.com');
    delete process.env.APP_URL;
    expect(appUrl()).toBe('http://localhost:3000');
  });
});

/**
 * Held against the code, not against memory. Every one of these builds a link a customer follows to
 * come back, and the whole fault was that they all used the one fixed address.
 */
describe('the places that send somebody back', () => {
  const reads = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

  /* Written out rather than looped, so counting `it(` in this file gives the number of tests it
     actually runs — docs/READINESS.md publishes that number and a loop makes the two disagree. */
  const usesTheRequest = (file: string) => {
    const src = reads(file);
    expect(src, 'must ask for the current address').toContain('currentOrigin()');
    expect(src, 'must not build a return link from the one fixed address').not.toMatch(/\$\{appUrl\(\)\}/);
  };

  it('the checkout uses the address the request arrived on', () => usesTheRequest('src/app/api/stripe/checkout/route.ts'));
  it('the billing portal does too', () => usesTheRequest('src/app/api/stripe/portal/route.ts'));

  it('the checkout returns to that address, both ways out of Stripe', () => {
    const src = reads('src/app/api/stripe/checkout/route.ts');
    expect(src).toContain('success_url: `${here}/billing?upgraded=1`');
    expect(src).toContain('cancel_url: `${here}/billing?upgrade_cancelled=1`');
  });

  it('a seat invitation lands on the address it was sent from', () => {
    expect(reads('src/lib/email.ts')).toContain('seatUrl(await currentOrigin()');
  });

  it('a copied seat link does too', () => {
    expect(reads('src/app/setup/business/page.tsx')).toContain('await currentOrigin()');
  });

  it('a sign-in link comes back to where it was asked for', () => {
    expect(reads('src/lib/auth.ts')).toContain('signInUrl(here,');
  });

  /*
    The banner is the belt to that braces. `?upgraded=1` is a word in an address bar: it proves a
    checkout finished somewhere, never that THIS business paid.
  */
  it('the payment banner is only cheerful when the business really is subscribed', () => {
    const src = reads('src/app/billing/page.tsx');
    expect(src).toContain("flag === 'upgraded' && !plan.subscribed");
    expect(src).toContain('nothing is recorded against');
  });
});
