/**
 * "Take your seat" — the one email an invited person acts on.
 *
 * The engine is specific about what this link has to be: **single use, expiring, bound to that
 * address** (designs/the-rules.md §11). The invitation used to be a bare link to `/signin`, which
 * is none of those three — anybody who saw the email could follow it, it never stopped working, and
 * it proved nothing about who was holding it.
 *
 * The pure half lives here so the rules can be tested without a database or a clock.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Long enough that guessing is not a strategy.
 *
 * 256 bits, base64url, the same shape as the look-around token — a seat is the more valuable of
 * the two, so it should certainly not be weaker.
 */
export const newSeatToken = () => randomBytes(32).toString('base64url');

/**
 * A week.
 *
 * Long enough that somebody invited on a Friday can take their seat after the weekend, and short
 * enough that a forwarded email from three months ago is not still a way in. An expired invitation
 * is not a dead end: it says so and offers a new one.
 */
export const SEAT_TOKEN_DAYS = 7;

export const seatTokenExpiry = (now = new Date()): string =>
  new Date(now.getTime() + SEAT_TOKEN_DAYS * 86_400_000).toISOString();

/** Why a seat link did not work — each answer gets its own sentence on the screen. */
export type SeatRefusal = 'unknown' | 'expired' | 'taken';

export interface SeatRow {
  seatToken: string | null;
  seatTokenExpires: string | null;
  acceptedAt: string | null;
}

/**
 * Is this link still good?
 *
 * Compared in constant time. The comparison is against a secret, and a plain `===` leaks how much
 * of a guess was right through how long the check took — a small leak, and a free one to close.
 */
export function checkSeatToken(row: SeatRow | null, presented: string, now = new Date()): true | SeatRefusal {
  if (!row || !row.seatToken) return 'unknown';

  const a = Buffer.from(row.seatToken);
  const b = Buffer.from(presented);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'unknown';

  // Single use: a seat already taken cannot be taken again, even inside the week.
  if (row.acceptedAt) return 'taken';
  if (!row.seatTokenExpires || new Date(row.seatTokenExpires).getTime() <= now.getTime()) return 'expired';
  return true;
}

/** What the person is told, in their own terms — never "invalid token". */
export const SEAT_REFUSAL_MESSAGE: Record<SeatRefusal, string> = {
  unknown: 'That link does not match an invitation. Ask whoever invited you to send another one.',
  expired: `That invitation has expired — they only last ${SEAT_TOKEN_DAYS} days. Ask for a new one and it will work straight away.`,
  taken: 'That seat has already been taken. If it was you, just sign in.',
};

/** The link that goes in the email. One address, one token, one use. */
export const seatUrl = (appUrl: string, token: string) =>
  `${appUrl.replace(/\/$/, '')}/seat?t=${encodeURIComponent(token)}`;
