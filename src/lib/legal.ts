/**
 * Which version of the terms somebody agreed to, and when.
 *
 * ── Why a version and not just a date ────────────────────────────────────────────────────────────
 *
 * The question that matters later is never "did they tick a box". It is "what did they agree to".
 * A timestamp alone cannot answer that: somebody who signed up in March agreed to the March text,
 * and by the time anybody asks, the page has been edited three times and shows something else.
 *
 * So the version is stamped on the account at the moment of agreement, and the version printed on
 * the page moves whenever the words change. The pair — version plus timestamp — is the record.
 *
 * ── The rule when you edit the pages ─────────────────────────────────────────────────────────────
 *
 * Change the words, change the version, change the date. All three, together. A page edited without
 * bumping the version makes every stored `termsVersion` a lie, quietly and retrospectively, which is
 * worse than having no record at all — because a wrong record is one somebody will rely on.
 *
 * `tests/legal.test.ts` holds the version and the date to the page that carries them.
 */

/** Bumped whenever the words on /terms change. */
export const TERMS_VERSION = '1.1';
export const TERMS_UPDATED = '18 September 2026';

/** Bumped whenever the words on /privacy change. Tracked separately: they change for different reasons. */
export const PRIVACY_VERSION = '1.1';
export const PRIVACY_UPDATED = '18 September 2026';

/**
 * What is recorded against an account when somebody agrees.
 *
 * Both together or neither. A timestamp with no version says somebody agreed to something, which is
 * not a record, and a version with no timestamp cannot be placed in a sequence.
 */
export interface Consent {
  termsVersion: string;
  termsAcceptedAt: string;
}

/** The consent to store for somebody agreeing right now. */
export const consentNow = (now = new Date()): Consent => ({
  termsVersion: TERMS_VERSION,
  termsAcceptedAt: now.toISOString(),
});

/**
 * The exact words beside the checkbox, in one place.
 *
 * Here rather than inline in the form because it is said in two places — signing up, and taking an
 * invited seat — and two wordings of the same agreement is the kind of difference that only ever
 * gets noticed by somebody arguing about it afterwards.
 */
export const CONSENT_LABEL = 'I agree to the Terms of Service and Privacy Policy';

/** Shown when somebody presses Create without ticking it. */
export const CONSENT_REQUIRED =
  'Tick the box to say you agree to the Terms of Service and Privacy Policy. '
  + 'Everything else you typed is still here.';
