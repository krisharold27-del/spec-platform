/**
 * Sends the signed-in tenant's GM to Stripe's hosted customer portal: card changes, invoices,
 * cancellation. Nothing bespoke to build — see docs/SPEC_GoLive_and_Operations.md §6.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { currentOrigin } from '@/lib/origin';
import { getScope, isTopOfChart } from '@/lib/scope';

export async function POST() {
  // Back to the address they came in on, for the reason set out in lib/origin.
  const here = await currentOrigin();
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${here}/signin`, 303);
  // The portal can change the card and cancel the subscription — administration, never any seat.
  // isTopOfChart keeps GMs created before the administrator level existed (stored as 'full') in.
  if (!(user.access === 'administrator' || isTopOfChart(await getScope(user)))) {
    return NextResponse.redirect(`${here}/journey`, 303);
  }

  const stripe = getStripe();
  if (!stripe) return NextResponse.redirect(`${here}/journey?billing_error=1`, 303);

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
  if (!tenant?.stripeCustomerId) return NextResponse.redirect(`${here}/journey?no_subscription=1`, 303);

  /*
    Kris, 20 September, minutes after the first real payment: the billing page itself came back as a
    bare "HTTP ERROR 500" — the generic screen this whole file exists to avoid.

    The portal is one Stripe API call with no configuration in this repository to get wrong — its
    settings (what it shows, what it lets a customer cancel) live entirely in the Stripe dashboard,
    under Settings → Billing → Customer portal, and a *default configuration* has to be activated
    there before `billingPortal.sessions.create` will do anything but throw. Nobody had ever clicked
    "Manage billing" before there was a real subscription to manage, so nobody had ever found this.
    Same class of fault as the DECISIONS.md entry on the leadership seat: a setting that lives outside
    the repo, checked for the first time by the first real customer.

    So this is caught rather than left to crash the route: Stripe's own message is worth more than
    "something went wrong", and it goes to `billing_error`, which already has a banner and an email
    address on `/journey` for exactly this shape of failure.
  */
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${here}/journey`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error('Stripe billing portal session failed', err);
    return NextResponse.redirect(`${here}/journey?billing_error=1`, 303);
  }
}
