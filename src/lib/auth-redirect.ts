/**
 * Pure helpers for the sign-in link. No I/O.
 *
 * `next` arrives in a URL anybody can edit, so it is only ever a path inside SPEC. Joining an
 * unchecked value onto the origin is an open redirect: `@evil.com` turns
 * https://app.specbizhq.com into https://app.specbizhq.com@evil.com — somebody else's site.
 */
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Everybody starts their work day on Today. Someone who does not hold a role yet is sent on to the
 * journey by that page itself, so a business still being built lands where it actually is.
 */
export const DEFAULT_AFTER_SIGN_IN = '/my-page';

export function safeNext(next: string | null | undefined, fallback = DEFAULT_AFTER_SIGN_IN): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change'];

/** The link types Supabase issues. Anything else is a hand-edited URL and is refused. */
export function emailOtpType(type: string | null | undefined): EmailOtpType | null {
  return EMAIL_OTP_TYPES.includes(type as EmailOtpType) ? (type as EmailOtpType) : null;
}

/** The link in the sign-in email: SPEC's own one-press page, carrying the one-time token. */
export function signInUrl(appUrl: string, tokenHash: string, type: EmailOtpType, next?: string | null): string {
  const q = new URLSearchParams({ token_hash: tokenHash, type, next: safeNext(next) });
  return `${appUrl.replace(/\/+$/, '')}/auth/confirm?${q.toString()}`;
}
