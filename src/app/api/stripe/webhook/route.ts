/**
 * Stripe webhook. Four events matter (see docs/SPEC_GoLive_and_Operations.md §6 and C3 in the
 * setup checklist, which registers this endpoint and its signing secret):
 *   checkout.session.completed  → plan = basic, store the Stripe customer/subscription ids,
 *                                  open the tenant's first period.
 *   invoice.payment_failed      → plan = lapsed (read-only; never deletes data).
 *   customer.subscription.deleted → plan = lapsed, and the subscription id is cleared: it no longer
 *                                  exists, so nothing may go on quoting it.
 *   invoice.paid                → a lapsed business is let back in. Without it nothing on either
 *                                  side ever undid `lapsed`: the customer fixed their card, Stripe
 *                                  took the money, and SPEC stayed read-only until somebody noticed
 *                                  and changed a column by hand.
 * Signature verification needs the raw request body, so this route reads it with `.text()`
 * rather than `.json()`.
 */
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getStripe } from '@/lib/stripe';
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
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: 'Stripe is not configured on this deployment' }, { status: 503 });

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
        const updated = await db.update(schema.tenants).set({
          plan: 'basic',
          stripeCustomerId: customerId ?? undefined,
          stripeSubscriptionId: subscriptionId ?? undefined,
        }).where(eq(schema.tenants.id, tenantId)).returning({ id: schema.tenants.id });
        /*
          Only for a business that exists here. A checkout started from another environment (a
          developer's machine on the same Stripe account) names a tenant this database has never
          had; opening a period for it failed on the tenant reference, the webhook answered 500,
          and Stripe retried it for days. Found in the live error log by the site check on
          25 September. Nothing to do for a stranger, so it is acknowledged and left alone.
        */
        if (updated.length) await openFirstPeriod(tenantId);
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
      /*
        Lapsed, and the id goes with it — in that order, matched on the id before it is cleared.

        A cancelled subscription is gone from Stripe, so an id still sitting in the row is a claim
        that is no longer true, and the pages read it: `subscribed` is exactly "does Stripe know
        them", and it decides whether a read-only business is offered the customer portal or a
        checkout. Leaving the id behind sends somebody whose subscription no longer exists to a
        portal that has nothing to manage, which is the dead end this is being fixed out of.
      */
      await db.update(schema.tenants)
        .set({ plan: 'lapsed', stripeSubscriptionId: null })
        .where(eq(schema.tenants.stripeSubscriptionId, subscription.id));
      break;
    }
    case 'invoice.paid': {
      /*
        The way back in, and the half that never existed.

        `lapsed` had three ways to be entered and none to leave. A customer whose card expired put a
        new one in, Stripe collected, and SPEC went on refusing every save — the product's own
        promise, "everything comes back the moment it is sorted", kept only if a human remembered to
        go and change a column.

        Only a lapsed business is touched. A paid invoice is the ordinary monthly event for every
        subscriber alive, and an unconditional write here would set `basic` over `beta`, `program`
        and anything an administrator had decided, once a month, silently.
      */
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (subscriptionId) {
        await db.update(schema.tenants).set({ plan: 'basic' }).where(and(
          eq(schema.tenants.stripeSubscriptionId, subscriptionId),
          eq(schema.tenants.plan, 'lapsed'),
        ));
      }
      break;
    }
    default:
      break; // Ignored — we only act on the four events above.
  }

  return NextResponse.json({ received: true });
}
