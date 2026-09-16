/**
 * Sends the signed-in tenant's GM to Stripe's hosted customer portal: card changes, invoices,
 * cancellation. Nothing bespoke to build — see docs/SPEC_GoLive_and_Operations.md §6.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getStripe, appUrl } from '@/lib/stripe';
import { getScope, isTopOfChart } from '@/lib/scope';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/signin`, 303);
  // The portal can change the card and cancel the subscription — administration, never any seat.
  // isTopOfChart keeps GMs created before the administrator level existed (stored as 'full') in.
  if (!(user.access === 'administrator' || isTopOfChart(await getScope(user)))) {
    return NextResponse.redirect(`${appUrl()}/journey`, 303);
  }

  const stripe = getStripe();
  if (!stripe) return NextResponse.redirect(`${appUrl()}/journey?billing_error=1`, 303);

  const tenantRows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const tenant = tenantRows[0];
  /*
    No Stripe customer means they have never subscribed, and there is nothing for the portal to open.

    This used to redirect to /journey with NOTHING SAID — the page reloaded, looked identical, and a
    leader was left clicking the same button wondering what they had done wrong. It was half of the
    reason the product had no way to take a first payment: the other half was that the page offered
    this button to businesses that had never paid, instead of one that starts a subscription.

    The page no longer does that, so reaching here should be rare. When it happens, say so.
  */
  if (!tenant?.stripeCustomerId) return NextResponse.redirect(`${appUrl()}/journey?no_subscription=1`, 303);

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appUrl()}/journey`,
  });
  return NextResponse.redirect(session.url, 303);
}
