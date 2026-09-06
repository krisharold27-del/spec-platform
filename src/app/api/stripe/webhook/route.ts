/**
 * Stripe webhook. Three events matter (see docs/SPEC_GoLive_and_Operations.md §6 and C3 in the
 * setup checklist, which registers this endpoint and its signing secret):
 *   checkout.session.completed  → plan = basic, store the Stripe customer/subscription ids,
 *                                  open the tenant's first period.
 *   invoice.payment_failed      → plan = lapsed (read-only; never deletes data).
 *   customer.subscription.deleted → plan = lapsed (cancelled, same treatment as a failed payment).
 * Signature verification needs the raw request body, so this route reads it with `.text()`
 * rather than `.json()`.
 */
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { stripe } from '@/lib/stripe';
import { openFirstPeriod } from '@/lib/provision';

export const runtime = 'nodejs';

/** Stripe has moved where the subscription id lives on an invoice across API versions — check both. */
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const direct = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') return direct.id;
  const viaParent = invoice.parent?.subscription_details?.subscription;
  if (typeof viaParent === 'string') return viaParent;
  if (viaParent && typeof viaParent === 'object') return viaParent.id;
  return null;
}

async function markLapsed(subscriptionId: string | null) {
  if (!subscriptionId) return;
  await db.update(schema.tenants).set({ plan: 'lapsed' }).where(eq(schema.tenants.stripeSubscriptionId, subscriptionId));
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not set' }, { status: 500 });

  const sig = request.headers.get('stripe-signature');
  const body = await request.text();
  if (!sig) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json({ error: `Signature verification failed: ${(err as Error).message}` }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.client_reference_id ?? session.metadata?.tenantId;
      if (tenantId) {
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
        await db.update(schema.tenants).set({
          plan: 'basic',
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
        }).where(eq(schema.tenants.id, tenantId));
        await openFirstPeriod(tenantId);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await markLapsed(subscriptionIdFromInvoice(invoice));
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await markLapsed(subscription.id);
      break;
    }
    default:
      break; // Ignored — we only act on the three events above.
  }

  return NextResponse.json({ received: true });
}
