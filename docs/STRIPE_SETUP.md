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

Four settings. There is no publishable key — SPEC uses Stripe's hosted Checkout and never
renders a card field, so there is nothing for a browser-side key to do.

| Setting | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…`, then `sk_live_…` |
| `STRIPE_PRICE_SEAT_MONTHLY` | The **AUD** seat price ID, `price_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…`, from the endpoint you create in step 5 |
| `STRIPE_PRICE_SEAT_TRAINING_MONTHLY` | The **AUD** price ID for `SPEC seat plus training`, `price_…` |

The fourth is only needed once a business puts a frontline leader on SPEC's training material. Until
then nothing reads it. The moment one is on it, **checkout refuses rather than charging them the
A$26 rate** — a subscription quietly A$18 a person short every month is the kind of thing nobody ever
looks at, and stopping is recoverable where that is not.

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

## 3. Four products

SPEC sells four things, and the administrator decides which one a business is on — see
`PACKAGES` in `src/lib/pricing.ts`.

| | What it is | Price | Billed | Sold where |
|---|---|---|---|---|
| **Seat** | One person in SPEC | **A$26** | per person, monthly, **first seat free** | anywhere |
| **Seat plus training** | The same, plus the training built into SPEC, done online | **A$44** | per person, monthly, **first seat free** | anywhere |
| **SPEC sessions** | Four one-hour sessions a month, delivered by you, built around their roles and how they actually use SPEC | **A$1,007** | flat, monthly | anywhere — delivered from Australia |
| **Full SPEC control** | One full day a week on site, and the monthly board meeting chaired | **A$20,888** | flat, monthly | **Australia only** |

Every one of those reduces to 8 by digit sum. 1008 was the first number for the sessions tier and
reduces to 9 — `tests/packages.test.ts` records that, so nobody re-introduces it by rounding.

### The two seat products

Products → **Add product** → `SPEC seat`, then `SPEC seat plus training`.

**What the A$44 actually is**, because it was a number with nothing behind it until 16 September:
the seat, plus **SPEC's own training material for frontline leaders** — twelve modules across the
four pillars, done online at their own pace. The A$26 seat keeps everything it already had,
including the training machinery itself: a curriculum per role, paths, progress, sign-off. What it
does not get is the material, which a business on A$26 writes for itself.

**It is a seat, not a plan.** The administrator puts individual people on it, and only people
holding a frontline leader role — a supervisor or team leader. Not the stream heads, not the GM, not
team members. So a business of forty with six supervisors is billed **six at A$44 and thirty-three
at A$26** (one seat is free), on two lines of one subscription. A single line at one rate would have
to pick which lie to tell.

Each one gets **six monthly recurring prices on that same product** — not six products. The code
finds the right currency by looking up other prices *on the same product*, so a second product is
invisible to it.

| Currency | Seat | Seat plus training |
|---|---|---|
| AUD | 26 | 44 |
| NZD | 35 | 53 |
| GBP | 17 | 26 |
| EUR | 26 | 44 |
| USD | 26 | 44 |
| CAD | 35 | 53 |

Copy the **AUD seat** price ID into `STRIPE_PRICE_SEAT_MONTHLY`, and the **AUD seat plus training**
price ID into `STRIPE_PRICE_SEAT_TRAINING_MONTHLY`. The other currencies are found through whichever
of the two applies, by matching the exact published amount on the same product.

**The amounts have to match exactly.** `src/app/api/stripe/checkout/route.ts` matches on currency
*and* the exact amount, so a price that has drifted from this table is never charged — it falls back
to AUD and logs `no published seat price in Stripe for …`. Safe, and silent.

### The two that are your week, not a seat

Products → **Add product** → `SPEC sessions` (A$1,007/month) and `SPEC full control`
(A$20,888/month). **One AUD price each. No other currencies.**

Not an oversight. Both are a share of one person's week, quoted in Australian dollars wherever the
customer is, because that is the only number anybody has decided — and a converted price is one that
moves every time an exchange rate does.

**Neither is ever multiplied by a headcount.** A full day a week for a business of forty is still one
day. `monthlyCostOf` enforces that and a test holds it at twenty thousand seats.

**Full control is Australia only.** It means somebody on site every week and in the board meeting
every month, and there is no version of that for a business in another country. Sessions travel
fine — four hours a month goes down a video call — which is why the two are treated differently in
`availableTo()` rather than lumped together as "the expensive ones".

## 4. The customer portal

Settings → Billing → **Customer portal** → activate it, and allow customers to update payment
methods and cancel.

Easy to skip and it breaks nothing until somebody clicks Billing — at which point
`/api/stripe/portal` fails because Stripe has no portal configuration to open. Nothing in SPEC can
detect that in advance.

## 5. The webhook

Developers → Webhooks → **Add endpoint** → `https://app.specbizhq.com/api/stripe/webhook`

Send exactly these four events. SPEC ignores everything else, so adding more is noise:

- `checkout.session.completed` — the business becomes `basic` and its first period opens
- `invoice.payment_failed` — the business is marked `lapsed` and goes read-only
- `customer.subscription.deleted` — the same, and the subscription id is cleared: it no longer
  exists in Stripe, so the business is offered a fresh checkout rather than a portal with nothing
  in it
- `invoice.paid` — **the way back.** A business sitting on `lapsed` is returned to `basic` the
  moment Stripe collects. Nothing else in the product ever undid `lapsed`: a customer could put a
  new card in, be charged, and stay read-only until somebody changed a column by hand. Only a
  lapsed business is touched, so the ordinary monthly invoice of every other subscriber changes
  nothing

Copy the **Signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

Without it every webhook is rejected, which means a customer would pay and **nothing in SPEC would
change**. They would be charged and still locked out. Of everything on this page, this is the one
that costs you a customer.

## 6. Vercel, then redeploy

Vercel → spec-platform → Settings → Environment Variables. Add all three. Then Deployments → the top
one → ⋯ → **Redeploy**, because Vercel binds environment variables when a deployment is built.

Then check **`www.specbizhq.com/status`** and read the line called **"Taking a payment"**. It says
one of four things:

| It says | What it means |
|---|---|
| **Working** | All three set. Checkout can start and SPEC will hear back from Stripe. |
| **Not switched on** | None set. Fine and normal — nobody is being charged. |
| **Needs attention** | Some set, some not. Checkout will fail. The line names the missing one. |
| **Fix before anybody pays** | Key and price set, webhook secret missing. Stripe takes the money and SPEC never hears — the customer is charged **and** still locked out, and nothing looks wrong from either dashboard. |

That last one is why the line exists. It cannot be spotted from Stripe's side, it throws no error,
and the only person who would ever find out is the one who paid.

*(This line was added on 16 September because these instructions told somebody to check a Stripe
line on /status and there wasn't one.)*

## 7. Prove it in test mode

Still with `sk_test_…`:

1. Sign up a business, add a person so there is a seat to bill.
2. Upgrade. Card `4242 4242 4242 4242`, any future expiry, any CVC.
3. **Confirm the business moved to `basic` in SPEC** — not just that Stripe says it succeeded. That
   is the webhook working, and it is the only part that can fail silently.
4. Stripe → the subscription → cancel it. Confirm SPEC marks the business `lapsed` and read-only.

Step 3 and step 4 are the test. Steps 1 and 2 only prove Stripe works, which was never in doubt.

**Done on 16 September, steps 1 to 3.** Stripe charged A$26, the webhook delivered first time (1
delivered, 0 failed — the signing secret matches), and SPEC changed by itself from *"Nothing has been
charged yet"* to *"A$26 a month · 1 person"*. A second person was not needed: the owner's own filled
role is the billable seat.

**Step 4 is still outstanding.** Cancel that test subscription and confirm the business goes
`lapsed` and read-only. Payment failing is the half that has never been watched, and it is the half
a customer meets on the day their card expires.

### It also found a real one, which is why step 3 is written the way it is

The payment worked and **finished on the wrong website.** The business was signed up on
`www.specbizhq.com`; Checkout returned it to `app.specbizhq.com`, because every link back was built
from `APP_URL`, one fixed address. A browser keeps its sign-in per address, so the return trip landed
in a different business entirely, under a banner reading *"Payment received"*, above a page that
still said nothing had been charged.

Nothing threw. Stripe was happy, the database was right, and 996 tests passed — every one of them had
asked whether the checkout worked, and it did. Nobody had asked where it sent the person afterwards.

Fixed in `src/lib/origin.ts`: every link back now uses **the address the request arrived on**, so
`www` returns to `www` and `app` returns to `app`, and both keep working. It covers the checkout, the
billing portal, sign-in emails, seat invitations and copied seat links. The address is checked
against SPEC's own domain first, so a handwritten `Host` header cannot point a customer's return trip
at somebody else's website.

**So both addresses are fine and neither needs turning off.** If you would rather have one — set
`www` to redirect to `app` in Vercel → Domains — nothing here breaks either way. That is now a
preference, not a repair.

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

**Quantity is the seat count at the moment of checkout, minus the free first seat.** `countSeats` counts the people and `billableSeats` decides how many are charged for. Adding people
later does not change the subscription on its own.

**A business is billed in its own currency**, from the country Vercel reports for the request, and
falls back to AUD when it cannot tell.

**JBI pays, like any other customer.** Kris, 16 September: *"i will pay for JBI and use it as a
complete test case — don't modify."*

That reverses the earlier plan to let them run for nothing, and it is the stronger decision. A
customer who is not billed never tests billing: the checkout, the webhook, the seat count, the
invoice, the card that expires in eleven months. Running the first real business on a free
arrangement would have left the single most expensive path in the product unexercised until a
stranger walked it.

So there is **nothing to set up for JBI** — no flag, no exception, no branch. They sign up at the
front door and pay at the checkout like anybody else, and every line of this document applies to
them exactly as written. That is the point of using them as the test case.

The free-beta capability still exists on /admin for some future customer who is genuinely a guinea
pig. Nothing is on it, and it is not needed here.
