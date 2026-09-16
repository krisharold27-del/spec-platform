# Turning Stripe on

**Step 6 of the readiness list, and the last one.** Everything else is finished.

Written from the code rather than from memory, and `tests/stripe-setup.test.ts` fails if this
document and the code ever stop agreeing — which they already had once. The old checklist told you
to set `STRIPE_PRICE_BASIC_ANNUAL`; the code reads `STRIPE_PRICE_SEAT_MONTHLY`. Following it would
have left `billingConfigured()` returning false, checkout redirecting to `?billing_error=1`, and
nothing anywhere saying why.

Nothing here needs me. Every step is a screen you log into.

---

## What the product actually needs

Exactly three settings. There is no publishable key — SPEC uses Stripe's hosted Checkout and never
renders a card field, so there is nothing for a browser-side key to do.

| Setting | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…`, then `sk_live_…` |
| `STRIPE_PRICE_SEAT_MONTHLY` | The **AUD** seat price ID, `price_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…`, from the endpoint you create in step 5 |

---

## 1. The account

stripe.com → create an account for **SPEC Business Solutions**, Australia.

Complete business verification: ABN, business address, director ID, and the bank account payouts go
to. **This is the only step with a waiting time** — identity checks can take a day. Start it first
and do everything else while it clears; test mode works immediately regardless.

## 2. Tax

Settings → Tax → enable **Stripe Tax**, and set your GST registration status.

Worth doing before the first real payment rather than after. Retro-fixing GST on invoices already
issued is an accountant's afternoon.

## 3. One product, six prices

Products → **Add product** → name it `SPEC seat`.

Then add **six monthly recurring prices to that one product** — not six products. The code finds the
right price by looking up other prices *on the same product*, so a second product is invisible to it.

| Currency | Amount | Interval |
|---|---|---|
| AUD | 26 | Monthly |
| NZD | 35 | Monthly |
| GBP | 17 | Monthly |
| EUR | 26 | Monthly |
| USD | 26 | Monthly |
| CAD | 35 | Monthly |

These are the published prices and they are not converted from each other — every one reduces to 8
by digit sum, which is deliberate, and a price never moves because an exchange rate did.

**The amounts have to match exactly.** `src/app/api/stripe/checkout/route.ts` matches on currency
*and* the exact amount, so a price that has drifted from this table is never charged — it falls back
to the AUD one and logs `no published seat price in Stripe for …`. That is the safe failure, and it
is also a silent one, so get them right.

Copy the **AUD** price ID into `STRIPE_PRICE_SEAT_MONTHLY`. The other five are found through it.

## 4. The customer portal

Settings → Billing → **Customer portal** → activate it, and allow customers to update payment
methods and cancel.

Easy to skip and it breaks nothing until somebody clicks Billing — at which point
`/api/stripe/portal` fails because Stripe has no portal configuration to open. Nothing in SPEC can
detect that in advance.

## 5. The webhook

Developers → Webhooks → **Add endpoint** → `https://app.specbizhq.com/api/stripe/webhook`

Send exactly these three events. SPEC ignores everything else, so adding more is noise:

- `checkout.session.completed` — the business becomes `basic` and its first period opens
- `invoice.payment_failed` — the business is marked `lapsed` and goes read-only
- `customer.subscription.deleted` — the same

Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

Without it every webhook is rejected, which means a customer would pay and **nothing in SPEC would
change**. They would be charged and still locked out. Of everything on this page, this is the one
that costs you a customer.

## 6. Vercel, then redeploy

Vercel → spec-platform → Settings → Environment Variables. Add all three. Then Deployments → the top
one → ⋯ → **Redeploy**, because Vercel binds environment variables when a deployment is built.

Check `www.specbizhq.com/status` — the Stripe line should stop saying it is not switched on.

## 7. Prove it in test mode

Still with `sk_test_…`:

1. Sign up a business, add a person so there is a seat to bill.
2. Upgrade. Card `4242 4242 4242 4242`, any future expiry, any CVC.
3. **Confirm the business moved to `basic` in SPEC** — not just that Stripe says it succeeded. That
   is the webhook working, and it is the only part that can fail silently.
4. Stripe → the subscription → cancel it. Confirm SPEC marks the business `lapsed` and read-only.

Step 3 and step 4 are the test. Steps 1 and 2 only prove Stripe works, which was never in doubt.

## 8. One real payment

Swap to `sk_live_…` and the live `whsec_…` (a live endpoint has its own signing secret — the test
one will not work), redeploy, take one real payment on your own card, confirm it in SPEC, then
refund it in Stripe.

**No payment has ever been attempted, succeeded, failed, or been refunded.** Until step 8 that
sentence stays in the readiness list, because a checkout that 500s on the first real customer is
something that customer finds out before you do.

---

## What SPEC does with billing, so nothing here surprises you

**A business with nobody in it is never billed.** Checkout refuses with `?nothing_to_bill=1`. The
chart, the goals and the whole structure are free and stay free — billing starts when somebody is
invited, and a seat is a person who can sign in.

**Quantity is the seat count at the moment of checkout.** `countSeats` decides it. Adding people
later does not change the subscription on its own.

**A business is billed in its own currency**, from the country Vercel reports for the request, and
falls back to AUD when it cannot tell.

**JBI is on `beta` and will not be billed by any of this.** That was a decision recorded in the
product, not an accident of Stripe being off — which is exactly why it was worth building before
today. Check `/admin` shows them as Beta before you go live, because the day the till is plugged in
is the day that decision gets tested.
