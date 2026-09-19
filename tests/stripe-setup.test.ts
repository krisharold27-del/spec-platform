import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  SEAT_PRICES, digitRoot, RULE_OF_EIGHT, STRIPE_PRICES, STRIPE_PRODUCTS,
  ARCHIVED_STRIPE_PRODUCTS,
} from '../src/lib/pricing';

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
    /*
      ── A setting is something read off the ENVIRONMENT ─────────────────────────────────────

      This used to scan for `/STRIPE_[A-Z_]+/` anywhere in the source, which was fine while every
      such name was a variable. Kris's Stripe handoff of 19 September put the price ids into the
      code — `STRIPE_PRICES`, `STRIPE_PRODUCTS`, `STRIPE_TAX_CODE` in lib/pricing — and the old
      pattern read all three as things somebody had to go and set in Vercel.

      That is the failure mode this whole file exists to prevent, arriving from the other
      direction: a setup list demanding four settings that do not exist teaches the reader the
      list is approximate, and then they skim the one that matters. So it matches `process.env.X`
      only.
    */
    const inCode = new Set<string>();
    for (const file of walk('src')) {
      for (const m of src(file).matchAll(/process\.env\.(STRIPE_[A-Z_]+)/g)) inCode.add(m[1]);
      // `priceId('leader_basic', 'STRIPE_PRICE_SEAT_MONTHLY')` reads the environment too — the
      // name arrives as a string, and a check that missed it would miss the override entirely.
      for (const m of src(file).matchAll(/'(STRIPE_PRICE_[A-Z_]+)'/g)) inCode.add(m[1]);
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
    /*
      The table holds only what somebody MUST set. The four price overrides are read if present and
      ignored otherwise, so listing them as rows would be asking for four settings a live
      deployment does not want — they are named in the paragraph under the table instead, which is
      why this counts rows rather than mentions.
    */
    const rows = table.split('\n').filter(l => l.startsWith('|') && /`STRIPE_/.test(l));
    expect(rows.length, 'two settings, one row each').toBe(2);
  });

  /*
    The six prices, to the cent.

    checkout.ts matches on currency AND the exact amount, so a price typed into Stripe that differs
    from lib/pricing is never charged — it silently falls back to AUD and logs. Safe, and invisible.
    The table in the document is the only place those numbers are transcribed by a human.
  */
  it('states every published price exactly as the product charges it', () => {
    for (const [currency, price] of Object.entries(SEAT_PRICES)) {
      /*
        All four now, in the order the table prints them. Design 15 turned one seat into two and the
        row from two numbers into four — a check that still read the first column would have passed
        on a document whose other three were anything at all.
      */
      const row = new RegExp(
        `\\|\\s*${currency.toUpperCase()}\\s*\\|\\s*${price.leadership}\\s*\\|\\s*${price.leadershipWithAi}`
        + `\\s*\\|\\s*${price.team}\\s*\\|\\s*${price.teamWithAi}\\s*\\|`, 'i');
      expect(doc, `${currency.toUpperCase()} should read ${price.leadership} ${price.leadershipWithAi} ${price.team} ${price.teamWithAi}`).toMatch(row);
    }
  });

  /*
    ── And the document has to say what happened to the rule of 8 ─────────────────────────────

    It used to assert that every published price reduces to 8. Sixteen of the twenty-four no longer
    do — the live account carries 227 and 29 and the rest — and lib/pricing records the survivors
    in `RULE_OF_EIGHT`.

    Deleting this test was the easy edit. What it checks now is that the document does not quietly
    go on claiming a rule the prices stopped obeying, because that page is what somebody reads
    before typing a price into Stripe by hand.
  */
  it('says which prices still obey the rule of 8, rather than claiming they all do', () => {
    expect(doc, 'the setup list still claims every price reduces to 8')
      .not.toMatch(/every (published )?price[^.]*reduces to 8/i);
    expect(doc, 'and does not say where the rule now stands').toContain('RULE_OF_EIGHT');
    for (const amount of RULE_OF_EIGHT) {
      expect(doc, `${amount} obeys the rule and the document does not name it`)
        .toContain(String(amount));
      expect(digitRoot(amount)).toBe(8);
    }
  });

  /*
    The live price and product ids, exactly as lib/pricing holds them.

    They are transcribed by hand in both places from one handoff document, and a wrong character in
    either is a checkout that charges the wrong product or fails outright. This is the only check
    that the two transcriptions agree.
  */
  it('states every live Stripe id exactly as the code holds it', () => {
    for (const [key, id] of Object.entries(STRIPE_PRICES)) {
      expect(doc, `the ${key} price id is not in the setup list`).toContain(id);
    }
    for (const [key, id] of Object.entries(STRIPE_PRODUCTS)) {
      expect(doc, `the ${key} product id is not in the setup list`).toContain(id);
    }
    // And the archived ones, so nobody re-creates a product that already exists, hidden.
    for (const id of Object.keys(ARCHIVED_STRIPE_PRODUCTS)) {
      expect(doc, `archived product ${id} is not listed as archived`).toContain(id);
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
