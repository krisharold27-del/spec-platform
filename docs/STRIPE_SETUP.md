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

**Two settings.** That is the whole list.

There is no publishable key — SPEC uses Stripe's hosted Checkout and never renders a card field, so
there is nothing for a browser-side key to do. And there are no price IDs to set any more: they are
facts about the live account, so they live in `src/lib/pricing.ts` beside the amounts they name,
where the two cannot drift apart one at a time.

| Setting | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…`, then `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…`, from the endpoint you create in step 5 |

Three more are **read if set and otherwise ignored**, and exist only so a deployment can be pointed
at test-mode prices without a release. Leave them empty and the live ids below are used:
`STRIPE_PRICE_SEAT_MONTHLY`, `STRIPE_PRICE_TEAM_SEAT_MONTHLY`, `STRIPE_PRICE_SEAT_TRAINING_MONTHLY`.

---

## 1. The account

stripe.com → the account for **SPEC Business Solutions**, Australia — `acct_1UCYbyGjbPN3KVS7`.

Complete business verification: ABN, business address, director ID, and the bank account payouts go
to. **This is the only step with a waiting time** — identity checks can take a day. Test mode works
immediately regardless.

## 2. Tax

Settings → Tax → **Stripe Tax** on, with your GST registration status set.

Every SPEC product uses tax code **`txcd_10103101`** (SaaS, business use). AUD, NZD, GBP and EUR
prices are tax-**inclusive** — the Australian figures include GST — and USD and CAD are
tax-exclusive, which is Stripe's default for those currencies. The pricing page says so, because
A$134 and US$134 are the same number and not the same price.

Worth checking before the first real payment rather than after. Retro-fixing GST on invoices already
issued is an accountant's afternoon.

## 3. The products — already created

Confirmed against the live account on 19 September 2026, and retired to one price per seat kind on
22 September — see `SEAT_PRICES` in `src/lib/pricing.ts` for why. This section is the record, so
that anybody comparing the code to Stripe has one table to compare it with.

| Product | Product ID | Price ID | AUD | NZD | GBP | EUR | USD | CAD |
|---|---|---|---|---|---|---|---|---|
| SPEC Leadership seat | `prod_VHtnsfpPRSp6no` | `price_1UHK06GjbPN3KVS7Erx7Aeum` | 134 | 180 | 88 | 134 | 134 | 180 |
| SPEC Team seat | `prod_VHtt211YPktGXS` | `price_1UHK5hGjbPN3KVS7hzoKltlI` | 17 | 23 | 11 | 17 | 17 | 23 |
| SPEC Leadership seat + training | `prod_VHtrdn6wF9T8JM` | `price_1UHK3PGjbPN3KVS7vot0UtCu` | 227 | 305 | 149 | 227 | 227 | 305 |
| SPEC Training | `prod_VHtwe8HgAnBYdW` | `price_1UHK94GjbPN3KVS7FE5GGzAC` | 1,502 | — | — | — | — | — |

All amounts are per month. Stripe stores them in minor units, so A$134 is `13400`.

Kris briefly asked for AUD's team seat to move from $17 to $26 — a Stripe Price object cannot be
edited once created, so that would have meant creating a new one — then, once the tier that
prompted the change was retired, said to leave it: *"oh yeah stay at 17 that sfine."* So the team
seat matches the live account exactly, with nothing left to create.

**The Leadership seat + training row is un-retired.** It is the same product and price that used to
be "SPEC Leadership seat - Advanced" — created 19 September for the AI-powered tier, retired 22
September the same day that tier shipped. Kris, 22 September: *"i think the 227 price can stay but
change to full training system price... they can turn the seat to a leadership and training seat
and that then makes it 227."* Nothing in Stripe changed — same product, same price, same id — only
what it is SOLD as. See the note on `SEAT_PRICES.leadershipWithTraining` in `src/lib/pricing.ts`.

The **Team seat - Advanced** (`prod_VHtv5osYcg3Snq` / `price_1UHK7lGjbPN3KVS7EXlND5Xg`, A$29) product
from 19 September is still live in Stripe — nobody archived it — but no code path uses it: there is
no team-seat training upgrade, only a leadership one. See `RETIRED_STRIPE_PRICES`/
`RETIRED_STRIPE_PRODUCTS` in `src/lib/pricing.ts`.

The three seat prices by currency, which is the order the pricing page prints them and the order
`SEAT_PRICES` in `src/lib/pricing.ts` holds them:

| Currency | Leadership seat | Team seat | Leadership + training |
|---|---|---|---|
| AUD | 134 | 17 | 227 |
| NZD | 180 | 23 | 305 |
| GBP | 88 | 11 | 149 |
| EUR | 134 | 17 | 227 |
| USD | 134 | 17 | 227 |
| CAD | 180 | 23 | 305 |

### One price per product, six currencies on it

Each seat is **one Price object** with AUD as its default currency and the other five as
`currency_options` on that same price — not six prices, and not six products. Checkout passes the
currency and Stripe reads the matching option.

That is a change from how this document used to describe the account, and it changed the code with
it: `/api/stripe/checkout` used to *search* a product for a price in the customer's currency and
fall back to AUD when it found none. There was never one to find, so the search could only ever
fail and fall through — right answer, wrong reason, two Stripe round trips to get there. It now
sets `currency` on the session. If a currency has no option on a price Stripe refuses the session
rather than quietly charging Australian dollars.

### Which seat a person is on

Kris, 19 September: **"if you lead people, you're a leadership seat. If you're led, you're a team
seat in a pool."**

SPEC reads it from the **org chart** and from the title, and a person is a leadership seat if
**either** says so — somebody reports to their role, or their title contains leader / supervisor /
manager / director / head of. Title alone lets a business rename its way to cheaper seats; the
chart alone bills a Site Supervisor as a team seat until somebody draws their crew. See
`seatKindFor` in `src/lib/chart-seats.ts`, which is now the only copy of that rule.

A person with a login and no role at all is a **team seat**.

### What a subscription looks like

One subscription per business, with **two or three line items**: Leadership seat × the number of
leaders not on the training upgrade, Team seat × the number of team members, and Leadership seat +
training × the number of leaders an administrator has put on it. A business of forty with six
leaders, two of them on the training upgrade, pays four plain leadership seats, two training seats
and thirty-three team seats — the first seat is free, and it comes off a team seat first, then a
plain leadership seat, because those are the cheaper of the three.

- **Recurring monthly, per-unit with a quantity.** Seat counts change through subscription quantity
  updates, prorated by Stripe's default behaviour.
- **The free first seat stays in SPEC's maths**, not a Stripe coupon — one place owns that rule and
  it is `lib/plan`.
- **Existing customers do not re-price themselves.** SPEC has no mechanism today for reconciling an
  existing subscription's line items against a changed price — a gap that predates this document
  and is unrelated to any tier that was retired.

### There is one SPEC — the AI is switched on by subscribing, not by a choice of seat

The Advanced tier existed for one session on 22 September to let a business choose between two
prices for the assistant being switched on. It never gated anything real: `aiActive` in
`src/lib/plan.ts` was already `subscribed || program || beta`, independent of which tier a business
was on, so a subscribed business got the assistant either way. Kris, looking at the built result:
*"i also feel like i don't want to have 2 different prices... make it simple."* There is one price
per seat again — see the table above — and every subscribed business is `aiActive`.

`tenants.tier` and `tenants.seatTier` are both retired columns, kept in the schema and no longer
read for pricing. Neither is a switch to press back into service.

### Two different things are called "training", and they are not the same product

**The leadership seat + training upgrade** (above) is per person, turned on and off by an
administrator from the Training screen, and bills like any other seat — quantity, currency,
proration, all the same rules.

**SPEC Training** is a completely different thing: a flat monthly line item, quantity 1, added only
if the customer selects it — four one-to-one sessions delivered by SPEC rather than material read
on the software. It is **Australian dollars only** — one price, no `currency_options` — so a
customer in any other currency is shown *"Speak to us"* rather than a figure Stripe could not
charge them.

**Consulting has no Stripe product.** It is quote-only: *"Speak to us"*, priced in the
conversation. `PACKAGES.full_control.aud` is `null` rather than a number kept quietly for
reference, because `publishPrice: false` only ever governed the marketing page — /admin printed the
figure regardless.

### Archived — do not use

Hidden from new purchases. An archived price still works where a subscription already carries it,
and still works if a line of code names it, so the ids are written down and
`tests/pricing.test.ts` holds the list.

| Old product | Product ID | Why |
|---|---|---|
| SPEC seat | `prod_VGms7JaCYAmkV3` | replaced by the four seat products |
| SPEC seat plus training | `prod_VGp2hZXTj5ukFc` | bundle no longer offered |
| SPEC sessions (A$1,007) | `prod_VGp27IVSeLFMCJ` | replaced by SPEC Training at A$1,502 |
| SPEC full control (A$20,888) | `prod_VGp3236DAXd8dA` | not part of the current offer |

### The rule of 8

Kris's rule: a published price should reduce to 8 by repeated digit sum, and three tests enforce
it. **Ten of the eighteen seat prices above do not** — NZD, GBP and CAD's leadership and team
seats, GBP's training seat, and AUD/EUR/USD's training seat (227).

`RULE_OF_EIGHT` in `src/lib/pricing.ts` records the amounts that obey it — 17, 134 and 305 — and a
test holds the set to exactly that, so a new exception cannot arrive without somebody adding it on
purpose. If these prices are ever corrected in Stripe, correct the table and that list together.

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
