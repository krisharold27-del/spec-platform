/**
 * Starts a Stripe Checkout session for SPEC self-serve — $26 per named seat per month.
 *
 * Quantity is the number of people actually invited into the business, counted at checkout rather
 * than typed in, so a leader can never be billed for seats they did not create. Posted to from a
 * plain HTML form (no client JS needed). See docs/SPEC_GoLive_and_Operations.md §6.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getStripe, appUrl } from '@/lib/stripe';
import { countSeats } from '@/lib/plan';
import { getScope, isTopOfChart } from '@/lib/scope';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/signin`, 303);
  // Paying for the business is administration. isTopOfChart keeps GMs created before the
  // administrator level existed (stored as 'full') able to pay.
  if (!(user.access === 'administrator' || isTopOfChart(await getScope(user)))) {
    return NextResponse.redirect(`${appUrl()}/journey`, 303);
  }

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_SEAT_MONTHLY;
  // Billing not configured yet — say so on the journey page rather than throwing at the user.
  if (!stripe || !priceId) return NextResponse.redirect(`${appUrl()}/journey?billing_error=1`, 303);

  const tenantRows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const tenant = tenantRows[0];
  if (!tenant) return NextResponse.redirect(`${appUrl()}/journey`, 303);

  // Nobody invited yet means nothing to bill — the structure is free and stays free.
  const seats = await countSeats(user.tenantId);
  if (seats === 0) return NextResponse.redirect(`${appUrl()}/journey?nothing_to_bill=1`, 303);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: seats }],
    // client_reference_id is how the webhook maps the completed session back to a tenant —
    // more reliable than matching on customer email, which can differ from the app user's email.
    client_reference_id: tenant.id,
    customer: tenant.stripeCustomerId ?? undefined,
    customer_email: tenant.stripeCustomerId ? undefined : user.email,
    subscription_data: { metadata: { tenantId: tenant.id } },
    metadata: { tenantId: tenant.id },
    success_url: `${appUrl()}/journey?upgraded=1`,
    cancel_url: `${appUrl()}/journey?upgrade_cancelled=1`,
    allow_promotion_codes: true,
  });

  if (!session.url) return NextResponse.redirect(`${appUrl()}/journey?billing_error=1`, 303);
  return NextResponse.redirect(session.url, 303);
}
