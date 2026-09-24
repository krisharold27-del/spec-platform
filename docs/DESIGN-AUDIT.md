# Audit — every item in `designs/handoff-README.md`

24 September 2026. Every line of the handoff README, checked against the product actually running,
signed in as a new business. Screenshots of all 34 pages were taken in the same run.

**How to read it.** ✅ done · ◐ partly done · ✗ missing. "Partly" always says what is missing, not
just that something is. Where a thing was checked by opening the page, the page is named; where it
was checked in the code, the file is named. Nothing here is marked done because a file exists —
34 pages were loaded in a browser and none of them crashed, which is the floor, not the ceiling.

---

## The four pillars — the non-negotiable framework

| Item | | Evidence |
|---|---|---|
| S·P·E·C on every KPI, scorecard and problem | ✅ | `lib/pillars`, `lib/scoring`; every screen carries the four |
| 90%+ on every pillar, two consecutive months | ✅ | `lib/ace-watch` (`SPEC_STANDARD`), `tests/ace.test.ts` |
| Below 90% on Safety or Compliance is a hard gate | ✅ | `lib/calculator`, `lib/board-output`; shown on /scoring and /summary |
| Colour is the result, the letter is the pillar | ✅ | `LIGHT_COLOUR` / `LIGHT_INK` in `lib/today`, held by tests |
| Brand pillar colours never used as status | ✅ | no pillar hue appears in any status path |
| Org chart connector lines carry the score | ✅ | `lib/orgchart`; stub = own score, rail = worst child, riser = that child |
| Caprasimo headings, Figtree body, ground `#f5ead8` | ✅ | visible on every screenshot |
| Animated ring-clock logo, claw sweeps red→green, snaps at 12, never loops back | ✅ | `components/spec-mark` — the claw pivots at the centre and lands on twelve, with a crown at the end. I marked this "partly" on a first pass and was wrong; it is built to the spec |
| 100-dot mascot | ✗ | assets are in `designs/`; nothing in the product uses them. Campaign/social use only, so this costs nothing today |

## The entry flow

| Item | | Evidence |
|---|---|---|
| Landing: "Simple." hero, problem box, live diagnosis, routing question, labour-gap stat, pricing, final CTA | ✅ | `/` |
| One-shot, stores nothing, Enter submits | ✅ | `/` |
| YES/NO → business name → "who is the leader of these solutions" | ✅ | the three routes all exist |
| "I can't do this, it's too hard" → `manager@specbizhq.com` | ✅ | on `/` |
| Problem carried into My Page as Opportunity #1 | ✅ | a real signup + database write, not localStorage |
| Snap Score on Landing as a static explainer | ✅ | `/` |
| Sign In wired to real auth | ✅ | Supabase; `scripts/journey.mjs` proves it end to end |
| One business per login, switcher stub | ✅ | `/businesses` when somebody holds more than one seat |

## My Page — the daily hub

| Item | | Evidence |
|---|---|---|
| Header: whose page, bell, business switcher | ✅ | `/my-page` |
| My four lights | ✅ | S·P·E·C tiles, current month |
| What needs me today | ✅ | 8 items on a fresh business, each one actionable |
| My team — direct reports only | ◐ | "Where you sit" names the role and who it reports to; **there is no list of direct reports each linking into their scorecard**. `/team` has the roll-up, so it is one click away rather than on the page |
| KPI reports from connected systems | ✗ | nothing on My Page reads the Connections feeds. `/connections` shows health; the numbers do not surface here |
| Improvement register, with the lifecycle | ✅ | `lib/register` — priority, visibility, recurrence, look-back audit, reopen, accept/deny, signed-off |
| "improvement opportunity" language inside the app | ✅ | "problem" only on the public page |
| Snap Score, managers and above only | ✅ | `lib/register` `snapScore`; gated on the same population as the power meter |
| Ask anything, visually separate from Improvement | ✅ | different column, different treatment — not mistakable |
| Messages, training progress, weekly meeting log | ◐ | training and the meeting are reachable from the directory at the foot of the page; **they are not sections on it** |
| Virtual GM Power Meter, 0–100, "HACC Your Power" | ✅ | in the header; `lib/power-meter` resolves 24 KPIs, big five at 15% |
| Power meter breakdown names the source of every KPI | ✅ | `lib/power-meter` |
| **"Is the business going well?" — one verdict + four tiles** (24 Sep) | ✗ | the four tiles exist; **the verdict line, the 3-closed-month rolling average, the on-pace projection and the serious-event amber cap are not built** |
| **"Your job today" — ordered role steps with deep links** (24 Sep) | ◐ | "What needs me today" is a live checklist, but **it is generated from KPI gaps, not the role's ordered steps, and does not deep-link into Jobs tabs** |
| **Late quotes in a solid red band, with the escalation ladder** (24 Sep) | ✗ | not built |

## The AI diagnosis engine

| Item | | Evidence |
|---|---|---|
| Real Claude call, not a letter-shuffle | ✅ | `lib/diagnose` |
| Bloom-out marked definite vs possible | ✅ | |
| People is never "possible" | ✅ | held by a test |
| Harm to a person is always Safety | ✅ | held by a test |
| **P-stack first, in the fixed four-beat order** | ✗ | This is the one I got wrong on a first pass and checked properly. The system prompt in `lib/diagnose` fixes the order of the **pillars** — P → C → E, "never any other order" — which is not the same thing. The README's four beats are **define the role → select the right person → train the person → train their manager**, and none of those four words appear in the prompt. A problem that entered on P is supposed to *drill deeper* through the same four beats to find which one failed; today it simply stays on P. This is the method, not a style choice, and it is the part of the diagnosis a customer is paying for |
| Entry pillar drops out when it was the symptom | ✅ | |
| Every solution cashes out through the chart and KPI design | ✅ | |
| No owner → "of course we can address this, and it starts with the people" | ✅ | wording held by a test |
| Maturity lens never reaches the UI | ✅ | held by a test |
| Tailored to the business's industry and location | ◐ | Industry yes, and the prompt does name real legislation — the WHS Act, Fair Work, Chain of Responsibility — and defaults to Australia. But **the business's state is never passed in**, so it can only say "the state WorkSafe / SafeWork regulator" in the abstract. The same advice goes to Victoria and to Queensland. `/safety` now knows the state; the diagnosis does not read it |

## Other app screens

| Item | | Evidence |
|---|---|---|
| Org chart: right-click add, drag to re-parent, collapse, scope selector, team badges, Ace badges | ✅ | `/org`, `scripts/org-journey.mjs` (21 checks) |
| Org chart layout: `reserve()`/`walk()`, cumulative row gaps | ✅ | rebuilt with fixed card size and symmetric links, 23 Sep |
| Team seats: add a team, name it, drill in, shared S/P/E/C | ✅ | |
| KPI editor on any pillar card, role-appropriate examples, duplicates rejected | ✅ | |
| My Scorecard, sliders, comments, direct reports | ✅ | `/me`, `/scorecard/[roleId]` |
| Monthly Scoring: entry, source confirmation, gates, sign-off and lock | ✅ | `/scoring`, `scripts/signoff-journey.mjs` |
| Board Pack: four pillars vs 90%, gates, flagged unsupported numbers, approve/deny | ✅ | `/board` |
| Group roll-up, unlocked entities named not estimated | ✅ | `/group` |
| People: roles, Ace tracking, recruitment | ✅ | `/people` |
| People: Reviews & conduct, Pay & exits (23 Sep) | ✅ | both tabs are there |
| People: staff list, contracts, award check, payroll export | ✅ | |
| **People → Subcontractors** (24 Sep) | ✗ | not built. Six onboarding checks, Clear to Work gate, light scoring, invoice matching — none of it |
| **Subcontractors as a team node on the org chart** (24 Sep) | ✗ | not built |
| Training: learner path, manager-assigned curriculum | ✅ | `/training` |
| Training: "trains and guides you in the real world" headline, self-managing teams, four non-negotiables, reading list | ✅ | `/training` |
| Connections: connect systems, health band, stale feed → "Not tracked", board approval for sensitive connectors | ✅ | `/connections` |
| Connections: Safety Minder removed everywhere | ✅ | no occurrence anywhere in `src/` |
| Admin: permissions follow the role, settings, seats/billing | ✅ | `/settings` |
| Admin: notification preferences wired to real delivery | ◐ | the events are computed live; **email/SMS toggles are still placeholders** |
| Mobile: four big targets, offline queue-and-sync, no individual scores | ◐ | `/site` has the targets and hides scores; **the offline queue is not built** — it needs a network to work |
| Sectors, Setup, Pricing, Inbox | ✅ | all four |
| Never show an hourly rate to a customer | ✅ | held by a test that greps the whole product |
| Cockpit: targets, system health, talk-to-build | ✅ | `/cockpit`, private to the owner |

## The 23–24 September updates

| Item | | Evidence |
|---|---|---|
| **Safety** — incidents, notifiable, workers' comp/RTW, hazards, psychosocial, corrective actions, toolbox, SWMS, inspections, vehicle/plant, licences | ✅ | `/safety`, five tabs. `scripts/safety-journey.mjs` (18 checks) |
| Anonymous wellbeing report stores no name | ✅ | **proved against the stored database row**, including role, job reference and the minute it was sent |
| Injury flagged as possibly notifiable on wording | ✅ | and near misses too — a dangerous incident is notifiable with nobody hurt |
| Regulator by state, not hard-coded to NSW | ✅ | `lib/safety` `REGULATORS`; asks when it does not know |
| **Coverage** — 38 capabilities, SPEC or connected, per item | ✅ | `/coverage` |
| **Tech Day** — the tech's phone day | ◐ | `/tech-day` exists and reads real booked jobs and timesheet hours; **SWMS, photos, materials and client sign-off are not on it**, and the offline "saved on this phone" promise is not built |
| **Tech Day**: hold-to-talk, end-of-day screen, tap-to-pay, next job | ✗ | none of it |
| **Jobs** — enquiry to paid | ◐ | `/jobs` has 8 tabs: Jobs, Quotes, Schedule, Timesheets, Catalogue, Stock & buying, Invoices & claims, Service & assets. **Missing: Leads, Pre-builds, How long?, Callbacks & rework, Reviews, Tools & equipment. Catalogue is not renamed Materials. The three groups (Win the work / Do the work / Get paid and keep them) are not there** |
| **CRM** — customers inside jobs | ◐ | `/crm` and `/clients` are built and real; **they are separate pages rather than a Customers tab on Jobs**, which is what the 24 Sep note asks for |
| **Compliance** — the full new system | ✗ | `SPEC Compliance.dc.html` is in the bundle; **there is no `/compliance` page**. Licences, insurances, certificates, audits, contracts, breaches |
| **Nav: key areas** — My page · Jobs · CRM · People · Safety · Compliance · Board, Setup/Connections/All pages on the right | ◐ | the bar reads Setup · My page · Jobs · CRM · Clients · Org chart · People · Safety · Pricing · Scoring · Board pack · Mirrors · Connections · All pages. **Compliance is absent, Setup is still first rather than on the right, and Org chart / Training / Scoring / Mirrors are not folded under People and Board** |
| **siteVIP Landing** | ✗ | not built, and it needs a domain decision first — see below |
| **Monthly rhythm** — lock on the last day, scores clear to zero on the 1st, KPIs carry over | ✗ | **not built.** Scoring still locks on sign-off; nothing clears on the 1st. This one changes what happens to a real business on 1 October |
| **Seat price A$134 / A$17, AI included** | ✅ | `lib/pricing`, matches the live Stripe account |
| **No non-AI tier anywhere** | ✅ | no "Basic" on any customer-facing page |
| **"SPEC proposes", never "Claude proposes"** | ✅ | no occurrence in the product |
| **Email reading, leads, estimating from plans, understand-the-work, supplier prices, labour guide** | ✗ | none built |

## Engineering requirement

| Item | | Evidence |
|---|---|---|
| Multi-tenant, clean per-business separation | ✅ | enforced in code and again by row-level security on 54 tables |
| 40 → 20,000 seats without a rebuild | ✅ | `scripts/load-test.mjs`; `/cockpit` carries the scale checklist |
| Monitored, Kris never firefights | ✅ | `/status`, `/api/health`, health pings |
| 1,807 tests, 21 browser journeys | ✅ | `npm run check` |

---

## What I would do next, in order

1. **The monthly rhythm.** It is the only missing item with a date attached. On 1 October a real
   business expects its scores to clear and its KPIs to carry over, and today neither happens.
2. **Compliance.** A whole designed system with no page, and it is the pillar JBI is judged on.
3. **The nav.** Cheap, and it is the map everybody navigates by. Compliance needs it anyway.
4. **Jobs — the missing tabs and the three groups.** The biggest area by volume; Leads and
   Pre-builds are the two a trade business feels first.
5. **Subcontractors.** Kris corrected this himself on 24 September — a paid team seat, not free.
6. **siteVIP Landing.** Blocked on the domain decision, not on the build.
