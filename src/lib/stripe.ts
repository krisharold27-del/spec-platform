/**
 * Shared Stripe client. Test-mode keys until A5's business verification clears — see docs/SPEC_Setup_Checklist.md.
 *
 * Billing is optional infrastructure, not a dependency: the platform must build and run with no
 * Stripe keys at all (a client on the free trial never touches it). So the client is created on
 * first use, not at import time — a missing key returns null and the caller degrades gracefully
 * instead of the whole build or request failing.
 */
import Stripe from 'stripe';

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key, { apiVersion: '2026-08-26.dahlia', typescript: true });
  return client;
}

/**
 * Can SPEC take a payment?
 *
 * ── One setting now, not two ────────────────────────────────────────────────────────────────────
 *
 * This used to require `STRIPE_PRICE_SEAT_MONTHLY` as well as the key, which was right while the
 * price ids were something somebody typed into Vercel on the day. Kris's Stripe handoff of 19
 * September makes them facts about the live account, so they live in `lib/pricing` beside the
 * amounts they name and there is nothing left to configure.
 *
 * Leaving the old condition here would have been worse than untidy: /status reads this, and it
 * would have reported billing as switched OFF on a deployment that could charge a card perfectly
 * well — the quietly-wrong answer docs/STRIPE_SETUP.md exists to stop.
 */
export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Re-exported from lib/origin, which owns it. Most callers want `currentOrigin()` instead: this is
 * the one configured address, and SPEC answers on more than one.
 */
export { appUrl } from './origin';
