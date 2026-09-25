# SPEC Platform — rule book for every Claude Code session

You are building the SPEC platform for SPEC Business Solutions. **Read this file first in every
session, then read `docs/BUILD_SPEC.md`.**

## Core components — read `docs/CORE-COMPONENTS.md`

**Never remove or hide a core component. Every new feature must be reachable from the menu or a
clearly linked page.** The org chart, My Page, Virtual GM + Virtual Admin, Financials, Jobs, CRM,
People, Safety, Compliance, Board/COGS meeting, the Make it simple report, Setup and Connections are
each in the main menu, the org chart second. `tests/core-components.test.ts` and
`scripts/core-components-journey.mjs` fail the build if one goes missing or errors. (Kris, 25
September, after he could not find the org chart.)

## The mantra: OUTSIMPLE THEM

**Every screen, every step, every decision is judged against it. If SimPro takes fifteen screens,
SiteVIP takes three.**

Kris, 24 September, in the SiteVIP build brief. SimPro is complicated when the job is not — raise a
job, assign it, track it, invoice it. **SiteVIP wins on simplicity, not feature count.** SimPro has
600+ staff, ~20,500 customers and 250,000+ users; competing on features is competing where they are
strongest. Simplicity is where they cannot follow without rewriting their product.

What this means when building:

- A screen that needs explaining has lost. The explanation is the bug.
- Count the steps to the outcome, not the options on the way. Three screens beats fifteen even when
  the fifteen can do more.
- An empty state that says "not set up yet" is not simple, it is unfinished.
- Every question asked of the owner has to earn itself. **The owner provides exactly two things** —
  employees (once, through the org chart) and customers (pulled from wherever they already live).
  Everything else is pre-built. The owner never hears "first we need to get you a safety system."

## The product: SiteVIP, powered by SPEC

**SiteVIP is what a trade business signs up for. SPEC is the engine underneath.** The SPEC report
opens with one question — *How SPEC is your business?* — and answers it through Safety, People,
Earnings and Compliance in turn.

Each pillar has its own system inside SiteVIP, so drilling in never hits "where is this data coming
from, what system?":

| Pillar | System in SiteVIP | Role |
|---|---|---|
| Safety | Safety system | Employees appear automatically; ready from day one |
| People | HR / people system | Fed by the org chart employee list |
| Earnings | Connection to the financial system | Job management sits here |
| Compliance | Compliance system | Sets the rules for the other three |

## 38 means 38

**The SiteVIP app has 38 pages.** They are the capabilities in `src/lib/coverage.ts`, each carrying
its own `built` state.

> Build all 38 pages. Do not report back until every page exists. When finished, list all 38 by name
> with a count. **22 of 38 is a failure, not progress.** If you stop early, say exactly how many are
> left.

A capability may only be marked `yes` when its evidence names a route that exists —
`tests/coverage.test.ts` fails otherwise. Marking something built that is not is worse than leaving
it unbuilt, because it is the number Kris quotes to investors.

Build order, from the brief: **1. HR + safety. 2. Compliance and CRM. 3. Job management last** — the
biggest piece, and the one SimPro gets most wrong.

## Order of authority — read this before anything else

1. **`docs/BUILD_SPEC.md`** — the specification. Data model, arithmetic, authorisation, build order.
   **Where anything disagrees with it, it wins.**
2. **This file** — working rules and conventions for the build.
3. **`DECISIONS.md`** — the running record of corrections.
4. `docs/SPEC_Master_Requirements.md`, `docs/SPEC_Platform_Build_Plan.md` — **historical.** Written
   6 September 2026. Useful context, **superseded wherever they conflict with BUILD_SPEC.md.**
5. **`docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md`** — **every SiteVIP session follows it for anything that
   touches Angus Shield** (the connection, what flows each way, events, security, words, errors,
   versioning, tests). It is the single source of truth both products build to; an identical copy
   lives in the angus-shield repo. Change it only in both repos on the same day, version bumped.
   Separate products, seamless together: "SiteVIP powered by SPEC" and "Angus Shield powered by
   SPEC", both made by SPEC Business Solutions.

The specification is maintained as a set of published artifacts; `docs/BUILD_SPEC.md` is their
distillation into buildable form. **Do not re-derive rules from the older docs.**

## What SPEC is

SPEC — Safety, People, Earnings, Compliance — is a GM-to-board operating system. **It is designed for
board function and oversight**: it takes the four sections every board already reviews and gives each
one a live source, which turns the org chart from a diagram into the instrument the board reviews
through.

**Every business reports to a board, whether or not it has one** — a bank, an owner, an investor, a
franchisor, a major customer. The board layer is never optional and never a tier.

Guiding principles, in order: make money; do it safely; ensure all staff love their job and are
amazing at it. Compliance and governance protect those three.

## Non-negotiable design rules

1. **Role first, person second.** Roles are defined by what the business needs; a person is assigned
   to a role. Criteria and KPIs hang off `roles`, **never** off `users`. A role may exist with nobody
   in it. Reassigning a person never edits the role.
2. **Only me and above.** A person's card is visible to that person and everyone above them in their
   own chain. **Never sideways. Never below.** Enforced server-side in `src/lib/scope.ts` — every
   read path goes through it. See BUILD_SPEC §2.
3. **Read to inform, not write to change.** No AI path writes a score, target, KPI or structural
   change. Ever.
4. **Nothing recalculates history.** A locked period keeps the structure, targets and chain it had.
5. **Nothing is sent.** No email carries business content; nothing is attached or linked. The board
   reads the pack in SPEC on a free board seat. Withdrawal is an administrator-granted right.
6. **SPEC as a company has no access to tenant content.** No support tool renders it, no query path,
   no break-glass. **Every capability support would perform is one the administrator screen owes the
   customer** — self-service recovery, audit, undo.
7. **Manual is a complete, permanent mode.** No connector is ever required for any feature.
8. **The business's own managers control KPIs and scoring.** SPEC proposes and sense-checks; never
   sets.
9. **Pending is never red.** Not-measured-yet is not doing-badly.
10. **Ask once, at the moment it is relevant, and never nag.**
11. **If it's not simple, it's wrong.** Fewer screens, fewer fields, plain words.
12. **Solutions, not commentary.** Any report of a miss carries a proposed fix.
13. **Nothing client-specific in the repo** — no names, no financials. Clients live only in their own
    tenant rows.
14. **Nothing lives only in a chat.** Decisions go in `DECISIONS.md`; specs in `docs/`.

## Tone

**This talks to mature adults.** Business leaders are never treated as children or as problems to be
managed — no pep talk, no counselling, no naming their psychology back at them. State the facts and
the decision and let them decide. Never build anything that explains their own job to them.

## Access levels

`administrator` · `full` · `readonly` (stored as `readonly`, not `read_only`).

| Level | May |
|---|---|
| `administrator` | Seats · grants · region, currency, financial year · entities · confirm the chart · name the recovery contact. **Administration, not management** — scope still limits what they manage. |
| `full` | Manage KPIs and marks **within their own scope** (own role and everything beneath). Cannot add a seat or widen visibility. |
| `readonly` | See their own card in full including the working; comment on their own month. |

**A GM is the tenant's first administrator by default** — someone must be able to add seats on day
one. **No exception by job function**: HR, finance and EAs get access through grants, visible on
their profile, with an end date.

## Scoring — BUILD_SPEC §3 is authoritative

- Seven statuses → three values. **`confirmed`/`met`/`on_track` = Y · `not_met` = N ·
  `pending`/`not_tracked`/`watch` = NA.**
- **NA rows are excluded from BOTH sides of the fraction.** They are absences, not zeros.
  *(This corrects an earlier rule in this file which said a blank scores 0 and stays in the
  denominator. It does not. An unmarked KPI must never drag a score down.)*
- `pillar% = Σ(weight where Y) / Σ(weight where Y or N) × 100`. A pillar where everything is NA has
  **no score** and is left out of the role mean.
- `role% = mean(pillars that have a score)`, unweighted.
- `team% = mean(role% for every person in that team who has a score)`.
- **Watch guard:** `watch` for two consecutive closed months resolves to `not_met` on the second lock.
- Weights within a pillar must sum to 100%; enforced on save by `validateWeights`.
- **90% rule:** every pillar of the team roll-up ≥ 90% for two consecutive closed months.
- **Hard gates**, pass/fail, reported separately from scores: Zero Harm (any LTI/MTI/psychosocial > 0
  fails); Clear to Work (training compliance 100%). *These exist in the build and are not yet in
  BUILD_SPEC — keep them, and flag for the spec to catch up.*
- Snapshots are append-only per period. **Never overwrite a locked period** — corrections are dated,
  attributed amendments shown beside the original.

## Periods

A period is a **calendar month of work, marked and locked during the month that follows it** — August
closes during September, because that is when the P&L lands. Locking is a person's decision, not a
date. The next period reloads with the same roles, KPIs and targets, all marks back to `pending`.

## Pricing — **two kinds of seat, not one flat rate**

Superseded 19 September (design 15) and this file had not caught up — corrected 20 September after
Kris: *"remember pricing is for leadership seats and team member seats."*

**Leadership seat** — somebody who leads people (their title says so, or somebody reports to their
role, per `seatKindFor` in `lib/chart-seats`). **Team seat** — everybody else, priced in a pool.

**Corrected 23 September** — this used to say "never a field anybody sets", and that was wrong.
Kris added Janine, an Ops Admin with nobody reporting to her, and the chart's own rule billed her as
leadership anyway because `seatKindFor` reads both title *and* whether anybody reports to the role,
and one of the two agreed by accident. Working as designed, and still the wrong bill. Then, in the
same conversation: *"we need the capacity to chose whther leadership seat or team seat when sending
their email to join - then they see they are joining a leadership or team memvber seat."* Asked
whether the invite screen should merely show the chart's own answer or let somebody genuinely
override it, he chose the override: **"Let me override it by hand per invite."**

So `users.seatKindOverride` now sits beside the chart's own read — `null` defers to the chart exactly
as before and self-corrects if the chart changes; set, it is a stated choice that wins until changed
by hand. `resolveSeatKind(role, override)` in `lib/chart-seats` is the single place this is decided,
and billing (`lib/plan`), training eligibility (`lib/pricing`'s `eligibleForTrainingSeat`) and the
org chart's own badge all call it, so the three can never disagree with each other even though one of
them can now disagree with the chart.

**Who may set it — narrower than who may edit the chart.** Same conversation, straight after:
*"make it that only someone in a leadership seat can invite someone to join the org chart - they
then decide if this is a leadership seat or member seat."* `scope.canInvite` (`lib/scope`'s
`mayInvite`) is true only when the CALLER's own resolved seat is `'leadership'` (or they are an
unplaced administrator, the same day-one founder carve-out `canShapeChart` already had) — not the
broader `canEdit`/`canShapeChart`/`canAdminister` gates. That one gate covers both halves: whether
somebody may invite at all, and whether they may choose the invitee's seat kind or change an existing
seat's override afterwards.

**A live subscription now follows the chart, not just the checkout.** Corrected 23 September, right
after the override above shipped and Kris saw how easily a chart drifts from what it started as:
*"yes stripe needs to auto sync as I could never keep up if there are 100's of companys."* A
subscription's quantity used to be set once, at the moment of checkout, and never touched again — a
business that grew from six leaders to nine, or moved somebody onto team, kept paying the day-one
number until an administrator opened Stripe by hand. `syncSubscriptionSeats` (`lib/plan`) is called
after every write that can change what a business owes — an invite, a seat-kind override, a person
moved or swapped, a role reparented, a role vacated — from `lib/invite`, `app/org/actions.ts` and
`app/setup/people/actions.ts`. Best-effort, like every other Stripe-adjacent write: it swallows its
own errors so a Stripe hiccup never breaks the chart edit that triggered it, and the very next write
anywhere on the chart tries again. **Never silently** (corrected 23 September, after two saves on
/billing left JBI's subscription on the old count with nothing in the logs): every ending — no key, no
subscription id, already in step, updated, failed — is one `[seat-sync]` log line and a returned
outcome; a save on /billing lands back there saying which; and /billing compares the live
subscription with its own bill on load (cached a minute, streamed, never blocking) and offers
"Bring the subscription into line" when they differ. The bill, the checkout, the sync and the rows on
/billing are one count — `classifySeats` in `lib/plan`, active roles only. A price-override env var
that differs from `lib/pricing` is ignored on a live key and named on /status.

Six regions, decided per region rather than converted (`lib/pricing`'s `SEAT_PRICES`, transcribed
from the live Stripe account, is the source of truth — this table is not):

| | Leadership | Team |
|---|---|---|
| Australia (AUD) | $134 | $17 |
| New Zealand (NZD) | $180 | $23 |
| United Kingdom (GBP) | £88 | £11 |
| Europe (EUR) | €134 | €17 |
| United States (USD) | $134 | $17 |
| Canada (CAD) | $180 | $23 |

Each also has an Advanced (with-AI) rate — not sellable yet, see `AI_TIER_ON_SALE` in `lib/plan`.

**The first seat is free**, and it is the first leadership seat — the person who started the business (Kris, 23 September); a team seat is free only when there is no leader — see
`FREE_SEATS`/`seatBill` in `lib/plan`. **No minimum. No tier that unlocks features. People on the
chart without a seat are free. Board roles are free.** A lapsed subscription goes read-only; export
always works.

**A live setting can silently disagree with this table and nothing here would show it** — see
DECISIONS.md, 20 September, on a leadership seat quietly billing the team rate for a day because a
Vercel env var still named an old flat-rate price. Check Stripe/Vercel directly rather than trusting
this file for what a customer is actually charged.

## Org model

- Roles report to roles. Streams under the GM: **Commercial** · **Operational** · **Growth** — COGS,
  which is also the weekly senior meeting's membership.
- Levels: `director` · `gm` · `manager` · `supervisor` · `specialist` · `technician` · `apprentice`.
- **Entities are sealed branches** of one tenant: no `reportsToRoleId` may cross an entity.
- **Board roles sit on top and are not functional** — no KPIs, no score, no roll-up, no incentive.
- Three-tier P&L: Operations on operational EBITDA; GM on controllable cash net profit; owner/board on
  full statutory P&L.

## Stack and conventions

Next.js App Router + TypeScript · Drizzle ORM · Supabase Postgres with RLS by `tenant_id` · Tailwind +
shadcn/ui · Anthropic API · Vercel · Resend · Stripe.

Scores are computed, never stored — **except `period_scores`, frozen at lock and never recomputed.**
Pure logic in `src/lib/`, tested in `tests/` with vitest. **Small commits, one page or one function
per session.** Australian English in UI copy. Every session ends with `npm test` passing, a commit and
a push.

## The never list

- No cross-tenant read path, for any reason.
- Nothing recalculates history.
- No leaderboard, ranking, sort-by-score or comparison anywhere, including anonymised.
- Nothing emailed with content, attached, or linked. No public links, no "anyone with the link", no
  staff-initiated invitations, no guest accounts.
- No self-elevation of visibility, by anyone, including an administrator acting for someone else.
- No AI writes a KPI, target, score or structural change. **No API key ever reaches the browser.**
- No vendor name in the schema or the UI — connectors are **by category, never by vendor**.
- No client is ever named by SPEC — no logo wall, no case studies, ever.
- No feature tour, no tooltip carousel, no "here's what you can do".
- No blank form a leader has to invent an answer for. **SPEC proposes; the leader edits.**
- No re-asking for anything the business has already told SPEC.
- Pending is never red.

## Live configuration: never state it, always ask

**Resend is already set up.** `specbizhq.com` is verified, `RESEND_API_KEY` is in Vercel, and
`app.specbizhq.com/status` shows email as **Working**. Do not tell Kris to configure it.

The general rule, which is what actually matters here:

> **Nothing in this repository knows the state of the live system.** Settings live in Vercel and
> change without a commit. `/status` asks the running system; a file recites a note.

So: **check `/status` before asking anybody to configure anything** — and if you are in a sandboxed
session where `specbizhq.com` is blocked by the egress policy (it usually is), the honest answer to a
configuration question is *"I cannot see it from here — what does /status say?"*, never a
recollection.

This is written down because it went wrong on 17 September: `docs/READINESS.md` said
`RESEND_API_KEY` was unset, which had been true days earlier, and Kris was told to spend an afternoon
setting up something that was already working and had sent an email minutes before. A stale fact in a
confident sentence is worse than no fact, and a document that records live state will always go
stale.

The same applies to `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, the webhook secret and the price IDs.
`/status` names every one of them and says whether it WORKS, not merely whether it is present —
which it was rebuilt to do after being caught reporting presence alone.

## Your database is not the one that ships

**Local development has 62 foreign keys. CI and production have none.**

That is not an accident — `additivePlan` in `src/lib/schema-sql.ts` deliberately emits no foreign
keys, and says why. But a developer database built with `drizzle push` gets all of them, so the two
are shaped differently in a way nothing announces.

It cost four red CI runs on 17 September. Code that worked out its delete order from
`pg_constraint` was correct locally and a silent no-op in CI: no constraints to read, so no edges,
so no order — parents deleted before their children, and no constraint left to refuse it either.
The failure was identical on every run and impossible to reproduce on the machine that wrote it.

So:

> **Never ask the database about its own shape.** Ask the schema — `tableShapes()`,
> `referenceEdges()`. The schema is the same everywhere; the database is not.

And when something fails only in CI, ask what CI's database has that yours does not before assuming
a flake. To reproduce it: make an empty database, run `scripts/deploy-migrate.ts` at it, and point
the journey there.

## Seed data

`seed/diagnostic.json` · `seed/criteria_templates.json` · `seed/rulebook.json`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
