import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mayDetach, DETACH_SAID, type StripeFacts, type DetachRefusal } from '../src/lib/detach-stripe';

/**
 * Taking the Stripe marks off a business.
 *
 * Kris, 17 September: *"yes build the admin control to clear hall contracting"*.
 *
 * This opens a door in the strongest guard SPEC has — `deleteBusiness` refuses outright for any
 * business Stripe has ever heard of — so the door needs more checking than the wall did.
 *
 * Every case below is a way somebody could lose a real customer's records. The decision is pure on
 * purpose: the combinations that matter are the ones nobody has a Stripe account shaped like.
 */

const facts = (over: Partial<StripeFacts> = {}): StripeFacts => ({
  mode: 'live',
  found: false,
  subscriptions: [],
  paidLive: false,
  ...over,
});

/**
 * The file with its comments taken out.
 *
 * Every check below that reads the source reads THIS. Four separate times on 17 September I wrote a
 * check that matched the English explaining a thing rather than the code doing it — including one
 * that failed on the comment describing the very bug it was guarding. Prose is not behaviour.
 */
const code = (f: string) =>
  readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const refusedAs = (f: StripeFacts): DetachRefusal | 'ALLOWED' => {
  const v = mayDetach(f);
  return v.ok ? 'ALLOWED' : v.refusal;
};

describe('the case this was built for', () => {
  it('ALLOWS a test-mode leftover once SPEC is holding a live key', () => {
    /*
      Hall Contracting. It went through Stripe in TEST mode months ago, so the row carries a customer
      id — and `deleteBusiness` refuses on sight, which is correct and left it stuck on the live
      admin list for ever.

      Once SPEC holds a LIVE key, Stripe looks in the only place real money can be and says it has
      never heard of that customer. That is not an assertion by whoever pressed the button; it is
      Stripe's answer.
    */
    expect(refusedAs(facts({ mode: 'live', found: false }))).toBe('ALLOWED');
  });

  it('and a cancelled test subscription Stripe can still see', () => {
    // The other shape of the same thing: test keys still in, so Stripe finds it, and it is over.
    expect(refusedAs(facts({ mode: 'test', found: true, subscriptions: ['canceled'] }))).toBe('ALLOWED');
  });
});

describe('what it must never allow', () => {
  it('NEVER A BUSINESS THAT HAS ACTUALLY PAID', () => {
    // Settled money in live mode outranks everything else in the function, including a cancellation.
    expect(refusedAs(facts({ found: true, paidLive: true, subscriptions: ['canceled'] }))).toBe('has_really_paid');
    expect(refusedAs(facts({ mode: 'test', found: true, paidLive: true }))).toBe('has_really_paid');
  });

  it('NEVER ONE STILL SUBSCRIBED, in any of the states that mean "running"', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']) {
      expect(refusedAs(facts({ found: true, subscriptions: [status] })), status).toBe('still_subscribed');
    }
  });

  it('and one running subscription among several finished ones is still a customer', () => {
    expect(refusedAs(facts({ found: true, subscriptions: ['canceled', 'canceled', 'active'] })))
      .toBe('still_subscribed');
  });

  it('THE ONE THAT IS EASY TO GET BACKWARDS: not-found on a TEST key', () => {
    /*
      The mistake this whole file exists to avoid.

      A test-mode key cannot see live customers. So "Stripe has never heard of them" is EXACTLY what
      a real, paying, live customer looks like when SPEC is holding test keys. Reading that as "safe
      to clear" would delete the records of the first business ever to pay.
    */
    expect(refusedAs(facts({ mode: 'test', found: false }))).toBe('cannot_see_live');
  });

  it('never when Stripe did not answer', () => {
    // Not knowing is not a yes. This is the one situation where carrying on is indefensible.
    expect(refusedAs(facts({ unreachable: true }))).toBe('unreachable');
    // Even when everything else looks clear.
    expect(refusedAs(facts({ mode: 'live', found: false, unreachable: true }))).toBe('unreachable');
  });

  it('never when there is no Stripe key to ask with', () => {
    expect(refusedAs(facts({ mode: null }))).toBe('not_configured');
    // And an unset key outranks a hopeful-looking answer.
    expect(refusedAs(facts({ mode: null, found: false }))).toBe('not_configured');
  });
});

describe('the shape of the rule', () => {
  it('says no by listing reasons, and yes exactly once', () => {
    /*
      A function shaped "return true unless…" grows a hole every time somebody adds a case and
      forgets one. This one has a single `return { ok: true }` and everything else is a refusal, so
      a new case that is not handled falls through to allowed only if somebody deliberately puts it
      after that line.
    */
    const src = code('src/lib/detach-stripe.ts');
    const rule = src.slice(src.indexOf('export function mayDetach'), src.indexOf('export const DETACH_SAID'));
    // One way to say yes. Counted as a RETURN, not as the type signature, which also says ok: true.
    expect((rule.match(/return \{ ok: true \}/g) ?? []).length).toBe(1);
    // And it is the last thing in the function: a new unhandled case falls through to a refusal.
    expect(rule.lastIndexOf('return { ok: true }')).toBeGreaterThan(rule.lastIndexOf('refusal:'));
  });

  it('every refusal has words a person can act on', () => {
    const refusals: DetachRefusal[] = [
      'no_marks', 'not_configured', 'unreachable', 'still_subscribed',
      'has_really_paid', 'cannot_see_live', 'name_mismatch', 'own_business', 'not_found',
    ];
    for (const r of refusals) {
      expect(DETACH_SAID[r], r).toBeTruthy();
      expect(DETACH_SAID[r].length, `${r} is too short to help`).toBeGreaterThan(40);
    }
  });

  it('and every refusal that changed nothing says so', () => {
    // The fear on this screen is "did I just break something". Answering it is most of the message.
    for (const r of ['not_configured', 'unreachable', 'still_subscribed', 'has_really_paid'] as DetachRefusal[]) {
      expect(DETACH_SAID[r].toLowerCase(), r).toContain('nothing was changed');
    }
  });
});

describe('it is a separate act from deleting, not a way past the guard', () => {
  const src = code('src/lib/detach-stripe.ts');

  it('DOES NOT DELETE ANYTHING', () => {
    // It clears two columns. Everything else about the business is untouched, and the ordinary
    // delete — with the typed name, the not-your-own, the orphan check — still has to be run after.
    expect(src).not.toContain('deleteBusiness');
    expect(src).not.toMatch(/delete from/i);
    expect(src).toContain('stripeCustomerId: null');
    expect(src).toContain('stripeSubscriptionId: null');
  });

  it('asks for the name to be typed, exactly, like the delete does', () => {
    expect(src).toContain("marks.name.trim() !== typedName.trim()");
  });

  it('and never the business you are signed into', () => {
    expect(src).toContain("tenantId === signedIntoTenantId");
  });

  it('checks Stripe BEFORE it writes, never after', () => {
    const body = src.slice(src.indexOf('export async function detachFromStripe'));
    expect(body.indexOf('stripeFactsFor')).toBeLessThan(body.indexOf('db\n    .update'));
  });
});
