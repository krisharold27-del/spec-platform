# SPEC Platform — rule book for every Claude Code session

You are building the SPEC platform for SPEC Business Solutions. **Read this file first in every
session, then read `docs/BUILD_SPEC.md`.**

## Order of authority — read this before anything else

1. **`docs/BUILD_SPEC.md`** — the specification. Data model, arithmetic, authorisation, build order.
   **Where anything disagrees with it, it wins.**
2. **This file** — working rules and conventions for the build.
3. **`DECISIONS.md`** — the running record of corrections.
4. `docs/SPEC_Master_Requirements.md`, `docs/SPEC_Platform_Build_Plan.md` — **historical.** Written
   6 September 2026. Useful context, **superseded wherever they conflict with BUILD_SPEC.md.**

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

## Pricing — **$26 per seat per month**

Per region, decided rather than converted, every price reducing to 8: AUD $26/$44 · NZD $35/$53 ·
GBP £17/£26 · EUR €26/€44 · USD $26/$44 · CAD $35/$53.

**No minimum. No tier that unlocks features. People on the chart without a seat are free. Board roles
are free.** A lapsed subscription goes read-only; export always works.

**The A$100/year "Basic" plan, the stage-gated trial, and periods locked until payment are
superseded** and need rebuilding — see BUILD_SPEC §8.3. The `tenants.plan` column and the Stripe
products still reflect the old model.

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

## Seed data

`seed/diagnostic.json` · `seed/criteria_templates.json` · `seed/rulebook.json`.
