/**
 * Sends the signed-in tenant's GM to Stripe's hosted customer portal: card changes, invoices,
 * cancellation. Nothing bespoke to build — see docs/SPEC_GoLive_and_Operations.md §6.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { stripe, appUrl } from '@/lib/stripe';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/signin`, 303);

  const tenantRows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const tenant = tenantRows[0];
  if (!tenant?.stripeCustomerId) return NextResponse.redirect(`${appUrl()}/journey`, 303);

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${appUrl()}/journey`,
  });
  return NextResponse.redirect(session.url, 303);
}
