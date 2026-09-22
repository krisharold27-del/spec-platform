/**
 * Starts a Stripe Checkout session for SPEC self-serve — a seat per named person per month, at the
 * regional price for where the business is (lib/pricing).
 *
 * Quantity is the number of people actually invited into the business, counted at checkout rather
 * than typed in, so a leader can never be billed for seats they did not create. Posted to from a
 * plain HTML form (no client JS needed). See docs/SPEC_GoLive_and_Operations.md §6.
 */
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { currencyForCountry, lineItemsFor } from '@/lib/pricing';
import { db, schema } from '@/db';
import { getCurrentUser } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { currentOrigin } from '@/lib/origin';
import { countSeats, countLeadershipSeats, seatBill } from '@/lib/plan';
import { getScope, isTopOfChart } from '@/lib/scope';

/**
 * ── Why there is no longer a hunt for a price in the customer's currency ────────────────────────
 *
 * This route used to take the configured price id, find its product, list every active recurring
 * price on that product in the customer's currency, and pick the one whose `unit_amount` matched
 * `lib/pricing` to the cent. If none matched it logged and charged the Australian one.
 *
 * That was careful, and it was built on a wrong picture of the account. Kris's Stripe handoff of 19
 * September: *"Each seat price is a single Stripe Price object with AUD as the default currency and
 * NZD, GBP, EUR, USD and CAD as currency_options on that same price. Pass currency at Checkout to
 * charge in the customer's currency — do not create separate prices per currency."*
 *
 * There are no per-currency prices to find. The search could only ever come back empty, log an
 * error nobody reads and fall through to the id it started with — which is right, for the wrong
 * reason, and only because the fallback happened to exist. Two Stripe round trips per checkout to
 * arrive back where it began.
 *
 * So the ids come from `lib/pricing`, where they sit beside the amounts they name, and the session
 * is told the CURRENCY. Stripe reads the matching `currency_options` off each price. If a currency
 * has no option on a price Stripe refuses the session outright, rather than quietly charging
 * Australian dollars — which is the failure anybody would want.
 *
 * The environment variables still win when set, so a deployment can be pointed at test-mode prices
 * without a release.
 */
export async function POST() {
  /*
    Everything below goes back to the address the customer is actually on, not to APP_URL.

    SPEC answers on more than one address, and a browser keeps its sign-in per address. Returning
    somebody to a different one drops their session and lands them in whatever account that address
    was holding — which on 16 September meant the first real payment finished on another business's
    page, under a banner saying the payment had gone through. See lib/origin.
  */
  const here = await currentOrigin();
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(`${here}/signin`, 303);
  // Paying for the business is administration. isTopOfChart keeps GMs created before the
  // administrator level existed (stored as 'full') able to pay.
  if (!(user.access === 'administrator' || isTopOfChart(await getScope(user)))) {
    return NextResponse.redirect(`${here}/billing`, 303);
  }

  const stripe = getStripe();
  // Billing not configured yet — say so on the billing page rather than throwing at the user.
  // The price ids no longer need configuring: they are Stripe's own, in lib/pricing, beside the
  // amounts they name. Only the secret key can be missing now.
  if (!stripe) return NextResponse.redirect(`${here}/billing?billing_error=1`, 303);

  const tenantRows = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
  const tenant = tenantRows[0];
  if (!tenant) return NextResponse.redirect(`${here}/billing`, 303);

  /*
    Nothing to bill means nothing to bill, and there are two ways to get there: nobody in the
    business at all, or nobody past the first person — because the first seat is free (lib/plan,
    FREE_SEATS). Charging the quantity Stripe is given here is the ONLY place the decision becomes
    money, so it reads `billable` and never `seats`.
  */
  const seats = await countSeats(user.tenantId);
  const leadershipSeats = await countLeadershipSeats(user.tenantId);
  const bill = seatBill(seats, leadershipSeats);
  if (bill.billable === 0) return NextResponse.redirect(`${here}/billing?nothing_to_bill=1`, 303);

  // Billed in the business's own currency, set by where it is (BUILD_SPEC §8.2).
  const currency = currencyForCountry((await headers()).get('x-vercel-ip-country'));

  /*
    ── Two seats, so two lines ─────────────────────────────────────────────────────────────────

    Kris's handoff: *"A customer's subscription is one Leadership-seat line item (quantity = number
    of leaders) plus one Team-seat line item (quantity = number of team members)."* One price per
    seat kind, not two — the Basic/Advanced split this checkout briefly offered lasted one session
    and was retired 22 September (see the note on `SEAT_PRICES` in lib/pricing). `lineItemsFor`
    (lib/pricing) is the one place this arithmetic is written.

    The old version of this split people a different way — plain seats against SPEC's training
    seats — and could only ever reach ONE of the four prices, the leadership one. Every team member
    in every business was counted at A$134. See the note on seatBill.
  */
  const lines = lineItemsFor(bill);

  /*
    Kris, 20 September, right after the first real payment: the billing page came back as a bare
    "HTTP ERROR 500" — the generic screen the rest of this file explicitly writes redirects to avoid.
    That particular crash was `stripe.billingPortal.sessions.create` in ../portal/route.ts (see the
    comment there), but this call has the same shape and the same documented way to fail — "if a
    currency has no option on a price Stripe refuses the session outright", a few lines up — and was
    just as unguarded. One customer hitting a Stripe error here got the identical unhelpful page.
  */
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lines,
      /*
        The currency, so Stripe reads the right `currency_options` off each price. Without it every
        customer in the world is charged the price's default currency, which is Australian dollars —
        and it would look completely normal on the invoice.
      */
      currency,
      // client_reference_id is how the webhook maps the completed session back to a tenant —
      // more reliable than matching on customer email, which can differ from the app user's email.
      client_reference_id: tenant.id,
      customer: tenant.stripeCustomerId ?? undefined,
      customer_email: tenant.stripeCustomerId ? undefined : user.email,
      subscription_data: { metadata: { tenantId: tenant.id } },
      metadata: { tenantId: tenant.id },
      success_url: `${here}/billing?upgraded=1`,
      cancel_url: `${here}/billing?upgrade_cancelled=1`,
      allow_promotion_codes: true,
    });
  } catch (err) {
    console.error('Stripe checkout session failed', err);
    return NextResponse.redirect(`${here}/billing?billing_error=1`, 303);
  }

  if (!session.url) return NextResponse.redirect(`${here}/billing?billing_error=1`, 303);
  return NextResponse.redirect(session.url, 303);
}
