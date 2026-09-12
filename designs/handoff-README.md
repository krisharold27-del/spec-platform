# Handoff: SPEC Business Solutions — full product design

## Overview

SPEC is an operating system for running a business on four pillars — **Safety, People, Earnings, Compliance** — scored monthly, per role. The product's core loop:

1. Define **roles** (not people) in an interactive org chart.
2. Give every scored role **key measurable deliverables** — two per pillar as a starting point, expandable — with targets *negotiated* with the person who holds the role, never imposed.
3. Feed those KPIs from connected systems (Simpro, Xero, HubSpot, Groundplan, Pylon, Safety Minder) where possible; anything without a system is confirmed manually by a named person, or **flagged as not tracked rather than scored**.
4. Run a weekly meeting whose agenda is generated from the data; log it (logging is itself a People KPI).
5. Score the month, pass/fail two hard gates, submit, sign off, **lock** the period.
6. Generate the board pack from the data.

Three commercial tiers:
- **SPEC Basic** (A$26/seat/month) — no AI support, no connectors, every number typed by hand.
- **SPEC Advanced** (A$44/seat/month) — connectors, KPIs fed and traced, Claude on every page, the people agent; AI usage paid for through SPEC.
- **Training** (A$1,000/month, 4 sessions) and **Consulting** (A$20,000/month, board + quarterly attendance plus a day a week on site) — human help running the software, sold above it. No hourly rate is ever shown.

Decided by one question to the leader — *"Do you want the power of AI?"* — between Basic and Advanced; Training/Consulting are an independent add-on axis.

Two product rules that appear throughout and must survive implementation:
- **The 90% rule** — a business is "SPEC" when all four pillars hold at 90%+ for two consecutive months (configurable in Admin).
- **Hard gates** — Zero Harm and Clear to Work are pass/fail, reported separately, **never averaged into a pillar score**.
- **Ace** (Sales Ace / Ops Ace) — trained on the job, signed off, and holding a minimum 90% on the KPI board **three months in a row**; only roles with an individual KPI scorecard are eligible; the third month triggers an increased incentive.

## About the design files

The files in `designs/` are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy. They are "Design Components" (`.dc.html`): a template plus a small logic class, rendered by the bundled `support.js` runtime. **Do not ship that runtime.** The task is to recreate these screens in the target codebase (the `krisharold27-del/spec-platform` Next.js app) using its existing patterns, components and data layer.

Open any file directly in a browser to see it running. All interactivity in the prototypes is local state over hard-coded sample data.

## Fidelity

**High fidelity.** Colours, typography, spacing, radii and shadows are final and come from the bound "Organic" design system (`designs/_ds/.../styles.css`). Layout and interaction behaviour are intended to be matched closely. Sample content (people, jobs, figures) is plausible placeholder data — JBI Electrical is used as the worked example — except where noted below as verbatim from the customer.

**Verbatim content that must not be reworded:** the Safety KPI table on *My scorecard* (Zero Incidents, Zero Workers Compensation Claims, LTI / MTI Count, TRIFR, Days Without Harm, with "Manual — GM confirmation" and "Pending Safety Minder connection" sources) and the four pillar summary lines on that page — these were taken from the customer's real August 2026 scorecard.

## Design tokens

From `designs/_ds/organic-.../styles.css` (`:root`). Use these exact values.

**Colour**
| Token | Value |
| --- | --- |
| `--color-bg` | `#f5ead8` |
| `--color-surface` | `#ebddc5` (prototypes often use `var(--color-surface, #fff)`; cards render white-ish cream) |
| `--color-text` | `#201e1d` |
| `--color-accent` (terracotta) | `#c67139` |
| `--color-accent-2` (sage) | `#7a8a5e` |
| accent ramp 100–900 | `#fff2eb, #ffe1d0, #ffc6a5, #f6a06b, #d67f48, #b2622d, #8c491a, #643312, #402310` |
| accent-2 ramp 100–900 | `#f0fae1, #e1eecc, #ccdbb2, #aebf92, #8fa073, #728157, #56633f, #3d472b, #272e1b` |
| neutral ramp 100–900 | `#f9f4ed, #eee7db, #dcd3c4, #c0b6a5, #a19786, #82796a, #645c50, #474238, #2e2b25` |

### The colour rule (read this before building any screen)

**Colour is always the result. The letter is always the pillar.** These two never swap jobs.

- Pillar identity is carried by the letters **S · P · E · C**, never by a colour. A role's four-slot marker is four 24px rounded-square tiles, in that fixed order, each containing its letter in white.
- The tile's fill is the traffic light for that pillar's score: green at 90%+, deep amber 75–89%, red below 75%. The same rule governs pillar summary cards, KPI rows, bars, org-chart connector lines and every overall outcome.
- This resolves a conflict in the brand spine: its four pillar colours are green for Safety and red for People, which would make a failing Safety score look green and a healthy People score look red. **The four brand pillar colours are therefore marketing-only** — logo, website, printed pack — and must not enter the product. `SPEC Colour System.dc.html` is the reference page for this rule.
- Traffic-light colour also runs through the org chart's connector lines: the stub below a role takes that role's month score, the horizontal rail takes the worst score among its children, and each riser takes its own child's. A failing branch is visible before any text is read.

**Status colours (added by these designs, outside the Organic palette — traffic lights)**
| Meaning | Hex |
| --- | --- |
| Green — 90% and above / pass / confirmed | `#4f7a3f` |
| Amber — 75–89% / watch / needs confirming | `#c67139` (the accent). On coloured fills carrying white text use `#8c491a` — `#c67139` with white is only 3.6:1. |
| Red — below 75% / fail / not tracked-and-overdue | `#a63b26` |
| Grey — not applicable / not tracked / excluded | `#8c8681` |

Tinted backgrounds for these are always `color-mix(in srgb, <status> 10–16%, transparent)`; chips use 14%.

**Type** — headings `Caprasimo` (weight 400) via `--font-heading`; body `Figtree` via `--font-body`. Heading sizes used: page H1 `clamp(30px,4vw,50px)`; section H2 `22px/1.2`; card title `16–19px`; big stat `34–44px`; hero H1 on the landing page `clamp(38px,5.4vw,72px)`. Body 14–17px with 21–28px line-height. Uppercase kickers: 11.5–13px, `letter-spacing: .06em`, `font-weight: 600`.

**Spacing** — `--space-1..8` = 4.4 / 8.8 / 13.2 / 17.6 / 26.4 / 35.2px. Page padding `clamp(20px,5vw,72px)`; section gaps `clamp(20px,3vw,32px)`; card padding `clamp(24px,3vw,36px)`.

**Radius** — `--radius-sm 8px`, `--radius-md 16px`, `--radius-lg 28px`. Cards use `--radius-lg` or a literal `20px` for inner cards; pills and buttons `999px`; big feature panels `32px`; the phone frame `44px` outer / `34px` inner.

**Shadow** — `--shadow-sm/md/lg` as defined in the stylesheet. Elevation is light; most cards are `--shadow-sm`.

**Status borders** — cards that carry a status use a 4px left border (`border-left: 4px solid <status>`) or a 4px top border on summary cards.

## Marketing voice

The landing headline is **"Aligned people. Extraordinary outcomes."** with the supporting line **"Nimble and powerful."** and the mission statement as the opening paragraph: *"SPEC aligns the core pillars of your business — Safety, People, Earnings, and Compliance — so that small, precise actions fire together and deliver extraordinary impact."* Keep these verbatim.

The brand story is the pistol shrimp: it wins by leverage, not size, and the snap is the whole mechanism firing in sequence — which is the KPIs. The logo is the claw formed from four puzzle pieces, one per pillar.

## Screens

All screens share: a `.nav` header that wraps (`flex-wrap: wrap; row-gap: 8px`) and is deliberately short — app pages carry **My page · Org chart · Scoring · Board pack · Connections · All pages**, marketing pages carry **Overview · Sectors · Pricing** plus the Start free button. Everything else is reached from Home. Current page bold, a `max-width: 1200–1320px` centred column, and a two-column `repeat(auto-fit, minmax(min(100%, 380–400px), 1fr))` grid that collapses to one column on narrow viewports. Every screen is fluid; nothing is fixed-width.

| # | File | Screen | Purpose |
| --- | --- | --- | --- |
| 1 | `SPEC Home.dc.html` | Home / index | Every screen grouped by when it is used. Demo entry point; not necessarily a production screen. |
| 2 | `SPEC Landing.dc.html` | Marketing overview | The pitch, a labour-waste calculator, and the one-shot problem diagnostic (see below). |
| 3 | `SPEC Sign In.dc.html` | Sign in | Returning-user login, separate from the Landing signup flow. |
| 4 | `SPEC Pricing.dc.html` | Pricing | Three-tier ladder: Basic/Advanced software, then Training and Consulting. No hourly rate shown anywhere. |
| 5 | `SPEC Sectors.dc.html` | Sector templates | What the four questions look like in five industries. |
| 6 | `SPEC Setup.dc.html` | Setup wizard | Week-one cascade: business → roles → **billing** → KPIs → people → hand over. This is where a brand-new signup lands, not My Page. |
| 7 | `SPEC Org Chart.dc.html` | Interactive org chart | Build/repair the structure; Link → Flow → Grow. |
| 8 | `SPEC Connections.dc.html` | Connection centre | Connect systems; board approval for sensitive ones; connection health. |
| 9 | `SPEC My Page.dc.html` | My page (start of day) | The page every worker opens daily. Four personas, plus the improvement-opportunity register (see below). |
| 10 | `SPEC My Scorecard.dc.html` | My scorecard | The real KPI table per pillar, comments, staff below. Reached by clicking a pillar tile or a name on My Page — a separate file from My Page itself. |
| 11 | `SPEC Inbox.dc.html` | Approvals | One queue of everything waiting on a person. |
| 12 | `SPEC Mobile.dc.html` | On site (phone) | Four-target field view, offline-tolerant. |
| 13 | `SPEC Weekly Meeting.dc.html` | Weekly meeting | Data-generated agenda, actions, decisions, log it — plus a live feed from the improvement register, ranked harm → money → people → else. |
| 14 | `SPEC Monthly Scoring.dc.html` | Monthly scoring | Score roles, gates, flags, submit, sign off, lock. |
| 15 | `SPEC Board Pack.dc.html` | Board pack | Generated monthly output, including a Snap Score chip and board sign-off on the register. |
| 16 | `SPEC Group.dc.html` | Group | Multi-entity roll-up. |
| 17 | `SPEC People.dc.html` | People | HR + Recruitment (the "one stop shop agent"). |
| 18 | `SPEC Training.dc.html` | Training | Learner path + assign curriculum. |
| 19 | `SPEC Admin.dc.html` | Admin | Permissions by role level, people with access (invite/remove), notification preferences, settings, seats, data. |

### 2. Landing — the labour calculator (most logic-heavy marketing element)

Headline: *"Your labour bill has 10 to 30% more to give."* The claim is **on the labour component only**, not revenue — implementation must preserve this.

Four sliders: revenue ($1–60m), headcount (5–200), labour as a share of revenue (10–60%, default 30%), improvement on labour (10–30%, default 20%).

`labourCost = revenue × labourShare`. Each of six leak lines has a share of labour and a first-year recovery rate; all shares are scaled by `improvement / 30`.

| Leak | Share of labour | Recovery |
| --- | --- | --- |
| Hours paid but not productive | 8.0% | 40% |
| Labour spent doing work twice | 6.0% | 55% |
| Work falling between undefined roles | 5.0% | 50% |
| Admin and double entry | 4.0% | 70% |
| Estimating and follow-up time wasted | 3.5% | 45% |
| Incidents, stand-downs and compliance rework | 3.5% | 60% |

Each line can be toggled off, which removes it from the headline percentage and every dollar figure. The band also translates the gap back to a percentage of total revenue and a per-person figure, and compares the recoverable amount to the annual seat cost. Bars: amber = waste, green = recoverable.

### 6. Setup wizard

Six steps with a clickable stepper (done steps show ✓). Step 1 collects business name, sector, size band and ends on the AI question rendered as two large selectable cards (**Yes — SPEC Advanced** / **No — SPEC Basic**) with a consequence line beneath. Step 2 lists roles Claude proposes, each with a reason and a keep/remove toggle. Step 3 is billing — a plan toggle (Basic A$26/seat, Advanced A$44/seat), seat count and monthly total computed live from roles kept so far (checklist/vacant roles are free and don't count), and a mock card form (name, number, expiry, CVC — visual only, flagged for real Stripe integration); "not charged until the first period is scored." Step 4 is the KPI negotiation: per-role tabs, each KPI showing *Proposed* (static) next to an editable *agreed* field and an "Agree this target" action; state records "Agreed as proposed" vs "Agreed — negotiated". An "Add another KPI for this role" action records extras. Step 5 puts people into roles (blank = vacant) and sends invites. Step 6 hands the same steps to each manager. Right rail: what Claude is doing at this step, plus a live progress summary. This is where Landing routes a brand-new signup — never straight to My Page, which is full of one business's ongoing data.

### 7. Org chart (highest implementation complexity)

- **Layout is computed, not nested DOM.** A single recursive walk assigns each node a centre x and a depth row (`SLOT = 200px`, `ROW = 168px`; card widths 226/186/158 by depth, heights 108/100). Cards are absolutely positioned inside a relatively positioned canvas sized to the tree. Connectors are three kinds of absolutely positioned divs: a 28px vertical stub under a parent, a horizontal rail spanning first-child-centre → last-child-centre, and a riser from the rail to each child's top. *Do not* attempt nested flex columns; it produced unconnected lines and a recursion bug in earlier iterations.
- **Two drag types.** Dragging a **card** re-parents the role (blocked if the target is a descendant, or the node is root). Dragging the **name pill** inside a card moves the *person* to another role; if that role is filled, the two people swap and the vacated role goes vacant.
- **Right-click** on the canvas → Add a new role / Reset; on a card → Add a direct report / Open scorecard / Break the link / Make this role vacant / Remove role. Menu is absolutely positioned inside the canvas using `clientX/Y` minus the canvas rect.
- **Detached branches.** "Break the link" sets `parent = null`. Any node not reachable from the root is excluded from the chart, from roll-up averages and from the Flow stage, and its top node appears as a chip in an "Off the chart" tray labelled `"<role>  +N below"`. Dragging the chip back restores the whole branch.
- **Import.** Three routes: file upload (`.csv/.xlsx/.docx` — CSV parses client-side; others show a "SPEC extracts the list and shows it for confirmation" placeholder), paste (one role per line: `role, person, reports to`, split on `,;|\t`; unmatched managers land in the unlinked tray), and connect a system (BambooHR, Employment Hero, Xero Payroll, Microsoft Entra).
- **Link → Flow → Grow** stage cards: Link = nothing off the chart; Flow = every role has KPIs set; Grow = all four pillar averages ≥ 90.
- Each card shows four status dots (S, P, E, C) sized by depth. The right rail is the selected role's scorecard with sliders per pillar, and a live board roll-up.

### 8. Connections — connection health

Connectors are the administrator's core surface, so the page carries a **Connection health** band above the connector list: per connector, last successful sync and its cadence, reliability over 30 days, a traffic-light state, and — the part that matters — what breaks downstream when it stops.

The governing rule: **a stale feed's KPIs go to _Not tracked_, never carried forward at last known value.** A number that silently stays on the board looking current is worse than no number. Safety Minder is shown stale (token expired 14 days); Groundplan on Watch (four missed runs, a fifth stops it counting for the month). Action labels differ by state — healthy feeds offer "Test the feed", Watch offers "View missed runs", only a genuinely stale feed offers "Reconnect", and an unauthorised user sees "Ask the GM".

### 9. My page — one page, four personas, plus the improvement register

Persona switcher (top right) swaps the entire dataset: **Operations Manager**, **Site Supervisor**, **BD Manager**, **Apprentice (no scorecard)**. Shared blocks: four pillar light cards (linking to the scorecard), greeting + "What needs me today" (tickable tasks, each naming the KPI it moves), team/crew with four dots each, KPI reports from connected systems (value, target, bar, source, sync time), Ace run card, Ask anything (with three canned prompts and answers per persona), changes to acknowledge, messages (headlines only + Open in Outlook/Gmail), weekly meeting log, training progress. Supervisor adds a **Today's jobs** block plus toolbox-talk / report-a-hazard / clock-in actions. The apprentice persona shows a "Checklist view · this role is not individually scored" label and an Ace card explaining ineligibility. Page ends: *"That is the whole day. Nothing else to open."*

**The improvement-opportunity engine.** A "Got a problem?" box (marketing-page language stays as "problem" on Landing/Board Pack; inside the product it is always "improvement opportunity" — see the copy rule below) takes plain-English text and calls Claude with a fixed system prompt to produce structured JSON: a pillar "bloom" (which of S/P/E/C are in play, each marked definite or possible — People is never marked possible, and physical/psychological harm is always Safety, never People), an error line naming the real root cause, a P-first fix chain (each step naming an org-chart seat or a KPI — never generic advice), and a noOwner flag. If nobody owns it, the copy is deliberately not a dead end — "Of course we can address this — and it starts with the people" — never "you can't solve this yet". Confirmed entries write into a persistent register (localStorage key spec_register in the prototype; a real table in production) carrying: text, bloom, chain, solution, owner, manager, deadline, status (open to claimed to closed, or reopened), reopen count, recurrence count. Two-stage close: the owner claims it done, the weekly COGS meeting validates and signs it off — a claim alone does not close it. A look-back audit flag fires roughly two months after sign-off. Recurring problems (matched by rough text similarity) escalate rather than re-logging silently. The register sorts by a fixed priority: harm, then money, then people, then everything else.

Snap Score — a ring meter (not a raw problem count) reading the register's close rate, reopens and recurrence, shown at 0 / "not enough history yet" until at least 3 entries exist. It appears on Landing (bottom, public taste), My Page (header corner, tied to an "Improvement opportunity" tab toggle), and Board Pack (a chip beside the hard gates). Same formula everywhere — do not let it drift per screen.

Two levels of accountability. Every register entry can be assigned to a person and routes to their manager; a toast confirms "X will see this waiting for them next time they open their page." A notifications bell (top nav) surfaces items assigned to you, overdue, approved or sent back by the board — computed live from the register, not a separate push system.

### 10. My scorecard

Header block: Prepared by / For sign-off by / Period / Cadence, plus Lock & Archive. Four pillar cards carry the customer's verbatim summary lines and switch the page. The KPI table uses the design-system `.table`: KPI (with optional sub-label), Target, August result, Status chip (Confirmed / Not tracked / Watch), Source. Monospace for target and result values; "Not tracked" rows are muted. Comments thread with an add box; "My staff" rail with per-person status and a book-a-one-to-one toggle; "Where these numbers come from" provenance list.

### 14. Monthly scoring

Status bar (Open → Submitted → Locked) with progress across roles. Hard gates as two pass/fail cards with a toggle. Role tabs; each KPI row shows target, an editable result, a status chip (Fed / Confirmed / Needs confirming / Not tracked) and a source line — manual rows read "needs a name against it" until confirmed. Fed rows are read-only. Flags list, live pillar roll-up with verdict, Ace watch (three-month streaks), and a four-step sign-off trail. Locked periods are immutable; corrections are noted adjustments in the next month.

### 17. People

Two modes. **HR**: everyone with basis, leave owing, next review, clear-to-work; leave requests with their impact on the roll-up; documents and obligations feeding Clear to Work; onboarding progress. **Recruitment**: a hiring-region block (NSW, QLD, NZ, UK) that changes licence verification, pay band, award/grading and advertising channels; open roles taken from org-chart vacancies with a cost-of-vacancy line; "Draft the ad" generating copy from the role's KPIs; candidates rated 1–5 against the four pillars; an interview scorecard using those same pillars with sliders and a verdict; offer-to-first-day steps. Closing card: connect BambooHR/Employment Hero if they have one — if not, this is it.

### 19. Admin

Permission levels (Director / MD / Manager / Scored role / Checklist role) × nine permissions. Per level a permission is **always on** (built into the level), **never available** (greyed, not grantable), or **togglable**. Two are never delegable: approving a sensitive connector, and signing off a period. People with access is a separate section from the permission matrix — actual accounts (name, email, level, Active/Invited status), an invite-by-email box, and per-row remove. Notifications settings cycle email/SMS on or off (placeholder — wire to real delivery on the same events the My Page bell surfaces: assigned, overdue, board-approved, sent back). Plus cycling company settings (scoring opens, reporting period, the SPEC standard, meeting day, billing currency, Ace incentives auto-apply), seats and billing (checklist roles and vacancies are free), data rules, and an activity log.

## Interactions & behaviour (patterns to preserve)

- **Toggle-to-state buttons**: an action button becomes its completed state with a ✓ and a green tint (`Approve` → `Approved ✓`). Labels are always actions, never state names.
- **Sliders** are used wherever a claim depends on the reader's own numbers; every dependent figure recalculates live.
- **Status is always explained**: a chip is accompanied by the reason and, where relevant, what it blocks.
- **Nothing is silently excluded**: excluded/detached/unlocked items are named and counted, never dropped from a total without saying so.
- Buttons in flex rows need `flex: none; white-space: nowrap;` — the design-system `.btn` has a fixed 36px height and will overflow if its label wraps.
- Hover/active/focus come from the design system; keyboard focus is a 2px accent outline with 2px offset.

## State management

All prototypes hold local state only. For production, the real entities are:

`Business` → `Entity` (group support) → `Role` (id, parentId, title, pillar KPIs) → `Person` (assigned to a role) → `Period` (month; open/submitted/locked) → `Score` (role × KPI × period: target proposed, target agreed, result, source, status, confirmedBy) → `Comment` (role × period) → `Connection` (system, scope, approvals) → `Meeting` (week, attendance, agenda items, actions, decisions) → `TrainingModule` / `Path` (assigned to role) → `Approval` (kind, requester, approver, state) → `AceRun` (role, consecutive qualifying months).

Derived, never stored: pillar scores, roll-ups, Link/Flow/Grow status, Ace eligibility, the board pack, the Snap Score.

Add one more entity for the register: `RegisterEntry` (business, text, bloom JSON, chain JSON, solutionLine, owner, manager, deadline, status, createdAt, reopenCount, recurrenceCount, boardApprovedAt). The prototype persists this as a flat array in `localStorage['spec_register']`, shared by My Page, Weekly Meeting and Board Pack — in production this should be one real table those three screens all read/write.

## Assets

None. No images or icon files are used — icons would be Lucide at stroke-width 2.75 per the design system. The `<image-slot>` placeholders present in early versions of the landing page are drop targets, not shipped assets.

## Files

- `designs/*.dc.html` — the nineteen screens.
- `designs/support.js` — the prototype runtime. **Reference only; do not port.**
- `designs/_ds/organic-.../styles.css` — the design system stylesheet: tokens plus `.nav .btn .input .card .table .tag .washed` component classes. Port the tokens; map the component classes onto the codebase's own components.
- `designs/_ds/organic-.../_ds_bundle.js` — design-system component bundle (not used by these screens beyond the stylesheet).

## Target codebase

`github.com/krisharold27-del/spec-platform` (branch `main`). See `github.md` at the project root for the screen-to-source map recorded during this work.
