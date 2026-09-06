/** Shared Stripe client. Test-mode keys until A5's business verification clears — see docs/SPEC_Setup_Checklist.md. */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('STRIPE_SECRET_KEY is not set. Copy .env.local.example to .env.local and fill it in.');

export const stripe = new Stripe(key, { apiVersion: '2026-08-26.dahlia', typescript: true });

export function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}
