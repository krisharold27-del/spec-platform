# SPEC Business Solutions — Go-live Setup Checklist

Work through these in order. Each step says who does it (**You** in a browser, or **Claude Code** on your PC), roughly how long it takes, and what to bring back to the next step. There is no separate website: the app *is* the website — the four-questions page is the front door.

Keep every key and password in a password manager, never in a chat. Where a step asks you to "give Claude Code the key", paste it into the `.env` file on your PC, not into a conversation.

---

## Part A — Accounts (about 90 minutes, all in a browser)

**A1. GitHub** — You · 10 min
1. Create a free account at github.com with kris@ your business email (or Gmail for now).
2. Create a new **private** repository named `spec-platform`. Leave it empty.
3. Bring to Part B: the repository URL.

**A2. Domain** — You · 15 min
1. Check `specbizhq.com` at a registrar such as VentraIP, Crazy Domains or Namecheap. Chosen 6 Sept 2026. Buy the .com only.
2. Buy it. Do not buy hosting, website builders or email add-ons — none are needed.
3. Bring to C2: the registrar login.

**A3. Anthropic (Claude API)** — You · 10 min
1. Go to console.anthropic.com, sign in with your Claude account, create an organisation "SPEC Business Solutions".
2. Billing → add a card → add US$20 of credit to start.
3. API Keys → create key named `spec-platform-prod`. Copy it once; it is only shown once.
4. Bring to B3: the key (starts with `sk-ant-`).

**A4. Supabase** — You · 10 min
1. supabase.com → sign up with GitHub (from A1).
2. New organisation "SPEC Business Solutions", plan **Pro** (US$25/month). New project "spec-platform", region **Sydney (ap-southeast-2)**, generate a strong database password and save it.
3. Project Settings → API: copy the **Project URL**, the **anon public** key, and the **service_role** key.
4. Project Settings → Database → Connection string (URI, "Transaction" pooler): copy it.
5. Bring to B3: those four values.

**A5. Stripe** — You · 30 min (identity checks may take a day to clear)
1. stripe.com → create account for SPEC Business Solutions (Australia). Complete the business verification: ABN, business address, director ID details, bank account for payouts.
2. Settings → Tax → enable **Stripe Tax**, confirm GST registration status.
3. Product catalogue → Add product: **SPEC Basic**, recurring, **A$100 per year**, tax behaviour "inclusive" (the customer sees $100). Copy the **Price ID** (starts with `price_`).
4. Settings → Customer portal → enable; allow customers to update payment method and cancel.
5. Developers → API keys: copy the **Secret key** (`sk_live_…`) and **Publishable key** (`pk_live_…`). Also copy the *test* pair (`sk_test_…`, `pk_test_…`) for trying it before going live.
6. Bring to B3: price ID and both key pairs. The webhook secret comes later in C3.

**A6. Resend (email)** — You · 10 min
1. resend.com → sign up. Free tier is enough to start.
2. Domains → add your domain from A2. It gives you three DNS records; add them at the registrar (Part C2 shows where). Verify.
3. API Keys → create `spec-platform`. Copy it.
4. Bring to B3: the key (`re_…`).

**A7. Vercel** — You · 5 min
1. vercel.com → sign up with GitHub. Create team "SPEC Business Solutions", plan **Pro** (US$20/month; Hobby prohibits commercial use).
2. Nothing else yet — the project is imported in C1.

---

## Part B — Your PC (about 1 hour)

**B1. Tools** — You · 20 min
1. Install **Node.js LTS** from nodejs.org (accept defaults).
2. Install **Git** from git-scm.com (accept defaults).
3. Install **Claude Code**: open PowerShell and run `npm install -g @anthropic-ai/claude-code`, then `claude` and sign in with your Claude account.
4. Install **VS Code** (optional, for reading files).

**B2. The repo** — You · 10 min
1. Unzip `spec-platform-phase2.zip` into `Desktop\SPEC code\spec-platform`.
2. In PowerShell: `cd "$HOME\Desktop\SPEC code\spec-platform"` then `npm install`, then `npm test` — nine tests should pass.
3. Connect it to GitHub: `git remote add origin https://github.com/krisharold27-del/spec-platform.git` then `git push -u origin master`.

**B3. Secrets file** — You · 10 min
Create a file named `.env.local` in the repo folder (never committed) with:
```
DATABASE_URL=<Supabase connection string, A4.4>
NEXT_PUBLIC_SUPABASE_URL=https://uzkqydadhlilqzeftcng.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<A4.3 anon key>
SUPABASE_SERVICE_ROLE_KEY=<A4.3 service_role key>
ANTHROPIC_API_KEY=<A3>
STRIPE_SECRET_KEY=<A5 sk_test_ for now>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<A5 pk_test_ for now>
STRIPE_PRICE_BASIC_ANNUAL=<A5 price_>
STRIPE_WEBHOOK_SECRET=<filled in at C3>
RESEND_API_KEY=<A6>
APP_URL=http://localhost:3000
ADMIN_EMAILS=kris.harold27@gmail.com,manager@specbizhq.com
```

**B4. Phase 3 build** — Claude Code · 3–4 sessions
Open `claude` in the repo folder and run these one at a time. Each ends with `npm test` passing and a commit.
1. *"Read CLAUDE.md and docs/SPEC_GoLive_and_Operations.md §6. Replace the dev sign-in in src/lib/auth.ts with Supabase Auth magic-link email, keep the same getCurrentUser interface, and switch src/db to Postgres using DATABASE_URL. Add RLS policies by tenant_id in a migration."*
2. *"Add Stripe: a /api/stripe/checkout route that creates a Checkout Session for STRIPE_PRICE_BASIC_ANNUAL, a /api/stripe/webhook route that sets tenants.plan to basic on checkout.session.completed and lapsed on payment failure, a Billing link to the customer portal, and gate 'open first period' on plan in (basic, program). Trial tenants can complete Stage 0–1 only."*
3. *"Add Resend email: invite on assignPerson, magic-link sign-in, 'board output ready' on period lock, and a stuck-on-step nudge template. Add /admin (ADMIN_EMAILS only): tenants, plan, journey progress, program requests, sign-in-as."*
4. *"Add /terms and /privacy pages from docs, a Get help link, render board output markdown, and make /start the root page for signed-out visitors."*
5. Run locally: `npm run dev`, open http://localhost:3000, walk the journey once yourself with a test card (4242 4242 4242 4242).

---

## Part C — Go live (about 1 hour, plus DNS wait)

**C1. Deploy** — You · 10 min
1. vercel.com → Add New Project → import `spec-platform` from GitHub.
2. Environment Variables: paste every line from `.env.local`, but with the **live** Stripe keys and `APP_URL=https://app.specbizhq.com`.
3. Deploy. You get a `*.vercel.app` URL — check it loads.

**C2. Domain** — You · 15 min + up to 24 h propagation
1. Vercel → Project → Settings → Domains → add `app.specbizhq.com` and `specbizhq.com` (root). Vercel shows the DNS records needed.
2. At the registrar (A2) → DNS: add those records, plus the three Resend records from A6.
3. Root domain: set Vercel to redirect `specbizhq.com` → `app.specbizhq.com` so the bare domain lands on the four questions.

**C3. Stripe webhook** — You · 5 min
1. Stripe → Developers → Webhooks → Add endpoint `https://app.specbizhq.com/api/stripe/webhook`, events: `checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`.
2. Copy the **Signing secret** (`whsec_…`) → Vercel env `STRIPE_WEBHOOK_SECRET` → redeploy.

**C4. Supabase auth URLs** — You · 5 min
Supabase → Authentication → URL Configuration: Site URL `https://app.specbizhq.com`, add it to Redirect URLs.

**C5. First real run** — You · 20 min
1. Go to `https://app.specbizhq.com` on your phone. Answer the four questions, sign up as a test business, register Claude, build one role, pay $100 with your own card, open a period, lock it, read the board output.
2. Stripe → refund the payment. Admin → delete the test business.
3. Invite one friendly business owner to do the same before any ad runs.

**C6. Legal and business** — You · 30 min
1. Terms and Privacy pages reviewed (Claude Code drafted them in B4.4; read them once yourself; a lawyer's read is worth it before scale).
2. Business email `hello@specbizhq.com` and `manager@specbizhq.com` set up (Google Workspace or the registrar's email, ~A$10/month) — support goes to you.
3. Xero: SPEC Basic sales will arrive via Stripe payouts; set up the Stripe bank feed rule once.

---

## Part D — First customers

**D1. LinkedIn** — You · 1 hour
1. Company page "SPEC Business Solutions" (the personal-brand rules: no former employer or client names anywhere).
2. First post: the four questions and the link. Run it organic for a week before paying for ads.
3. Ad: same creative, link to `https://app.specbizhq.com/start`, audience: owners/MDs, Victoria and southern NSW, electrical, plumbing, logistics, company size 50–250. Start at A$50/day.

**D2. Weekly routine** — You · 30 min every Monday
`/admin`: new sign-ups, anyone stuck 7+ days (one email), Program requests (call within 48 h), Stripe failed payments.

---

## Order of operations if you only have an hour today
A1 → A2 → A4 → A3. Everything else builds on those four.
