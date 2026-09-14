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
Sections, top to bottom: hero with the animated logo and headline **"Aligned people. Extraordinary outcomes."**, a labour-gap cost stat (sentence left, "20%" figure right), a **problem box** ("give me a safety, people, earnings or compliance problem you've faced recently that's been ONGOING" — the word ONGOING visually emphasised), a live AI diagnosis (bloom-out + P-first solution, see below), a routing question, pricing, final CTA.
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

### 4. `SPEC Weekly Meeting.dc.html` — the COGS meeting
Runs the register: pulls a live "From the improvement register" section ranked by the same priority hierarchy, shows accept/deny state, and is where DONE-CLAIMED items get validated and locked. Logging this meeting is itself counted as a People KPI (4 logged meetings/month expected).

---

## OTHER APP SCREENS (all reached from My Page)
- `SPEC Org Chart.dc.html` — the **Interactive Org Chart (IOC)**, the structural core of the "Link → Flow → Grow" method. Right-click to add a role; drag a card onto another to re-parent it (accountability line); collapse/expand branches; a view-scope selector defaults to "[Manager] and below" with a "See whole company chart" escape to the full tree; team-count badges; Ace badges (gold, for roles on a 3-month ≥90% streak) sit at a fixed `top:-11px;right:-11px` offset requiring `overflow: visible` on ancestors. **Layout math**: cards are positioned via a `reserve()`/`walk()` two-pass algorithm — `reserve()` computes each node's horizontal span as *its children's combined span only* (never widened by its own card's width, even though a parent's card can be visually wider than a single child's span — that node's card is centred over that (possibly narrower) span and symmetrically overhangs both sides rather than shifting a sibling). Row-to-row vertical gap is a constant (`GAP`, currently 56px) computed cumulatively per row height, not a fixed stride — different depths have different card heights, so a fixed stride produces uneven gaps.
- `SPEC My Scorecard.dc.html` — an individual's own KPI scorecard (click their name from Org Chart, People, or Weekly Meeting) — sliders to set/adjust each pillar's KPIs, comments, and (if a manager) the same for direct reports below.
- `SPEC Monthly Scoring.dc.html` — month-end entry, source confirmation, hard-gate pass/fail, sign-off & lock.
- `SPEC Board Pack.dc.html` — generated board output: four pillars vs 90%, gates, flagged unsupported numbers, board-level approve/deny on sensitive items.
- `SPEC Group.dc.html` — multi-entity/group rollup (by-pillar and by-entity views), unlocked entities excluded and named rather than estimated in.
- `SPEC People.dc.html` — HR/People-pillar hub: roles, Ace tracking (Sales Ace / Ops Ace — trained, signed off, 3 consecutive months ≥90% on an individual KPI scorecard, unlocks an increased incentive), recruitment.
- `SPEC Training.dc.html` — learner path + manager-assigned curriculum.
- `SPEC Connections.dc.html` — connection centre: connect systems (Simpro, Xero, HubSpot, Groundplan, Pylon, Safety Minder, etc.), **connection health** band (last sync, cadence, 30-day reliability, traffic-light state, what breaks downstream if it stops — a stale feed's KPIs go to "Not tracked", never silently carried forward at last-known value), board-level approval required for sensitive connectors (Xero, BambooHR, payroll).
- `SPEC Admin.dc.html` — permissions that follow the ROLE not the person, company settings, seats/billing, notification preferences (email/SMS toggles — currently placeholders; **Claude Code: wire to real delivery** on the assign/overdue/approved/denied events already computed live in My Page's notification bell).
- `SPEC Mobile.dc.html` — the on-site phone view for crews: four big targets (sign on, report a hazard, log hours, ask), works offline with a queue-and-sync model, no individual scores shown (crews aren't individually scored).
- `SPEC Sectors.dc.html`, `SPEC Setup.dc.html`, `SPEC Pricing.dc.html`, `SPEC Inbox.dc.html` — sector templates, first-run setup wizard, the 3-tier pricing ladder (Basic/Advanced software + Training $1,000/mo + Consulting $20,000/mo — **never show an hourly rate to a customer**, internal-only reference: training $250/hr, consulting $500/hr), and a notifications/approvals inbox.

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
