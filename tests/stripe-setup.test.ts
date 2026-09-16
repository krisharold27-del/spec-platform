import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { SEAT_PRICES, digitRoot, type Currency } from '../src/lib/pricing';

/*
  ── The setup document has to be true, not just written ──────────────────────────────────────────

  docs/STRIPE_SETUP.md is a list of things Kris types into Stripe and Vercel by hand, once, on the
  day SPEC starts charging people. Nothing in the product can check his work afterwards: a wrong
  variable name reads exactly like billing being switched off, which is a state the product handles
  gracefully and reports calmly.

  It had already gone wrong. The old checklist said `STRIPE_PRICE_BASIC_ANNUAL` and the code reads
  `STRIPE_PRICE_SEAT_MONTHLY`. Following it would have produced a deployment where
  `billingConfigured()` returned false, checkout redirected to `?billing_error=1`, and nothing
  anywhere said why — on the one day that matters.

  So the parts that are FACTS are held to the code: the variable names, the prices, the webhook
  events. The judgement — what to do first, what to watch for — is prose and stays prose.
*/

const doc = readFileSync('docs/STRIPE_SETUP.md', 'utf8');
const src = (p: string) => readFileSync(p, 'utf8');

describe('the Stripe setup list matches the code', () => {
  /*
    Every variable the code reads has to be named, and no variable it does not read may be named.

    The second half matters as much as the first. The old checklist asked for a publishable key,
    which this product has never used — SPEC uses Stripe's hosted Checkout and never renders a card
    field. An instruction to set something that does nothing teaches somebody that the list is
    approximate, and then they skim the one that matters.
  */
  it('names every setting the code reads, and nothing it does not', () => {
    const inCode = new Set<string>();
    for (const file of walk('src')) {
      for (const m of src(file).matchAll(/STRIPE_[A-Z_]+/g)) inCode.add(m[0]);
    }
    expect(inCode.size, 'no Stripe settings found in the source at all').toBeGreaterThan(0);

    for (const name of inCode) {
      expect(doc, `${name} is read by the code and missing from the setup list`).toContain(name);
    }

    /*
      "Nothing it does not" is checked against the TABLE — the list of things the document tells him
      to go and set — rather than against every mention in the prose.

      The document deliberately names `STRIPE_PRICE_BASIC_ANNUAL` in the paragraph explaining why
      the old checklist was wrong, and that paragraph is the most useful thing on the page. A rule
      that cannot tell "set this" from "this is what went wrong last time" would force the warning
      to be deleted to make the test pass, which is precisely backwards.
    */
    const table = doc.slice(doc.indexOf('| Setting |'), doc.indexOf('## 1. The account'));
    expect(table, 'the settings table has moved or gone').toContain('STRIPE_SECRET_KEY');
    for (const m of table.matchAll(/STRIPE_[A-Z_]+/g)) {
      expect(inCode, `the setup list tells him to set ${m[0]}, which nothing reads`).toContain(m[0]);
    }
    expect([...table.matchAll(/`STRIPE_[A-Z_]+`/g)].length, 'every setting is a row of its own')
      .toBe(inCode.size);
  });

  /*
    The six prices, to the cent.

    checkout.ts matches on currency AND the exact amount, so a price typed into Stripe that differs
    from lib/pricing is never charged — it silently falls back to AUD and logs. Safe, and invisible.
    The table in the document is the only place those numbers are transcribed by a human.
  */
  it('states every published price exactly as the product charges it', () => {
    for (const [currency, price] of Object.entries(SEAT_PRICES) as [Currency, { seat: number }][]) {
      const row = new RegExp(`\\|\\s*${currency.toUpperCase()}\\s*\\|\\s*${price.seat}\\s*\\|`, 'i');
      expect(doc, `${currency.toUpperCase()} should be ${price.seat}`).toMatch(row);
    }
  });

  /* And the rule those numbers obey, so a seventh region is not invented carelessly. */
  it('every published price still reduces to 8', () => {
    for (const [currency, price] of Object.entries(SEAT_PRICES) as [Currency, { seat: number }][]) {
      expect(digitRoot(price.seat), currency).toBe(8);
    }
  });

  /*
    The three webhook events, which is the step that costs a customer if it is wrong.

    Without the endpoint, or with the wrong events, somebody pays and NOTHING in SPEC changes. They
    are charged and still locked out, and the first person to find out is them.
  */
  it('names exactly the webhook events the handler acts on', () => {
    const handler = src('src/app/api/stripe/webhook/route.ts');
    const handled = [...handler.matchAll(/case '([a-z_.]+)':/g)].map(m => m[1]);
    expect(handled.length, 'the webhook handles nothing').toBeGreaterThanOrEqual(3);

    for (const event of handled) {
      expect(doc, `the webhook acts on ${event} and the list does not ask for it`).toContain(event);
    }
    // And no extras: the handler ignores everything else, so asking for more is noise somebody
    // has to decide whether to trust.
    for (const m of doc.matchAll(/`(checkout|invoice|customer)\.[a-z_.]+`/g)) {
      const event = m[0].replace(/`/g, '');
      expect(handled, `the list asks for ${event}, which the handler ignores`).toContain(event);
    }
  });

  it('points at the webhook route that exists', () => {
    expect(doc).toContain('/api/stripe/webhook');
    expect(() => src('src/app/api/stripe/webhook/route.ts')).not.toThrow();
    expect(() => src('src/app/api/stripe/checkout/route.ts')).not.toThrow();
    expect(() => src('src/app/api/stripe/portal/route.ts')).not.toThrow();
  });

  /* A business with nobody in it is never billed, and the document has to say so. */
  it('says a business with nobody in it is never billed', () => {
    expect(src('src/app/api/stripe/checkout/route.ts')).toContain('nothing_to_bill');
    expect(doc).toContain('nothing_to_bill');
  });

  /*
    ── The first customer gets no exception, and the document must not offer one ──────────────────

    An earlier version of this test asserted the OPPOSITE: that the document warned JBI was on a
    free beta. Kris reversed it — *"i will pay for JBI and use it as a complete test case — don't
    modify"* — and the reversal is the stronger decision, which is why the test now guards the other
    direction rather than simply being deleted.

    A customer who is not billed never tests billing. The checkout, the webhook, the seat count, the
    invoice, the card that expires in eleven months: on a free arrangement every one of those stays
    unexercised until a stranger walks it. Running the first real business at full price is what
    makes it a test case rather than a demo.

    So the document may not tell anybody to flag, exempt or discount the first customer. There is no
    such branch in the code and there must be no such instruction in the instructions.
  */
  it('offers the first customer no exception, because that is what makes it a test', () => {
    expect(doc).toContain('like any other customer');
    for (const escape of [
      'put them on the free beta',
      'shows them as beta',
      'will not be billed',
    ]) {
      expect(doc.toLowerCase(), `the setup list still says "${escape}"`).not.toContain(escape);
    }
  });

  /* And no tenant may be special-cased anywhere in the shipping code, whatever a document says. */
  it('has no customer hardcoded in the product', () => {
    for (const file of walk('src')) {
      const body = src(file);
      // Comments may name the business the product was built around. Code may not branch on it.
      const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${file} branches on a named customer`).not.toMatch(/['"`]jbi/i);
    }
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
