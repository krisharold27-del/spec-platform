import { describe, it, expect } from 'vitest';
import {
  newSeatToken, seatTokenExpiry, checkSeatToken, seatUrl,
  SEAT_TOKEN_DAYS, SEAT_REFUSAL_MESSAGE, type SeatRow,
} from '../src/lib/seat';

/**
 * "Take your seat" — single use, expiring, bound to that address.
 *
 * All three are stated in the engine (designs/the-rules.md §11) and none of them were true: the
 * invitation was a bare link to /signin. Anybody who saw the email could follow it, it never
 * stopped working, and it proved nothing about who was holding it.
 */

const row = (over: Partial<SeatRow> = {}): SeatRow => ({
  seatToken: 'a-real-token',
  seatTokenExpires: '2026-09-20T00:00:00.000Z',
  acceptedAt: null,
  ...over,
});

const before = new Date('2026-09-15T00:00:00.000Z');
const after = new Date('2026-09-25T00:00:00.000Z');

describe('a seat link is good once, for a week, for one person', () => {
  it('accepts the right token inside the window', () => {
    expect(checkSeatToken(row(), 'a-real-token', before)).toBe(true);
  });

  // Single use. The most important of the three: an email is forwarded, printed and left open.
  it('refuses a seat that has already been taken', () => {
    expect(checkSeatToken(row({ acceptedAt: '2026-09-16T00:00:00.000Z' }), 'a-real-token', before)).toBe('taken');
  });

  it('refuses it after the week is up', () => {
    expect(checkSeatToken(row(), 'a-real-token', after)).toBe('expired');
  });

  it('refuses a token that is not the one on the seat', () => {
    expect(checkSeatToken(row(), 'not-that-token', before)).toBe('unknown');
  });

  it('refuses a seat that was never invited, and an absent person', () => {
    expect(checkSeatToken(row({ seatToken: null }), 'anything', before)).toBe('unknown');
    expect(checkSeatToken(null, 'anything', before)).toBe('unknown');
  });

  /**
   * Taken outranks expired.
   *
   * A person whose seat was taken last month should be told it was taken, not that their link is
   * old — the first sentence sends them to sign in, and the second sends them to ask for another
   * invitation they do not need.
   */
  it('says taken rather than expired when both are true', () => {
    expect(checkSeatToken(row({ acceptedAt: '2026-09-16T00:00:00.000Z' }), 'a-real-token', after)).toBe('taken');
  });

  // A token of a different length must not throw — timingSafeEqual requires equal lengths.
  it('survives a token of the wrong length instead of crashing', () => {
    expect(checkSeatToken(row(), 'short', before)).toBe('unknown');
    expect(checkSeatToken(row(), '', before)).toBe('unknown');
  });

  it('expires exactly on the boundary rather than a moment after', () => {
    const at = new Date('2026-09-20T00:00:00.000Z');
    expect(checkSeatToken(row(), 'a-real-token', at)).toBe('expired');
  });
});

describe('the token itself', () => {
  it('is long enough that guessing is not a strategy', () => {
    const token = newSeatToken();
    expect(token.length).toBeGreaterThanOrEqual(43);   // 256 bits, base64url
    expect(token).not.toMatch(/[^A-Za-z0-9_-]/);
  });

  it('is different every time', () => {
    const many = new Set(Array.from({ length: 200 }, newSeatToken));
    expect(many.size).toBe(200);
  });

  it('lasts a week from when it was made', () => {
    const made = new Date('2026-09-13T09:00:00.000Z');
    const expires = new Date(seatTokenExpiry(made));
    expect((expires.getTime() - made.getTime()) / 86_400_000).toBe(SEAT_TOKEN_DAYS);
  });
});

describe('what the person is told', () => {
  /**
   * Never "invalid token". Somebody who has just been added to a business and cannot get in is
   * already unsure whether they were meant to be there; a phrase from a log file is the worst
   * possible thing to show them.
   */
  it('explains each refusal in their own terms, with a way forward', () => {
    for (const [why, message] of Object.entries(SEAT_REFUSAL_MESSAGE)) {
      expect(message, why).not.toMatch(/token|invalid|error|401|403/i);
      expect(message.length, why).toBeGreaterThan(40);
    }
    expect(SEAT_REFUSAL_MESSAGE.taken).toContain('sign in');
    expect(SEAT_REFUSAL_MESSAGE.expired).toContain(String(SEAT_TOKEN_DAYS));
  });
});

describe('the link in the email', () => {
  it('carries the token and survives an app url with a trailing slash', () => {
    expect(seatUrl('https://spec.example.com/', 'abc123')).toBe('https://spec.example.com/seat?t=abc123');
  });

  it('escapes a token so it cannot break out of the query string', () => {
    expect(seatUrl('https://x.test', 'a+b/c=')).toBe('https://x.test/seat?t=a%2Bb%2Fc%3D');
  });
});
