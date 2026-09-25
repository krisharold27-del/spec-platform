# Site check — 25 September 2026

A full walk of www.sitevipapp.com: every page, every button, every form.

## How it was checked, and what it could not reach

- **The live site cannot be opened in a browser from the checking machine.** Its network policy
  blocks `www.sitevipapp.com`, so Playwright could not drive the live site directly. The live site
  was checked two other ways instead:
  - **Its pages were fetched through the Vercel connection**, which returns the server-rendered
    HTML. It confirmed the `/look/thanks` crash on live.
  - **Its own runtime error log for the last 7 days was read on Vercel.** This is the record of
    real crashes seen by real visitors.
- **The full browser walk ran against a production build of `main`**, on a local Postgres, with
  the repo's stand-in sign-in server (`scripts/fake-auth.mjs`). It is the same code Vercel deploys.
  It was run twice: once before the fixes, and again at the end on the latest `main` after
  pulling the other two sessions' work (Financials, payroll).
- **Each walk covered:**
  - **Every route in the router.** That is 26 public addresses and 55 signed-in ones, plus the
    anonymous "Have a look inside" demo.
  - **Two screen sizes.** Each page was loaded at desktop width (1400px) and at phone width
    (390px, touch).
  - **Checks on every page:**
    - the HTTP status;
    - console errors and page crashes;
    - failed requests;
    - broken images;
    - horizontal overflow on mobile;
    - load time;
    - any text that looks like a placeholder, lorem ipsum, "coming soon", `undefined`, `NaN`, an
      hourly rate, a client name or a vendor name.
  - **Every internal link found on any page**, fetched once: 141 links.
  - **The click pass: 196 buttons clicked, including every form's submit button.** Each form was
    first filled with test data (test addresses at `journey.test` only). Each click was followed by
    a check for crashes, error text, and whether anything happened at all.
  - **What the pass left alone:**
    - buttons that delete, sign out, withdraw or pay;
    - real payments: Stripe has no key locally, so nothing could be charged;
    - real emails: Resend has no key locally, so nothing could be sent.

## What was broken, and is fixed (all pushed to `main` and deployed)

1. **"Not for me" on the look-around crashed.**
   - *What happened:* anybody who opened "Have a look inside" and pressed **Not for me** got the
     "This page did not load" error page instead of the thank-you. It was broken on live, and in
     the Vercel error log since 12 September.
   - *Cause:* the thank-you page tried to clear a cookie while it was drawing, which Next does not
     allow.
   - *Fix:* the cookie is now cleared on the way there, by a new `/look/leave` step.
   - *Test:* `tests/render-cookies.test.ts` checks that no page ever writes a cookie while drawing.
2. **The public workflow map linked to two dead pages.**
   - *What happened:* `/workflows` offered `/customer` and `/join` as links. Both need the private
     token somebody is sent, so the bare address was a 404.
   - *Fix:* they are now named as "(their link)" rather than linked.
   - *Test:* `tests/workflows.test.ts`.
3. **The Virtual GM linked to the same dead `/customer` page.**
   - *What happened:* one lever on `/virtual-gm` started on the customer's token-only page. The
     final re-walk found this.
   - *Fix:* levers now start on the first page the business itself can open.
   - *Test:* `tests/virtual-gm-overview.test.ts`.
4. **The public look-around named real people and vendor products.**
   - *What happened:* the demo's two worked mirrors credited "Anthony", "Jordan" and "Kris", names
     from a real customer's chart. They also said the rate was "built from Simpro and Xero
     actuals". Anybody can open the look-around without an account, so this was public.
   - *Fix:* the names are now the demo's own invented team (Sam Lee, Jo Barnes, Chris Nguyen), and
     the systems are "the job system" and "the accounts".
   - *Test:* `tests/look-examples.test.ts`.
5. **Two more public pages named vendors.**
   - *What happened:* `/help` asked "Do I have to connect Xero and Simpro?", and `/workflows` said
     "arriving with simPRO".
   - *Fix:* both now say "accounting or job system" / "job management system". Typing "xero" into
     help search still finds the answer.
   - *Tests:* `tests/help.test.ts` and `tests/workflows.test.ts`.
6. **The Stripe webhook kept failing on a business that does not exist.**
   - *What happened:* the live error log showed six checkout deliveries, the last on 24 September,
     for a tenant production has never had (`dev_…`, a checkout started from another environment
     on the same Stripe account). The webhook answered 500 and Stripe kept retrying.
   - *Fix:* it now acknowledges and ignores a checkout for an unknown business.
   - *Test:* `tests/stripe-webhook-stranger.test.ts`.

After each fix: typecheck clean, the full suite green (2,375+ tests), then rebased on the latest
`main` and pushed.

## What was checked and is fine

- **No crashes on any other page**, signed out or signed in, desktop or phone. No console errors
  apart from the intentional 404s.
- **No mobile layout breaks.** No page scrolls sideways at 390px, and spot screenshots of the
  landing page, My Page, Jobs, Org, People, Safety and the Virtual GM read cleanly.
- **Nothing slow.** The slowest page, My Page, loads in under 1 second locally.
- **No broken images, no lorem ipsum, and no "coming soon".**
- **Every button did something.** The first pass flagged a few as "did nothing"; each was
  re-checked by hand and works:
  - "Try the example" fills the box;
  - "Mark as worked through" ticks the item off;
  - "Hazard" is already the selected option, so clicking it changes nothing.
- **The landing page's "Live now" claims are true today.** Each one exists in the product:
  - Virtual GM is `/virtual-gm`;
  - Claude recommends is the labour-rate card on `/virtual-gm`;
  - Switch when ready is `/switch`, where an area appears once the business has a system in that
    category;
  - the weekly "Make it simple" page is the first item on `/meeting`;
  - Angus Shield is honestly marked "Arriving now", and the product says the same.
- **No client or former-employer name on any public page.** The only client name in the product
  is on `/investor`, which is administrator-only.
- **Bad and expired addresses show the proper "There is no page at that address" screen:**
  `/join/<bad token>`, `/customer/<bad token>` and made-up addresses.

## Kris's decisions, 25 September

1. **Hourly rates: kept.** The landing page's "$105/hr" example is a business's own labour rate,
   not what SPEC charges.
2. **Vendor names on the signed-in `/connections` and `/setup/systems` pages: kept.** They help
   people pick their own system. Public pages still name systems by category.
3. **The Simple Guarantee is now automatic.**
   - *What happens now:* when a business tells SPEC something wasn't easy, SPEC credits one month
     of its subscription to its Stripe customer balance, there and then. Stripe takes the credit
     off the next invoice by itself.
   - *What the business sees:* "That month's on us — thanks for telling us."
   - *Never twice:* once per business per month, with three guards:
     - a record that is unique per business per month, claimed before Stripe is asked;
     - a Stripe idempotency key;
     - a check of the customer's existing Stripe credits.
   - *What Kris sees on `/admin`:* every claim, with what was credited and the Stripe transaction.
     A credit that failed shows "Try again".
   - *Where to claim:* the "Tell SPEC" box is now on every area's page under Switch when ready.
     It used to appear only once a switch had started, so most businesses had nowhere to claim
     at all.
   - *Tests:* `tests/guarantee.test.ts`, 20 tests. They drive the real Stripe library against a
     stand-in for Stripe's API, because Stripe cannot be reached from this environment.
   - *Checked in a browser:* first claim, then "already on us" for the same month, one database
     row, and the claim listed on `/admin`.
   - **Not yet run against real Stripe test mode.** The only Stripe account the connector exposes
     is live, and it was not touched. To run it:
     `STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/guarantee-stripe-check.mts`
     The script refuses a live key.

## Still open

1. **There is no `/favicon.ico`.**
   - *What happens now:* the site's icon is `/icon.svg`. Browsers still ask for `/favicon.ico` on
     non-page addresses such as `/robots.txt`, and get a 404. It is harmless: one console line,
     no visible effect.
   - *Proposed fix:* add a `favicon.ico` to `public/`.
2. **A malformed address crashes on Vercel.**
   - *What happens now:* `/spec\` (with a backslash) produced a Vercel "Cannot find module" error
     twice on 23 September. It is Vercel's own handling of a malformed path, not SPEC code.
   - *Proposed fix:* none needed unless it recurs.
3. **The live site should be re-checked in a real browser.**
   - *Why:* this check could only drive the local build, not the live site, because
     `www.sitevipapp.com` is blocked for this environment.
   - *Proposed fix:* allow `www.sitevipapp.com` in the environment's network settings, then rerun
     this walk against it directly.

Older incidents in the live error log that are already resolved: a four-minute timeout burst on
23 September (every route, so the database or platform, not a page), Stripe test/live price
mix-ups on 20–21 September (configuration, since corrected), and `/org` refusals on 18 September
(since turned into proper messages).
