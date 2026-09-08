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

export function billingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_SEAT_MONTHLY);
}

export function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}
