# SPEC Business Solutions — Go-live and Operations Plan

How the platform goes live, how a LinkedIn click becomes a paying business, how money is handled, and how one person manages it day to day. Prepared 6 September 2026.

---

## 1. The funnel, end to end

1. **LinkedIn ad** — the four questions as the creative. Click → `specbizhq.com/start`.
2. **Website** — the existing marketing site stays wherever it is built. It carries the pitch, the four questions, and one button: *See what this means for my business*. That button goes to the app.
3. **App** — lives at `app.specbizhq.com` (a subdomain of the same domain, so it looks and feels like one site). The four answers travel with the visitor to sign-up.
4. **Free trial** — sign-up creates the business on **Basic (trial)**. They can do everything in Stage 0 and Stage 1 (register Claude, answer expectations, build roles, set KPIs, assign people) but cannot open a scoring period until they pay. That is deliberate: the trial shows them their own org chart and KPIs — enough to *want* the system — without giving away the monthly rhythm.
5. **Pay** — a *Start Basic — $100/year* button opens Stripe Checkout (card, Apple/Google Pay). On success Stripe tells the app, the tenant flips to `basic`, the first period opens, and the journey continues.
6. **Use** — monthly scoring, board output, journey milestones. Claude does the guiding.
7. **Program** — *Ask about a Program* on the journey page records the request and emails you. You call them. Program pricing is invoiced outside the app (Xero), because it is a consulting engagement with a contract, not a click-to-buy.

Trial length: gate by *stage*, not by days. A business that never finishes setup never pays, and never costs you anything.

## 2. Where it runs

| Piece | Service | Why | Cost (approx.) |
|---|---|---|---|
| App hosting | Vercel Pro | One-command deploy from GitHub, custom domain, SSL. Hobby tier prohibits commercial use. | US$20/month |
| Database + sign-in | Supabase Pro | Postgres, magic-link email sign-in, row-level security per tenant, daily backups. Free tier pauses idle projects, so Pro for production. | US$25/month |
| Payments | Stripe | Checkout, subscriptions, GST via Stripe Tax, invoices, dashboard. | 1.65% + A$0.30 per domestic card payment (no monthly fee) |
| Transactional email | Resend (or Postmark) | Invites, magic links, "your board output is ready". | Free tier to start; ~US$20/month later |
| Claude | Anthropic API | Board output rewrite, "why this KPI", guidance. | Usage-based; at 1,000 Basic businesses roughly a few hundred dollars a month, far less early |
| Domain | Existing registrar | Add `app.` subdomain pointing at Vercel. | Nil extra |

Total fixed cost at launch: roughly A$70–100/month plus Claude usage. At $100/year per Basic business, the fixed costs are covered by the first dozen customers.

## 3. Payments in detail

- **Product in Stripe:** "SPEC Basic — annual", A$100/year, recurring. Stripe Tax on, GST registered → the customer sees $100 inc. GST (or set $100 + GST; decide once and keep it).
- **Checkout, not custom forms.** Stripe hosts the card page; you never touch card numbers, which keeps compliance trivial.
- **Webhook** (`/api/stripe/webhook`): on `checkout.session.completed` → tenant plan = `basic`, store the Stripe customer and subscription ids, open the first period. On `invoice.payment_failed` or `customer.subscription.deleted` → plan = `lapsed`: read-only access, no new periods, banner with a *Renew* button. Never delete their data.
- **Customer portal:** Stripe's hosted portal handles card changes, invoices and cancellation. Link it from the journey page as *Billing*.
- **Refunds:** from the Stripe dashboard. Policy suggestion: full refund within 14 days if no period has been opened.
- **Programs:** invoiced from Xero as now. The app just records the request and who to call.

## 4. Managing it — what you actually do

**Admin console** (`/admin`, only your email): every business, plan, journey progress (steps done / 10), last activity, Program requests, and a *sign in as* button for support. This is the one screen you manage from.

**Weekly routine (30 minutes, fits the daily-session structure):**
- Monday: open `/admin`. New sign-ups since last week; anyone stuck on the same step for 7+ days gets one email from you (template in the console).
- Program requests: call within 48 hours. The request stores their four-question answers and Question Zero, so you open the call knowing where it hurts.
- Stripe dashboard: failed payments, disputes (rare at $100).
- Vercel/Supabase: nothing unless an alert email arrives.

**Support:** Claude inside the app answers "how do I…" questions. A *Get help* link emails manager@specbizhq.com. At Basic scale that inbox is you, once a day.

**Monthly:** Supabase backup check (automatic on Pro); review Claude API spend; export the anonymised rule-book learnings from any Program that finished.

**Updates:** you change code on your PC with Claude Code, push to GitHub, Vercel deploys in about a minute. Every push runs the scoring tests first; a failed test blocks the deploy.

## 5. Before the first ad runs

- ABN and GST on the Stripe account; business bank account connected.
- Terms of Service and Privacy Policy pages (Australian Privacy Act; you hold client business data, so say what you store, that it is per-tenant, never shared, and never used to train anything).
- Confidentiality line on the website: no client is ever named publicly.
- A test purchase with a real card, then refunded.
- The four-question landing page live on the website with the button pointing at `app.`.
- Claude registration guidance page checked against current Claude Team/Enterprise sign-up steps.

## 6. What gets built next (Phase 3) to make all this true

1. Supabase Auth (magic-link email) replacing the dev sign-in; Postgres in place of SQLite; RLS policies by `tenant_id`.
2. Stripe Checkout + webhook + customer portal; `plan` states `trial` / `basic` / `lapsed` / `program`; period-open gated on plan.
3. Email: invites, magic links, board-output-ready, stuck-on-a-step nudge.
4. `/admin` console.
5. Terms and privacy pages; support link.
6. Deploy to Vercel on `app.specbizhq.com`.

Estimate with Claude Code: two to three working sessions for 1–2, one each for 3–6.
