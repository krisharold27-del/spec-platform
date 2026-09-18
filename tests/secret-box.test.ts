import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seal, open, sameSecret, canHoldSecrets } from '../src/lib/secret-box';

/**
 * Holding somebody else's credential.
 *
 * A Xero refresh token is sixty days of read access to a business's accounts. It is the first thing
 * in this product that is genuinely dangerous at rest, and unlike a password the customer cannot do
 * anything about a leak because they never knew it existed.
 */

const KEY = 'a'.repeat(48);
let previous: string | undefined;

beforeEach(() => { previous = process.env.TOKEN_ENCRYPTION_KEY; process.env.TOKEN_ENCRYPTION_KEY = KEY; });
afterEach(() => { if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY; else process.env.TOKEN_ENCRYPTION_KEY = previous; });

describe('sealing a credential', () => {
  it('comes back out the way it went in', () => {
    const token = 'xero-refresh-token-value';
    expect(open(seal(token))).toBe(token);
  });

  it('THE PLAINTEXT IS NOWHERE IN THE STORED STRING', () => {
    // The whole point. A stolen dump must not be a stolen set of accounts.
    const sealed = seal('very-secret-refresh-token');
    expect(sealed).not.toContain('very-secret');
    expect(sealed).not.toContain('refresh-token');
  });

  it('SEALS THE SAME VALUE DIFFERENTLY EVERY TIME', () => {
    /*
      A fresh random IV per seal. Without it, two businesses that happen to hold the same value have
      identical rows — which tells somebody reading the database something they should not learn.
    */
    expect(seal('same')).not.toBe(seal('same'));
  });

  it('REFUSES A MODIFIED CIPHERTEXT rather than returning rubbish', () => {
    /*
      Authenticated encryption, and the reason it matters here: the plaintext is used to make a
      request. Silently decrypting to the wrong bytes would produce a confusing 401 from Xero
      instead of a clear refusal from us.
    */
    const sealed = seal('token');
    const [v, iv, tag, body] = sealed.split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 0xff;
    expect(() => open([v, iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });

  it('refuses a value it did not write', () => {
    expect(() => open('not-ours')).toThrow(/not in a format SPEC wrote/);
    expect(() => open('v1.a.b')).toThrow();
    expect(() => open('v2.a.b.c')).toThrow(/not in a format SPEC wrote/);
  });

  it('cannot be opened with a different key', () => {
    const sealed = seal('token');
    process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(48);
    expect(() => open(sealed)).toThrow();
  });

  it('THROWS rather than returning null when it cannot read one', () => {
    /*
      A null would be threaded through as "nothing is connected", and the business would be told its
      connection is missing when the truth is that its credential cannot be read. Two different
      problems with two different fixes, and only one of them is the customer's.
    */
    expect(() => open('v1.a.b.c')).toThrow();
  });
});

describe('refusing to store anything without a key', () => {
  it('will not seal when the key is missing', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(() => seal('token')).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it('nor when it is too short to be a real secret', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'short';
    expect(() => seal('token')).toThrow(/at least 32/);
  });

  it('AND SAYS SO BEFORE OFFERING TO CONNECT ANYTHING', () => {
    // Asked up front, so a deployment that cannot hold a credential never invites somebody to make
    // one. Finding out at the callback means the customer has already granted access to Xero.
    expect(canHoldSecrets()).toBe(true);
    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(canHoldSecrets()).toBe(false);
    process.env.TOKEN_ENCRYPTION_KEY = 'short';
    expect(canHoldSecrets()).toBe(false);
  });
});

describe('comparing a secret', () => {
  it('matches what it should and not what it should not', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abc', 'abd')).toBe(false);
    expect(sameSecret('abc', 'abcd')).toBe(false);
    expect(sameSecret('', '')).toBe(true);
  });
});
