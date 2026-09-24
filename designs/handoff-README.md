# Handoff: SPEC Business Solutions — Full Platform

## Overview
SPEC is a business-operating platform built on four pillars — **Safety, People, Earnings, Compliance (S·P·E·C)** — plus an AI-driven "improvement register" that captures ongoing problems, always resolves them people-first, and routes them through a weekly meeting to sign-off. This bundle covers the full product: public marketing site, the daily operating app, and Kris's internal business-cockpit.

## About the Design Files
The files in `designs/` are **design references built as Design Components** (a proprietary streaming-HTML format — `.dc.html` files with a template section and a plain-JS logic class). They are not production code to copy directly. Recreate them in the target codebase's real framework (React, Vue, Next.js, native — whichever the project uses, or the best choice if none exists yet), using its real component library, state management and backend. Treat every `.dc.html` file as a fully-specified reference for layout, copy, states and interaction — not as source to paste in.

## Fidelity
**High-fidelity.** Every screen carries final copy, spacing, and the exact colour system described below. Interactions (drag-drop, sliders, the AI diagnosis flow, sign-off lifecycle) are built and functional in the prototype using placeholder/local data — the developer's job is to wire the same UI to real auth, a real database, and a real Claude API call.

---

## THE FOUR PILLARS — non-negotiable framework
**S**afety, **P**eople, **E**arnings, **C**ompliance. Every KPI, every scorecard, every problem in the system is tagged to one or more of these. The **SPEC standard** is 90%+ on every pillar, sustained for two consecutive months. Below 90% on Safety or Compliance is a **hard gate** — it blocks a role/business from being reported as "on standard" regardless of other scores.

### The colour rule — read this before building ANY screen
**Colour is always the result. The letter is always the pillar.** These never swap jobs.
- Pillar identity is carried by the letters **S · P · E · C** only, never by colour — the four-slot marker is four rounded-square tiles, fixed order, each with its white letter.
- The tile's fill is the traffic light for that score: **green ≥90%, amber 75–89%, red <75%** (hex: green `#4f7a3f`, amber `#c67139`/`#c08a2e`, red `#a63b26`, neutral/grey `#8c8681`).
- This exists because the brand's marketing colours (Safety=green, People=red, Earnings=blue, Compliance=amber) would otherwise contradict the score — a failing Safety card would show green, a healthy People card would show red. **Brand pillar colours are marketing-only** (logo, site, printed pack) and must never appear as status colour in the product. See `SPEC Colour System.dc.html`.
- The org chart's connector LINES also carry this rule: the stub below a role = that role's own score; the horizontal rail = the worst score among its children; each riser = that child's own score. A failing branch is visible without reading any text.

### Type & brand
- Headings: Caprasimo (loaded at weight 400 only — there is no true bold cut, so "bold" headings are Caprasimo at its normal weight, sometimes faked heavier with a 4-direction text-shadow stack when a design pass explicitly asked for bolder).
- Body: Figtree (400/600/700 loaded).
- Ground `#f5ead8`, ink `#201e1d` (design-system "Organic" tokens — see `_ds/` if bundled, else treat as the source of truth for spacing/radius/shadow variables used throughout).
- Logo: an animated ring-clock mark (an "O" that is both a 12-month clock face and an outcome ring) with a claw-shaped hand that sweeps red→amber→green as the score rises and snaps to 12 o'clock once the ring closes — plays once, never loops back to red. See `SPEC Logo Concepts.dc.html` for the full spec and `logo.svg` for a static placeholder. A separate abstract 100-dot "mascot" mark (`SPEC Mascot.dc.html`, `mascot-*.png/json`) is used for campaign/social use, built from a feathertail-glider silhouette rendered as exactly 100 green dots — the count is the message ("a lot of little things done right build a business to success").

---

## THE ENTRY FLOW (public → signed-in)

### 1. `SPEC Landing.dc.html` — marketing + one-shot AI taste
Simplified, stripped-back version. Sections, top to bottom: hero showing only the wordmark **"Simple."** (large display type, generous space below before the next section), a **problem box** ("Got problems? We'll fix them" — describe one ongoing problem), a live AI diagnosis (bloom-out + P-first solution, see below), a routing question, a labour-gap cost stat, pricing, a plain final CTA ("Ready when you are."), footer. The earlier crossed-out-buzzwords section and the four-pillar question grid were deliberately removed to keep the page to one idea per section.
- **One-shot, stores nothing** on its own — no account, no persistence. Submitting Enter in the textarea runs the diagnosis (Shift+Enter = newline).
- After a result, ask **"Would you like to solve some problems in your business?"** — YES/NO. NO ends here (self-qualifying, goes nowhere). YES asks for the business name (Enter submits) then the **routing question**: "Who is the leader of these solutions — is it you?"
  - **YES, IT'S ME** → straight into `SPEC My Page.dc.html` (do-it-myself), the typed problem carried over as **Opportunity #1** waiting in the register.
  - **NO, IT'S NOT ME** → capture a name/title/email for who will run it (train-my-own-person tier).
  - **"I can't do this, it's too hard"** → mailto CTA to `manager@specbizhq.com` (consulting tier).
- Handoff mechanism (prototype): the typed problem + diagnosis result is written to `localStorage` and read by My Page on load. **For Claude Code: replace with a real signup + database write.**
- The bottom of the page also shows the **Snap Score** (see below) as a static explainer — new signups start at 0%, with copy explaining it fills as improvement opportunities are logged and closed.

### 2. `SPEC Sign In.dc.html` — returning users
Simple email/password-style entry (placeholder auth) into `SPEC My Page.dc.html`. **For Claude Code: wire to real auth.** The briefed model is **one business per login** (simple) — multi-business/organisation switching is deliberately deferred; a business-switcher stub already exists in My Page's nav for this later.

### 3. `SPEC My Page.dc.html` — THE DAILY HUB (every single user's home screen)
This is the most important screen in the system — everyone, every role, logs in here every day, and every other screen is reached from it. Persona switcher in the UI lets you preview Operations Manager / Site Supervisor / BD Manager / Apprentice — all share the same page shape.

Sections (all present for every persona, same order, only content differs):
1. **Header** — whose page this is (name + role, unmistakably labelled), a notifications bell (badge dot when something needs you — see Notifications below), and the business-switcher stub.
2. **My four lights** — this role's own S·P·E·C tiles for the current month.
3. **What needs me today** — a checklist of today's actions (toolbox talk sign-on, clock in, acknowledge changes, etc. — persona-specific).
4. **My team** — direct reports only (not the whole company), each a link into their scorecard.
5. **KPI reports from connected systems** — pulled from whatever's wired in Connections.
6. **Improvement register** (was internally called "problem register" — **user-facing copy must always say "improvement opportunity" / "improvement register" inside the app; "problem" language is reserved for the public Landing page only**). The AI diagnosis box lives here too, plus the full list with lifecycle controls (below).
7. **Snap Score** — visible **only to personas who attend the COGS meeting** (managers and above) — see below.
8. **Ask anything** — every-day, casual AI help box. Deliberately visually separated from Improvement (which is occasional, "when you stumble onto a real problem") — they must never be adjacent/mistakable for the same feature.
9. Messages, training progress, weekly meeting log — supporting sections, same page.

#### The AI diagnosis engine (JOB 1 — bloom-out, JOB 2 — the fix)
This is a **real Claude call** (not a mechanical letter-shuffle) — see the system prompt embedded in `SPEC My Page.dc.html`'s logic class for the authoritative wording; summary:

- **Bloom-out**: one typed headline → the full causal chain of pillars behind it, marked **definite** vs **possible** (never padded to a fixed length; a chain is only as long as the story supports). **People (P) is never "possible"** — if it's in the chain at all it's definite. **Harm to a person is always Safety, never People** — a back injury is S, full stop, not P, unless the story also shows nobody owns fixing the cause.
- **The fix always runs the P STACK first**, in this exact fixed order, before any other pillar is touched:
  1. **Define the role** — is this function even mapped as a seat on the org chart?
  2. **Select the right person** — is the right person in that seat?
  3. **Train the person** — are they actually trained to do it?
  4. **Train the manager/supervisor** — are the people managing them trained to support them properly?
  - If the problem entered on S/C/E, the P stack is inserted at the front and the entry pillar often drops out of the solution entirely (it was the symptom). If it entered on P already, there's nothing to reorder — instead **drill deeper** through the same four beats to find which one actually failed.
  - Every solution cashes out through the **org chart** (is there a seat, who holds it, who do they report to) and **KPI design** (is the right number measured against that seat) — never vague "improve communication" advice.
  - If there's no clear owner, the system does **not** invent a solution — it says (in warm, confident language) **"Of course we can address this — and it starts with the people,"** then explains that finding the owner (a gap in the org chart) is the first, and only, next step. Landing/app copy must never say "you can't solve this" — always frame as certainty + a first step.
  - **Internal-only lens, never surface it**: a "company → team → self" priority filter on communication/psychosocial behaviour informs Claude's read privately. The literal question ("is this a mature adult?") and any maturity-judgement language **must never reach the UI or be asked of a user** — always translate to professional P-stack language (role clarity, capability, training, leadership, psychosocial support).
  - Tailor answers to the business's actual industry/location — legislative and regulatory context (Fair Work, WorkSafe, industry-specific requirements like vehicle safety audits in trades/transport) should shape the specifics, not generic advice.

#### The improvement register — lifecycle (CODE MUST implement this exactly)
Every entry: problem text + bloom-out + solution + **owner** + **manager above them** (accountability always routes through the manager — the org-chart reporting line IS the accountability line) + **deadline**.
- **States**: `OPEN` → assign to a person (a seat on the org chart) → they **ACCEPT** (theirs) or **DENY** (back to unassigned — a denial is information, not failure: it surfaces problems nobody will take) → `DONE-CLAIMED` (self-reported, not yet real) → **only the weekly COGS meeting can VALIDATE and sign it off** → `CLOSED/SIGNED-OFF`, kept as a permanent record, never deleted → can be **REOPENED** later, linked to the original record (not started fresh).
- **Look-back audit**: ~2 months after sign-off, resurface it — "has this actually stayed solved?" Failures go straight into the reopen path.
- **Recurrence detection**: matching a new entry against existing ones (fuzzy — people phrase the same issue differently) is a first-class signal, not a nice-to-have. A match **escalates** (jumps the queue) and surfaces a recurrence count in both the weekly meeting and the board pack. This is the system's actual teeth — a business that keeps re-seeing the same problem can't ignore it.
- **Priority sort** (default order, not arrival order): 1) harm to a person (physical or psychological) — always first, above everything; 2) losing money; 3) losing good people; 4) everything else. Recurrence and blown deadlines escalate within this.
- **Visibility**: a user sees their own entries + their direct reports' (not the whole company).

#### Snap Score
The renamed "problem-solving power meter" — a single red/amber/green dial computed from the register's real signals (close rate, speed to close, reopens, recurrence), not a raw count. **Visible only to people who attend the COGS meeting** (i.e. managers and above) — an individual contributor's My Page never shows it. On Landing it's shown once as a static explainer of what it will become.

### 3b. `SPEC Mirrors.dc.html` — Mirrors (live artifacts, renamed from Boards 18 Sept — too close to "Board pack")
A gallery of pinned, shareable "mirrors" — like Claude's artifacts, but wired to a business's live connected data. Grid view (filterable by type: live data, plans, scorecards, improvement opportunities, training, meeting outputs) opens into a detail view: mirror content on the left, a right-hand panel showing who's editing now and a comment thread. Two worked examples: a **Rate Board** pulling live Simpro (job cost) and Xero (actuals) feeds to validate a labour sell-rate change ($115→$105), and a **"King of the Mountain" plan** — a fix-it plan with owners per step. Other mirror types render generically until real data/pins exist. My Page's notification bell links out to Mirrors and Connections activity so users are prompted to check updates. All references (nav, notifications, file name) renamed from "Boards" to "Mirrors" everywhere.

### 3c. `SPEC Training.dc.html` — training additions (17 Sept)
Hero headline changed to **"This software is different — it trains and guides you in the real world"** (positions the platform as guidance, training as what makes people successful on the ground). New section below the existing "We train for results" panel: **"Self-managing teams, not a dictatorship"** — states SPEC's management model explicitly (behaviour is a symptom; management owns closing the readiness gap, not blaming the individual), lists the **four non-negotiables** (Safety: zero harm; People: no culture that sets people up to fail; Earnings: everyone shares responsibility for a vibrant company; Compliance: say it, do it), and a **recommended reading** block in order: *It's Your Ship* (D. Michael Abrashoff) → *MindFit* (Kris Harold) → *MindFitter* (Kris Harold).

### 3c. `SPEC Training.dc.html` — training additions (17 Sept)
Hero headline changed to **"This software is different — it trains and guides you in the real world"**. New "Self-managing teams, not a dictatorship" section: four non-negotiables (Safety zero-harm, People no-set-up-to-fail, Earnings shared responsibility, Compliance say-it-do-it), recommended reading in order (*It's Your Ship* → *MindFit* → *MindFitter*, all Kris Harold except the first). New "Mental fitness, incentives and the busy excuse" section — three cards: mental fitness is trained not assumed (credits Kristopher Harold's 2018 book as early source), why incentives work (they prove the target was real), "busy" as a smokescreen the register exposes.

**Training marker decision:** training items are marked by treatment, not a new colour — a 1.5px dashed outline ring on the pillar chip (`outline`, color-independent of both pillar hue and status colour). Purple/mulberry stays reserved for Compliance; no new hue added. Reference implementation on the module-card pillar chips in this file.

### 1a. Virtual GM hook (17 Sept)
New marketing angle on both `SPEC Landing.dc.html` and `SPEC Pricing.dc.html`: positions SPEC against the cost of a fully-loaded GM (~$300k/yr all-in — base, super, car, bonus, recruitment). On Landing, a standalone headline section sits right after the "Simple." hero, kicker "The virtual GM" over the line **"Before you pay for an expensive GM, start with SPEC."** On Pricing, the same line sits above the tiers, and the Consulting tier price now notes the fully-loaded GM comparison underneath it. Both wired to a `gmHeadline` Tweaks enum with 4 copy variants (cost/never_sick/reframe/stop_paying) so the line can be swapped without a redeploy.

### 3d. `SPEC My Page.dc.html` — Virtual GM Power Meter (19 Sept)
New component per the "Universal KPI Framework + Virtual GM Power Meter" build brief: a 0–100 traffic-light reading (green 85–100 / amber 60–84 / red below 60) resolving 24 KPIs — 5 "big five" heavy hitters at 15% each (safety incident, workers' comp claim, low gross profit, contractual breach, negative turnover) and 19 others sharing 25%. Lives in the page header as a dial + "Virtual GM Power Meter" label + "Hack Your Power" tagline, visible to everyone but the percentage and double-click breakdown (5 big-five rows + expandable "everything else" list of 19 named KPIs, with a one-line cause on any big-five miss) only activate for managers (`!p.checklist`, same population as the existing Snap Score). Scope note reads "your reporting line" per manager; whole-business scope is the default view. Mock data lives in `GM_METERS`/`gmScoreOf` in the logic class — Code should replace with the real `power_meter_reading`/`kpi_reading` data model from the brief.
Runs the register: pulls a live "From the improvement register" section ranked by the same priority hierarchy, shows accept/deny state, and is where DONE-CLAIMED items get validated and locked. Logging this meeting is itself counted as a People KPI (4 logged meetings/month expected).

### 3f. SPEC is the HR and Safety system (23 Sept)
- **New `SPEC Safety.dc.html`** — tabs: Today (one-line report box: Hazard / Near miss / Someone got hurt / Not coping, Enter to send, auto-tagged to the Simpro job; SafeWork NSW 13 10 50 prompt when an injury report looks notifiable), Incidents (register, notifiable events, workers’ comp + return to work), Hazards & wellbeing (hazards/near misses, anonymous psychosocial, corrective actions), On site (toolbox sign-on from the Simpro schedule, SWMS/JSA, inspections, vehicle & plant checks from Simpro assets), Clear to Work (licences/tickets, 60-day warning; not clear = cannot be scheduled in Simpro).
- **`SPEC People.dc.html`** — added tabs Reviews & conduct (reviews = last 3 months of the KPI board, training records, Fair Work step-by-step warning process) and Pay & exits (contracts from the org chart role, award checks against the Electrical, Electronic and Communications Contracting Award, payroll export Simpro hours → Xero Payroll, exit reasons right/wrong feeding negative turnover).
- **Safety Minder removed everywhere.** No third-party safety or HR system; SPEC is the system. Simpro is the only link (jobs, sites, crews, hours, vehicles). TRIFR is now calculated from the SPEC incident register + Simpro hours.
- Nav: People and Safety tabs added after Org chart on every in-app page.

### 3e. Setup, Org Chart, Connections, Pricing — 21 Sept refresh
- **SPEC Setup.dc.html**: split the former "Business" step into two — Business (name/sector/size only) and a new "AI & your stack" step (the AI on/off question + a systems checklist grouped Essential financial system / core operating system / everything else, defaulting to a JBI-shaped stack: Simpro+Xero+HubSpot+Microsoft 365 on, Pylon+SPEC Safety (built in) off). Step rail redesigned to a slim numbered progress row (only the active step shows a label). Added a collapsible "N things not set up yet" readiness banner (vacant roles + pillars under 2 agreed KPIs, each with a Fix-it jump). Billing step gated behind `isAdmin` — non-admins see a message instead of card fields. Cascade step's per-manager note relabelled "Their walkthrough:". Added a plain-language note that a business already using Claude directly doesn't need to migrate — SPEC gives those conversations somewhere to land (register/scorecard) — plus "SPEC takes the wheel" / one-stop-shop framing on the AI question.
- **SPEC Org Chart.dc.html**: two seat types — leadership seats (team leader/supervisor/manager/director/head-of, detected by title match) get an individual card; everyone else pools under their leader. Double-clicking a leadership card opens a "Team pool" modal to add/remove pooled team-member names by name (not anonymous headcount).
- **SPEC Connections.dc.html**: "Core stack · fully supported" badge on Simpro/Xero/HubSpot/Microsoft 365 in the Available list. Full jargon sweep — no more "API key", "token", "mapping" as user-facing nouns (now "connection details", "what this feeds", "Login expired — needs reconnecting"). Authorisation to connect/approve now explicitly named as GM, Board, or Commercial Manager. "Already using Claude" section now leads with "You don't need a second AI to run SPEC — SPEC is your AI."
- **SPEC Pricing.dc.html**: two-seat pricing model — leadership seat (~$134/mo) vs team seat (~$17/mo), sliders for each instead of a flat seat count.
- Shared top nav: added a "Setup" tab, positioned first (right after the logo) across all pages.
- Wording sweep: "Claude" removed from every place describing SPEC's own reasoning (proposing roles/KPIs, reading a system, working out a mapping) — that's now always "SPEC". "Claude" only remains where it names an actual external product a business might already run separately (the "keep your existing AI" choice on Connections).

---

## OTHER APP SCREENS (all reached from My Page)
- `SPEC Org Chart.dc.html` — the **Interactive Org Chart (IOC)**, the structural core of the "Link → Flow → Grow" method. Right-click to add a role; drag a card onto another to re-parent it (accountability line); collapse/expand branches; a view-scope selector defaults to "[Manager] and below" with a "See whole company chart" escape to the full tree; team-count badges; Ace badges (gold, for roles on a 3-month ≥90% streak) sit at a fixed `top:-11px;right:-11px` offset requiring `overflow: visible` on ancestors. **Layout math**: cards are positioned via a `reserve()`/`walk()` two-pass algorithm — `reserve()` computes each node's horizontal span as *its children's combined span only* (never widened by its own card's width, even though a parent's card can be visually wider than a single child's span — that node's card is centred over that (possibly narrower) span and symmetrically overhangs both sides rather than shifting a sibling). Row-to-row vertical gap is a constant (`GAP`, currently 56px) computed cumulatively per row height, not a fixed stride — different depths have different card heights, so a fixed stride produces uneven gaps.
- `SPEC My Scorecard.dc.html` — an individual's own KPI scorecard (click their name from Org Chart, People, or Weekly Meeting) — sliders to set/adjust each pillar's KPIs, comments, and (if a manager) the same for direct reports below.
- `SPEC Monthly Scoring.dc.html` — month-end entry, source confirmation, hard-gate pass/fail, sign-off & lock.
- `SPEC Board Pack.dc.html` — generated board output: four pillars vs 90%, gates, flagged unsupported numbers, board-level approve/deny on sensitive items.
- `SPEC Group.dc.html` — multi-entity/group rollup (by-pillar and by-entity views), unlocked entities excluded and named rather than estimated in.
- `SPEC People.dc.html` — HR/People-pillar hub: roles, Ace tracking (Sales Ace / Ops Ace — trained, signed off, 3 consecutive months ≥90% on an individual KPI scorecard, unlocks an increased incentive), recruitment.
- `SPEC Training.dc.html` — learner path + manager-assigned curriculum.
- `SPEC Connections.dc.html` — connection centre: connect systems (Simpro, Xero, HubSpot, Groundplan, Pylon, etc. — safety and HR are built into SPEC, not connected), **connection health** band (last sync, cadence, 30-day reliability, traffic-light state, what breaks downstream if it stops — a stale feed's KPIs go to "Not tracked", never silently carried forward at last-known value), board-level approval required for sensitive connectors (Xero, BambooHR, payroll).
- `SPEC Admin.dc.html` — permissions that follow the ROLE not the person, company settings, seats/billing, notification preferences (email/SMS toggles — currently placeholders; **Claude Code: wire to real delivery** on the assign/overdue/approved/denied events already computed live in My Page's notification bell).
- `SPEC Mobile.dc.html` — the on-site phone view for crews: four big targets (sign on, report a hazard, log hours, ask), works offline with a queue-and-sync model, no individual scores shown (crews aren't individually scored).
- `SPEC Sectors.dc.html`, `SPEC Setup.dc.html`, `SPEC Pricing.dc.html`, `SPEC Inbox.dc.html` — sector templates, first-run setup wizard, pricing (see below), and a notifications/approvals inbox.

## Updated 19 Sept — Org chart: team seats, KPI editor, sign-off cadence
`SPEC Org Chart.dc.html` now models two seat types matching the pricing tier below. **Leadership seats** (team leader/supervisor/manager/director titles) show a "Leadership seat" tag and, when `certified: true` + a person filled in, a "✓ SPEC Certified" mark. **Team seats** are a new node type (`isTeamNode: true`) — right-click a leader → "Add a team", name it (Technicians, Apprentices, etc.), then double-click the box to drill into a **Team layer**: add/remove named members (pooled pricing, not individual) and set one shared S/P/E/C score for the whole group. All cards (leader/individual/team) now render at one fixed size (196×150) regardless of depth.

**KPIs**: right-click any pillar card (Role scorecard panel or Team KPIs panel) to add a named KPI — always available. Suggests role-appropriate rotating examples (skips ones already added): leadership seats get manager-level examples ("Gross profit margin at 40%"), team/frontline seats get operational ones ("PPE worn on every job"). Duplicates rejected case-insensitively. **Scoring** the S/P/E/C percentage (not the KPI list) is permission-gated — double-click to type a value, but only for the direct manager (`viewAsId` match) or with the **Administrator**/**SPEC Certified** toggle on (top-right); Code should replace both with real auth. **Cadence banner** in the header shows "Scoring month: [current]" and "Sign off and reset before [first Wednesday of next month]" (client-computed placeholder — `firstWednesdayNextMonth()` — Code should drive from the real lock schedule). **KPI readiness**: Role scorecard panel shows a dot per pillar, green once it has SPEC's minimum of 2 KPIs (`MIN_KPIS`), red otherwise.

Also fixed: role-card titles weren't applying bold heading style (missing binding); "Add a KPI" used the browser's native `prompt()` (looked like a security dialog) — replaced with an in-design modal + chat-style send arrow; a stray whole-canvas right-click menu was leaking into the Team layer.

## Updated 19 Sept — Pricing: two seat types
`SPEC Pricing.dc.html` replaced flat per-seat pricing with **Leadership seat** ($134/mo, $227 with AI) and **Team seat** ($17/mo, $29 with AI) — two sliders instead of one. Rule stated on the page: "if you lead people, you're a leadership seat; if you're led, you're a team seat in a pool." Training now $1,007/mo; Consulting now reads "Speak to us — we have the solution for you" (no price shown). Virtual GM headline updated on both Pricing and Landing to "Don't pay for an expensive GM — start with a Virtual GM and let's see what you really need."

## `SPEC Cockpit.dc.html` — Kris's internal business dashboard (NOT client-facing)
A separate, private surface for running SPEC Business Solutions itself (not a client's business). Three layers:
1. **Targets & status** — Consulting engine (clients vs target 4–5, revenue vs $1.2–1.5m/yr) and Software engine (seats vs 20,000, ARR vs $10m, retention vs 90%+) side by side, starting from today's real numbers (1 client, ~40 users).
2. **System health** — up/fast/scales, monitored continuously so Kris only glances, never firefights.
3. **Talk-to-build surface** — SPEC dogfoods itself: Kris talks objectives/problems into the same problem-box pattern, and it becomes the product feedback loop with Claude.
Also holds the **marketing plan** (3 phases — paid seed → prove & delight → referral flywheel, with an illustrative channel mix reaching ~19,000 seats) and a **domain note**: spec.com is owned by a third party — acquiring it means going through a domain broker (GoDaddy Domain Broker, Sedo, Squadhelp) to negotiate a purchase from the current owner (typically low-tens-of-thousands to six figures USD for a short dictionary .com, 10–20% broker fee) — not a registrar purchase. Deferred until revenue justifies it; specbizhq.com is the current domain.

---

## ENGINEERING REQUIREMENT — read before architecting anything
**Must scale from ~40 users today to 20,000 seats across ~1,000 businesses without a rebuild.** Architect multi-tenant (clean per-business data separation) on auto-scaling cloud infra from day one, monitored 24/7. Kris must never personally manage login issues or downtime.

## Design Tokens
See the Organic design-system tokens if bundled (`_ds/.../styles.css`) for the full spacing/radius/shadow scale. Key values used throughout:
- Status colours: green `#4f7a3f`, amber `#c67139` / `#c08a2e`, red `#a63b26`, neutral `#8c8681`.
- Ground `#f5ead8`, ink `#201e1d`, dark surfaces (Cockpit, some section backgrounds) around `#22221f`/`#2c2c2a`.
- Headings: Caprasimo 400. Body: Figtree 400/600/700.
- Card radius: large rounded corners (`--radius-lg` token), pill buttons.

## Assets
- `logo.svg` — static placeholder for the animated ring-clock mark; see `SPEC Logo Concepts.dc.html` for full animation spec (claw-hand sweeps red→amber→green, snaps at 12, never loops back).
- `mascot-reference.png`, `mascot-green.png`, `mascot-orange.png`, `mascot-dots*.json` — source/derived assets for the 100-dot abstract mascot (`SPEC Mascot.dc.html`).
- `image-slot.js` — drag-and-drop image placeholder component used in a few screens; real images should replace these slots.

## Files
All `.dc.html` files listed above are in `designs/` alongside `support.js` (the DC runtime — reference only, not to be shipped) and `logo.svg`.


## Update 23 Sep 2026 — SPEC as the complete trade business system

SPEC now runs Jobs, People (HR) and Safety itself. A business can use SPEC for everything or connect its own system per area (JBI keeps Simpro connected for now). Accounting stays in Xero/MYOB.

- `SPEC Jobs.dc.html` — eight tabs: Jobs pipeline, Quotes (live quote builder: catalogue items, kits, labour rates, markup 25/35/45%, GST, margin vs 40% benchmark), Schedule (crew × day grid; not-clear-to-work people cannot be booked), Timesheets (from phone Start/Finish, billable % vs 86%), Catalogue (supplier price files, lean item list, kits), Stock & buying (van stock, POs, supplier-bill matching), Invoices & claims (progress claims, retention, variations, debtors → Xero), Service & assets (recurring contracts, test & tag, fleet).
- `SPEC Coverage.dc.html` — the capability map: 38 capabilities across Jobs, HR and Safety, each with a "SPEC or connected system" switch. This is the spec for parity with Simpro.
- `SPEC Safety.dc.html` — full safety system (incidents, notifiable events, workers' comp/RTW, hazards, psychosocial, corrective actions, toolbox, SWMS, inspections, vehicle/plant, licences). Safety Minder removed everywhere.
- `SPEC People.dc.html` — full HR incl. recruitment, reviews from KPI board, fair-process conduct, contracts, award checks, payroll export to Xero, exits with right/wrong reasons.
- `SPEC Tech Day.dc.html` — the tech's phone day: SWMS → start → photos → materials → client sign-off; timesheet builds itself.
- `siteVIP Landing.dc.html` — siteVIP, the trades edition of SPEC, at sitevipapp.com (secured). Future editions (e.g. logistics) sit on the same engine.
- `SPEC My Page.dc.html` — Virtual GM Power Meter breakdown now names the source of every KPI; all five heavy hitters come from SPEC's own records (Safety, Jobs, People).
- Nav: Setup · My page · Jobs · Org chart · People · Safety · … on every page.


## Update 24 Sep 2026 — simple setup, CRM, pre-builds, listening

- `SPEC Setup.dc.html` — REBUILT as five file-driven steps: (1) drop staff file or pull from Xero Payroll/Simpro/MYOB → SPEC reports people, leaders, roles, and asks only for missing managers (with a guess); (2) org chart auto-built, leadership vs team seats counted, live monthly price with/without AI; (3) one line per role + KPIs drafted (8 per leader, team KPIs for teams); (4) goals per pillar + what each team does; (5) customers, open jobs, price book (drop or pull; duplicates merged, unused catalogue left behind). Finish → My Page. Old version kept as `SPEC Setup v1.dc.html` for reference only. File parsing is mocked — Code must parse CSV/XLSX/DOCX for real.
- `SPEC Jobs.dc.html` — new tabs: **Customers** (CRM built into jobs: sites, contacts, quotes/jobs, timeline, next action, "New enquiry for …") and **Pre-builds** (Good/Better/Best tiers; each carries items, hours, SWMS, checklist, photos, certificate, van pick list; self-correcting: compares quoted vs actual hours from timesheets and flags price-file rises, one tap to fix; make a pre-build from a finished job). Job detail can move back a stage with no re-entry. Invoices edited in place (credit note + new invoice to Xero).
- `SPEC Tech Day.dc.html` — offline-first: "Saved on this phone · works with no signal".
- `siteVIP Landing.dc.html` — "Everything trades put up with in job software. Fixed." (9 crossed-out complaints with answers; no competitor named) + "Month to month. Every feature included. No exit fees."
- `SPEC Cockpit.dc.html` — "siteVIP listening": nightly read of public forums/review sites, themes, drafted fixes to approve/park/use in marketing. Sample data; nothing ships without Kris's approval.
- OPEN for Kris: same-day human support model; siteVIP pricing.


## Update 24 Sep 2026 — no non-AI tier
Kris: SPEC and siteVIP are sold WITH AI only. The Basic / no-AI option is removed everywhere (Pricing, SPEC Landing, siteVIP Landing, Setup, Home). Seat prices: leadership A$227, team A$29 a month. Remove the Basic tier and AI_TIER toggle from the product; do not ship a without-AI plan.


## Update 24 Sep 2026 — "Is the business going well?" (My Page, leaders)
One verdict + four pillar tiles (Safety, People, Earnings, Compliance) fed from Safety, People/Org chart/Training, Jobs/Customers/Xero. RELIABILITY RULE: never judge on the raw month-to-date total (KPIs reset monthly, so early months look behind). Reading = rolling average of the last 3 closed months, blended with this month's ON-PACE projection, weight = (day/daysInMonth) × 25%. Days 1–7: read from closed months only. Any serious event this month (harm, workers' comp claim, contract breach, wrong-reason exit) is never averaged away: it caps that pillar at amber at best and is named. Bands: green 80%+, amber above 50%, red 50% or under.


## Update 24 Sep 2026 — monthly rhythm (supersedes "reset before the first Wednesday")
- Scores SET (lock) at the end of the last day of the month.
- On the 1st of the next month the SCORES clear to zero. The KPIs themselves, targets, owners and team KPIs all carry over unchanged. Nothing is deleted.
- Supervisors and managers start the new month with the same KPIs and their teams.
- The locked month is still reviewed and signed off (GM submits, Director signs) as before, but scoring for the new month starts on the 1st regardless.
- Ace streaks, incentives and the "Is the business going well?" verdict read from the locked months, so the reset never makes the business look worse than it is.


## Update 24 Sep 2026 — seat price correction (supersedes A$227 / A$29)
The price is A$134 per leadership seat and A$17 per team seat a month, AI included. A$227 was the price WITH TRAINING added and is not the seat price. Regional tables keep their own base figures (NZ$180/23, £88/11, €134/17, US$134/17, CA$180/23), all with AI included. JBI example: 9 × 134 + 29 × 17 = A$1,699 a month.


## Update 24 Sep 2026 — email reading (Jobs → "From your inboxes")
SPEC reads staff work mailboxes (Microsoft 365 / Google Workspace, connected in Connections; a sensitive connector, so GM/Board approval required) and turns emails into actions: new enquiries (with matched pre-builds and customer record), quote acceptances, supplier bills matched to POs, variation requests priced from pre-builds, complaints (warranty callbacks), and safety reports (logged as hazards). One tap to act; nothing is actioned without a person tapping. Mail a person marks private is never read.

Each inbox item now carries SPEC's drafted reply (in the business's voice, signed by the right person). One button, "Approve", does the action and sends the reply. Nothing is sent without approval.


## Update 24 Sep 2026 — white ground everywhere
Every page now sits on a clean white background (#ffffff). Cards and panels are white with the soft shadow; inner rows, chips and input wells use a very light warm tint (#f7f2ea) so they still read on white. Implemented as a token override per page: --color-surface: #ffffff, --color-bg: #f7f2ea, page/body background #ffffff. In the product, set these at the theme level rather than per page.


## Update 24 Sep 2026 — price ladder (Kris's rule: every list price's digits sum to 8)
- Solo, 1 person: A$44 a month, everything included.
- Crew, 2 to 5 people: A$143 a month, flat.
- Business, 6+: A$134 per leadership seat, A$17 per team seat.
- Regions: NZD 53 / 161 / 170 / 26 · GBP 26 / 80 / 71 / 8 · EUR and USD 44 / 143 / 134 / 17 · CAD 53 / 161 / 170 / 26.
- Training A$1,502 a month also fits the rule. Totals (e.g. JBI A$1,699) are sums and are exempt.

Contrast pass: every card and panel now has a clear warm edge (1.5px ring in the sand tones #e0d3be / #d9cbb3 / #d2c3a9, built into --shadow-sm/md/lg) plus a soft shadow, and inner rows use a slightly deeper tint (#f4ede1). Set these at theme level in the product.

Correction: the sum-to-8 rule applies to the launch AUSTRALIAN prices only (A$44 Solo, A$143 Crew, A$134 / A$17 seats, A$1,502 training). Other regions use converted prices: NZD 59 / 192 / 180 / 23 · GBP 29 / 94 / 88 / 11 · EUR and USD 44 / 143 / 134 / 17 · CAD 59 / 192 / 180 / 23.


## Update 24 Sep 2026 — Staff mailboxes (Connections)
New "Staff mailboxes" section: Microsoft 365 domain, Board-approved (sensitive connector), list of every shared and staff mailbox with what it feeds, Reading/Off per mailbox (only GM, Board or Commercial Manager can change; changes go to the Board). Rules: work mail only; anyone can mark a folder/sender/single email private and SPEC never reads it (not even the GM sees it); every person can see what SPEC read from their inbox; every read and reply is logged. My Page shows each person "SPEC reads your work inbox · N things found · Private: …" with links to see reads and manage private mail.


## Update 24 Sep 2026 — training edge decided: treatment, not colour
Kris chose the double border. Every training element carries `border: 5px double` in ink at 55% (rgba(32,30,29,0.55)), 20px radius, on a white fill. It is wayfinding ("this is training"), not a signal, so it never uses a pillar or traffic-light colour and cannot collide with Compliance mulberry. The module's pillar still shows on its pillar tag; status still shows on its chip and progress bar. Apply it in all six places training appears: Training module cards, the assign-a-module list, training on My Page, training KPI rows on scorecards, training items in the Weekly Meeting, and the training line in the Board pack, including on the 390px phone view. Contrast floor 4.5:1 for all text inside is unchanged.


## Update 24 Sep 2026 — month close for every business
Solo to hundreds, every SPEC business runs the same close: (1) last day, scores lock at midnight; (2) the Board report builds from locked numbers (a sole trader gets a one-page report to themselves); (3) each person's locked scorecard is filed on their HR record (People → Reviews & conduct → "Monthly scorecards on file"); (4) on the 1st scores go to zero, KPIs/targets/teams carry over. Shown on the Board pack as "How every month closes".


## Update 24 Sep 2026 — the busy tradie (Tech Day)
- "Hold to talk to SPEC" on the phone's Today screen: speech in, SPEC's reading out (variation priced from pre-builds, hazard, materials used), one Approve. Nothing actions without Approve.
- End of day screen: hours, timesheet done for you, photos, jobs signed off, KPI board, tomorrow's first job and van list. One button, "Done for the day". Nothing to fill in at night.


## Update 24 Sep 2026 — Leads & estimating (Jobs → Leads tab)
- Where the work comes from: website form, Google, missed calls (auto text-back within 2 min), repeat customers, builders/plans, referrals — counts, quoted, won.
- Waiting for a quote: every open lead with its age (green <2 days, amber 2, red 3+) and speed-to-quote vs 2-day target; "Quote it" goes to Pre-builds.
- Work SPEC found: opportunities mined from the business's own customers and job history (service due, old switchboards, ageing solar), each with a drafted message and one button.
- Estimate from plans: drop PDF/photos of drawings; SPEC does the takeoff (counts per item and where), prices each line from pre-builds at today's prices, shows total and hours; "Approve and send" creates the quote on the Jobs board. Uncertain counts are marked on the plans for the estimator to confirm.


## Update 24 Sep 2026 — finish, invoice, paid, next job (Tech Day)
Client sign-off creates and sends the invoice automatically (from the job's hours, materials and variations). On the same screen the tech can take payment: "Tap to pay on this phone" (card on the phone, e.g. Stripe/Tyro Tap to Pay) or "Send a pay link". Paid invoices post to Xero and the job moves to Paid on the Jobs board by itself. The screen then shows the next job with travel time and one button, "Off to the next job".


## Update 24 Sep 2026 — materials and labour time
- Jobs → **Materials** (was Catalogue): live supplier prices from the business's own trade accounts (e.g. Middy's, Rexel, MMEM, CNW) side by side with stock at the nearest branch, best price highlighted; a site list per job built from its pre-builds at best price, "Order it all" splits into one PO per supplier; **supplier holdups** show why an order is late (backorder, truck delay) and a way around it (switch supplier, swap schedule days) in one tap. Supplier portal access needs each supplier's API or account integration.
- Jobs → **How long?**: the labour guide. For each task, the business's own median hours and normal range from its finished jobs' timesheets, plus site factors (e.g. pre-1980 home +1.2 h, asbestos board +1.5 h) tapped on/off; answer = usual + site extras, rounded up to the half hour to quote. "Use these hours in a quote" feeds Pre-builds. Factor values learn from timesheets tagged with those site conditions.


## Update 24 Sep 2026 — Understand the work (Jobs → Leads)
Before quoting, the estimator drops site photos, plans/designs (optional) and what the customer said (typed, pasted email or voice). SPEC reads all three and shows: what it sees in each (e.g. ceramic fuses and no RCDs, suspected asbestos backing board, distance board→garage, single-phase meter), the job as it reads it (pre-builds + site factors from How long?), questions to confirm with the customer (drafted, Approve and send), and a price with hours. "Build the quote" moves the lead to Quoted. Anything uncertain is flagged for the estimator, never assumed. Needs image understanding on photos/plans; every reading must be confirmable by a person.


## Update 24 Sep 2026 — late quotes shout on My Page
Any quote past the 2-day target appears at the very top of My Page in a solid red band: "N quotes are late. Don't lose this work.", with value waiting, who's quoting, and the escalation. Escalation ladder: day 2 estimator's My Page, day 3 Commercial Manager's, day 4 Managing Director's. SPEC has the draft ready; one button "Approve SPEC's draft and send". It stays until sent. Speed-to-quote also feeds the Earnings pillar.


## Update 24 Sep 2026 — Jobs tabs grouped
Jobs' 12 tabs sit under three groups, in the order work flows: **Win the work** (Leads, Customers, Quotes, Pre-builds, How long?) · **Do the work** (Jobs board, Schedule, Timesheets, Materials, Stock & buying, Service & assets) · **Get paid** (Invoices & claims). Group row on top, that group's tabs below. Default: Do the work → Jobs board.


## Update 24 Sep 2026 — Subcontractors (People → Subcontractors)
Free on SPEC (no seat), so every subbie gets set up. Invite by business name + mobile; they self-onboard on their phone in ~10 minutes: ABN/GST check, subcontract (rates, payment terms), public liability, workers' comp or personal accident, trade licence + White Card, site induction + SWMS. Six checks; all six = Clear to Work, otherwise they can't be booked on the schedule. Expiries warned 30 days ahead; SPEC drafts the chase text (Approve and send). Light scoring (on time, right first time, safety) visible to the supervisor who uses them. Subbie invoices are matched to hours and materials on the job before payment; mismatches (e.g. 5 days' scaffold hire claimed vs 4 on the schedule) hold payment with a drafted query. Subbies see only their own jobs, never the business's prices.


## Update 24 Sep 2026 — callbacks & rework, tools, Google reviews (Jobs)
Groups now: Win the work · Do the work (adds **Tools & equipment**) · **Get paid and keep them** (Invoices & claims, **Callbacks & rework**, **Reviews**).
- Callbacks & rework: rework % of hours (KPI, target under 2%, feeds Compliance), callbacks count, cost, recovered. Each callback links to the original job and person, with cause: workmanship (free fix), material fault (claim from supplier), subbie (sent to them at their cost), not our work (invoice the call-out). SPEC spots patterns and proposes a checklist fix.
- Tools & equipment: register of every tool (who has it, which ute), test & tag and calibration due, missing items, value/insurance.
- Reviews: when a job is paid, EVERY customer gets the same thank-you text with the Google review link (no review gating — Google's policy prohibits selectively asking happy customers). Complaints go to the supervisor as a callback. SPEC drafts a reply to every review; Approve and post.

Correction (Kris): subcontractors are people working for the business and are held to the full expectation on every job. Each subbie is a PAID TEAM SEAT (A$17/month), not free. Same SWMS, checklists and KPIs as employees; their scores count on their supervisor's team board and feed the team KPIs. They still see only their own jobs, never pricing.


## Update 24 Sep 2026 — key areas and the new Compliance system
Top menu on every app page is now the key areas: **My page · Jobs · CRM · People · Safety · Compliance · Board**, with Setup, Connections and All pages on the right. CRM opens Jobs on the Customers tab (`?tab=customers`). Org chart and Training sit under People; Scoring and Mirrors under Board.
New `SPEC Compliance.dc.html` — the full compliance system: licences & tickets (staff and subbies, 60-day warnings, not current = can't be booked), insurance & registrations (own policies, subbie cover, vehicle rego), certificates of compliance (filled from the job at sign-off, lodged on time), audits & inspections (findings → corrective actions), contracts & award (contracts signed, award check each pay run, subcontracts), breaches & corrective actions (zero standard, overdue escalates to the weekly meeting). Headline counts: current, expiring in 30 days, stopping work, breaches this year.


## Update 24 Sep 2026 — "Your job today" (My Page, every role)
My Page lays out the job for the person's role as ordered steps, each opening exactly where it's done (deep links into Jobs tabs via ?tab=, Safety, Tech Day, Weekly Meeting). The next step is highlighted; steps tick off. Role step lists: Operations Manager, Site Supervisor, Crew, Business development/estimating — in the product these are generated from the role's KPIs and what's open for that person (late quotes, timesheets waiting, holdups, callbacks…). Principle: the only system outside SPEC is the financial system (Xero/MYOB), which SPEC keeps up to date.


## Update 24 Sep 2026 — subcontractors on the org chart
Subbies sit in a **Subcontractors** team node under the supervisor or manager they report to (same team-node pattern as Technicians/Apprentices, flagged isSubbie). The node shows count, hours a week and cost a month, so planning sees true capacity and true labour cost. The org chart header shows total capacity this week (staff + subcontractors, hours). Subbies are paid team seats and their scores count on that leader's team board.


## Update 24 Sep 2026 — Sales Ace in the CRM (Jobs → Win the work → Sales Ace)
For each sales role (e.g. Commercial Manager, Estimator): the three-month Ace run as three rings (closed months + this month live), the rule (90%+ on the sales board, three closed months in a row → quarter incentive doubles, then the run restarts), and the doubled amount at stake. The sales board is fed live from the CRM, never typed: quotes out within 2 days, win rate, leads followed up within 24 h, pipeline coverage, quoted margin (estimators: quotes from pre-builds, quoted vs actual hours). "Do these today" lists the CRM actions that move the board most (stale quotes, unanswered enquiries, unlogged opportunities from email), each with a drafted message; nothing sends without approval. Incentive only shows where incentives are switched on for that person.


## Update 24 Sep 2026 — Jobs Ace, and Aces across the business
- Jobs → Do the work → **Jobs Ace**: same pattern as Sales Ace for Operations Manager and Site Supervisors. Board fed live from the schedule, timesheets and sign-offs: billable hours (86%+), jobs on the hours quoted, rework under 2%, same-day sign-off, safety actions closed on time (Ops Manager: whole-business billable, crews fully booked next week, zero harm). "Do these today" = the actions that protect the board (over-hours jobs, open sign-offs, unallocated hours, unbooked crew days, supplier holdups).
- Training (manager view) → **Aces across the business**: every role has an Ace — Sales, Jobs, Safety, Office, Crew, Apprentice — each with its training path, who holds Ace now, and everyone's three-month run as three dots. Same rule everywhere: path complete + 90%+ for three closed months → Ace; incentive doubles where switched on; then the run restarts. Links open each Ace board.


## Update 24 Sep 2026 — takeoff, leads, tenders, repeat work, WIP, cash flow, markup, customer page, apprentice funding
Jobs groups: Win the work (Leads, **Tenders**, **Takeoff**, Customers, Sales Ace, Quotes, Pre-builds, How long?) · Do the work (Jobs, Jobs Ace, Schedule, Timesheets, Materials, Stock & buying, Tools) · Get paid and keep them (Invoices & claims, **Work in progress**, **Cash flow**, **Repeat work**, Callbacks & rework, Reviews).
- **Takeoff**: drop the builder's plans; SPEC finds each symbol, counts by room and type (downlights, power points, data, switchboard), measures cable, prices from pre-builds; tap a type to highlight it on the plan; Build the quote. Needs symbol recognition on PDF drawings, every count confirmable by the estimator.
- **Lead sources**: website, Google Business Profile, Google ads, hipages/ServiceSeeking, EstimateOne/Cordell, missed calls, repeat, referrals, and opportunities found in staff email. Each source shows count, won, dollars, margin/cost and reply speed.
- **Tenders**: open packages with due date, addenda, takeoff status and a go/no-go (win rate with that builder, crew capacity, margin); won/lost history with how far off the winner.
- **Repeat work** (was Service): recurring revenue total, renewals due, repeat customers with no contract yet, plus the existing contracts, test & tag, vehicles.
- **Work in progress**: per open job — quoted, % done, cost so far, billed, forecast margin; flags under-billed (raise the claim), billed ahead, margin at risk (draft the variation). Totals: WIP to deliver, under-billed, billed ahead, jobs at risk.
- **Cash flow**: 13 weeks of money in/out and balance from Xero, open invoices, the schedule and supplier bills; highlights weeks under the cash buffer (default $80k, set per business) and the actions that fix it. Xero stays the financial system; SPEC reads it.
- **Tech Day → Mark up the plan**: on the phone, add cable runs, moved/added points and notes on the drawing; Save as the as-built → job, office copy and certificate. 44px touch targets.
- **New page SPEC Customer Page.dc.html**: the customer's link (every text/email): job stages, pick a booking slot, "on my way" with ETA and vehicle, approve a variation or ask for a call, invoice with certificate and pay. Linked from Customers.
- **People → Pay → Apprentice funding**: incentive and rebate claims per apprentice from their training contract, when each opens, received/not yet claimed. Amounts confirmed with the Apprenticeship Support Network provider (not hard-coded).
