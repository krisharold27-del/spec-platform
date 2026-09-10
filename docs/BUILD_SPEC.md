# SPEC — Build Specification

**Version 1.0 · 10 September 2026.** The single brief for building the SPEC platform.

A build session should need **this document and nothing else**. Where it disagrees with any other
project document, this wins. Where it disagrees with an artifact, the artifact is the source and this
document is wrong — say so rather than guessing.

**Existing codebase:** `krisharold27-del/spec-platform` — Next.js App Router + TypeScript, Supabase
Postgres (ap-southeast-2) with RLS, Drizzle ORM, Tailwind + shadcn/ui, Vercel, Resend, Stripe. Live at
`https://app.specbizhq.com`. It was built to the 6 September specification; this document supersedes
that.

---

## 0. Principles that constrain everything

These are not aspirations. Each one rules out code that would otherwise be written.

1. **Role first, person second.** Roles are defined by what the business needs; a person is assigned
   to a role. **KPIs hang off `roles`, never off `users`.**
2. **Read to inform, not write to change.** No AI path writes a score, a target, a KPI or a
   structural change. Ever.
3. **Nothing recalculates history.** A closed month keeps the structure, targets and chain it had.
4. **Nothing is sent.** No email carries business content. Nothing is attached or linked.
5. **SPEC as a company has no access to tenant content.** No support tool renders it, no query path
   exists, no break-glass.
6. **Only me and above.** Visibility runs up a person's own chain and down it. Never sideways.
7. **Manual is a complete, permanent mode.** No connector is ever required for any feature.
8. **Ask once, at the moment it is relevant, and never nag.**
9. **The business's own managers control KPIs and scoring.** SPEC proposes and sense-checks; it never
   sets.
10. **Pending is never red.** Not-measured-yet is not doing-badly.

---

## 1. Data model

Every table below is tenant-scoped with `tenant_id` and protected by RLS. **No query anywhere may read
across tenants.**

### 1.1 Tenancy and structure

**`tenants`** — one per customer business (a group is one tenant).
`id`, `name`, `region` (ISO country), `currency`, `financial_year_start_month` (1–12),
`meter_target_default` (int, default 90), `created_at`.

**`entities`** — trading entities inside a tenant. A single-company tenant has exactly one.
`id`, `tenant_id`, `name`, `financial_year_start_month` (nullable — overrides tenant),
`status` (`active` | `closed`), `created_at`.
*Rule:* an entity is a **sealed branch**. No `roles.parent_role_id` may cross entities.

**`roles`** — the chart. The spine of the whole model.
`id`, `tenant_id`, `entity_id`, `parent_role_id` (nullable — null = top of that entity),
`name`, `level` (`director` | `gm` | `manager` | `supervisor` | `specialist` | `technician` |
`apprentice`), `is_board_role` (bool), `stream` (`commercial` | `operational` | `growth` | null),
`status` (`draft` | `confirmed` | `closed`), `opened_at` (when it became vacant), `created_at`.
*Rules:* a role with `status='draft'` cannot carry KPIs or be scored. A role is `closed`, never
deleted, once it has history. `is_board_role = true` implies no KPIs, no score, no incentive (§1.6).

**`people`** — everyone on the chart, seat or no seat.
`id`, `tenant_id`, `name`, `email` (nullable until the structure is confirmed), `created_at`.

**`role_assignments`** — a person holding a role. A person may hold more than one (§4.4).
`id`, `tenant_id`, `role_id`, `person_id`, `is_primary` (bool), `started_on`, `ended_on` (nullable).
*Rule:* a role has at most one open assignment at a time. `ended_on` set = the role becomes vacant.

**`users`** — a person who can sign in. Billable.
`id`, `tenant_id`, `person_id`, `auth_user_id` (Supabase), `access` (`administrator` | `full` |
`read_only`), `created_at`, `deactivated_at`.
*Rule:* **`users` exist only where an administrator created a seat.** People without users are free
and still scored.

### 1.2 Measurement

**`kpis`** — attached to a role, never a person.
`id`, `tenant_id`, `role_id`, `pillar` (`safety` | `people` | `earnings` | `compliance`),
`name`, `target_text`, `weight` (int, default 1), `source` (`manual` | `connector` | `meter`),
`connector_category` (nullable), `is_sales_behaviour` (bool — counts toward Sales Ace, §6.4),
`created_by_user_id`, `created_at`, `retired_at` (nullable).
*Rule:* retiring takes effect from the month it happens, never backwards.

**`periods`** — one calendar month per entity.
`id`, `tenant_id`, `entity_id`, `year`, `month`, `state` (`open` | `locked`),
`locked_at`, `locked_by_user_id`.
*Rules:* opens automatically on the 1st. A month is **marked and locked during the following month**
(§5.1). A new period never requires the previous one to be closed.

**`marks`** — one KPI, one role, one period.
`id`, `tenant_id`, `period_id`, `kpi_id`, `role_id`,
`status` (`confirmed` | `met` | `on_track` | `watch` | `not_met` | `pending` | `not_tracked`),
`value_text` (nullable), `marked_by_user_id`, `marked_at`.
*Default:* every mark starts `pending` when a period opens.

**`amendments`** — a correction to a locked month.
`id`, `tenant_id`, `mark_id`, `previous_status`, `new_status`, `reason_text`,
`made_by_user_id`, `made_at`.
*Rule:* the original mark is never overwritten. Both are shown.

**`comments`** — on a person's month (§5.4).
`id`, `tenant_id`, `period_id`, `role_id`, `person_id`, `author_user_id`,
`author_side` (`subject` | `leader`), `body`, `created_at`, `edited_at` (nullable).
*Rules:* only the person the card belongs to and their direct leader may write. Editable while the
period is `open`; **immutable once locked**, for everyone including administrators.

**`period_scores`** — computed and frozen at lock. Never recomputed.
`id`, `tenant_id`, `period_id`, `role_id`, `pillar`, `pillar_pct`, `role_pct`,
`ceiling_applied`, `earned`, `deduction_pct`, `payable`, `chain_snapshot` (jsonb).
*Rule:* `chain_snapshot` records the reporting chain **as at lock**, so a later restructure cannot
change a past deduction.

### 1.3 Meters

**`meters`** — `id`, `tenant_id`, `role_id` (the owner), `name`, `target_pct` (default from tenant).
**`meter_components`** — `id`, `meter_id`, `name`, `share_pct` *(shares must total 100)*.
**`meter_keys`** — `id`, `component_id`, `name`, `weight_pct` *(weights within a component total
100)*, `source`, `connector_category`.
**`meter_readings`** — `id`, `meter_id`, `period_id`, `key_id`, `pct`.

### 1.4 Access and grants

**`grants`** — every non-structural permission. All are to a **named person in a named role**, scoped,
dated and revocable.
`id`, `tenant_id`, `user_id`, `role_id`, `kind` (`withdraw` | `sensitive_source` | `cross_business` |
`hr_records`), `scope_json`, `granted_by_user_id`, `granted_at`, `expires_at`,
`revoked_at` (nullable).
*Rule:* a grant **never widens visibility** — it only permits an action over what the user can already
see.

**`recovery_contact`** — `tenant_id`, `name`, `email`, `named_at`, `declined_at` (nullable),
`offered_at`. No access to anything. Exists only to claim administration (§9.3).

**`access_log`** — `id`, `tenant_id`, `user_id`, `action`, `target`, `at`. Withdrawals, grants,
sign-in-as, exports. Visible to administrators without asking anyone.

### 1.5 Connectors

**`connections`** — `id`, `tenant_id`, `category`, `status`, `connected_by_user_id`, `connected_at`,
`failed_at`.
Categories: `job_management`, `financials`, `safety`, `crm`, `payroll`, `people_hr`, `recruitment`,
`communications`, `other`.
*Rules:* **by category, never by vendor** — no vendor name appears in the schema or the UI.
`communications` is connected **by the individual**, not by an administrator. A failed feed notifies
only the person who set it up; every KPI it fed reverts to the manual toggle.

### 1.6 Board roles

A role with `is_board_role = true`:
- sits above the top operational role of its entity or of the tenant
- may carry a name, or be left vacant
- may be given a **free** seat (`users` row with `access='read_only'`, not billed)
- **has no KPIs, no marks, no pillar score, no colour, no roll-up, no incentive, no deduction**
- is excluded from the 90 per cent rule and from certification

---

## 2. Authorisation — the visibility rule

**This must be enforced in the database, not the UI.** Every read path obeys it.

### 2.1 The rule

> A person's card is visible to that person, and to everyone directly above them in their own chain.
> Nobody sideways. Nobody below.

`can_view(viewer_user, subject_role)` is true when **any** of:
- the viewer holds `subject_role`;
- `subject_role` is a descendant of any role the viewer holds, **within the same entity**;
- the viewer holds a board role and `subject_role` is the role reporting directly to it (§2.3);
- an active `grants` row of kind `cross_business` or `hr_records` covers it.

It is false in every other case, including: the viewer's own leader, any peer, any role in another
chain, any role in another entity, and any dotted-line relationship (**dotted lines do not exist in
the model** — if someone needs sight, the chart is wrong).

### 2.2 Consequences that must be built, not assumed

- **The org chart shows structure to everyone, colour to almost nobody.** Names, roles and reporting
  lines are visible to all. **Percentages and colours render only where `can_view` is true.** Every
  other box is plain.
- **A team roll-up is its leader's number** and is not visible to the team. It is one step from
  working out a peer's score.
- **No leaderboard, ranking, sorting-by-score or comparison exists anywhere**, including anonymised.
- **Notifications obey it.** If an email would reveal a score the recipient cannot see, it is not sent.
- **The AI obeys it absolutely.** Every query is scoped to the asker. *"How is my manager tracking?"*
  is **declined**, not softened or partially answered. A summary of a hidden number is the hidden
  number.
- **A deduction never names its cause to the people who caused it.** The leader sees their own full
  working because those failures are beneath them.

### 2.3 Board roles looking down

A board role sees the pack, the chart, and **the card of the role reporting directly to it** — the GM
or MD. Not below that.

### 2.4 Access levels

| Level | Can |
|---|---|
| `administrator` | Add/remove seats · all grants · region, currency, financial year · add/remove entities · confirm the chart · name the recovery contact. **Cannot set anybody's KPIs.** |
| `full` | Own and manage KPIs on their team's cards · set targets · mark · lock what is theirs. **Cannot add a seat or widen visibility.** |
| `read_only` | See their own card in full, including the working. Comment on their own month. |

**No exception by job function.** HR, finance and executive assistants get access through `grants`,
visible on their profile to everyone it covers, with an end date.

---

## 3. The scoring engine

### 3.1 Statuses

| Status | Scores as | Set by |
|---|---|---|
| `confirmed` | Y | manual |
| `met` | Y | either |
| `on_track` | Y | automatic |
| `watch` | **NA** | manual |
| `not_met` | N | either |
| `pending` | **NA** | default |
| `not_tracked` | **NA** | manual |

**Watch guard:** a KPI marked `watch` for **two consecutive closed months** resolves to `not_met` on
the second lock. Without this, Watch becomes the way a business never fails at anything.

The vocabulary is fixed. A business cannot add an eighth.

### 3.2 Pillar

```
pillar_pct = (Σ weight where scores Y) / (Σ weight where scores Y or N) × 100
```
NA rows are excluded from **both** sides. A pillar where every KPI is NA has **no score** — it is
`not_tracked` and is left out of the role mean, not counted as zero.

### 3.3 Role

```
role_pct = mean(pillar_pct for pillars that have a score)
```
Unweighted. Safety does not outrank Earnings. Round to one decimal **at display only**, never
mid-calculation.

### 3.4 Team roll-up and bands

```
team_pct = mean(role_pct for every person in that team who has a score)
```
A team with nobody scored has no light — `pending`, never coloured.

| Band | Range |
|---|---|
| On track | 100% |
| Watch | 50 – 99.9% |
| Behind | < 50% |
| Pending | no score |

### 3.5 The 90 per cent rule

Qualifies when **every pillar** of the team roll-up is ≥ 90% for **two consecutive closed months**.
Consecutive means closed months with no gap; an unscored month breaks the run rather than pausing it.

---

## 4. The chart

### 4.1 Getting it in — three doors, one destination

**Upload** (spreadsheet, CSV, or a picture/PDF of a chart) · **Connect** (`people_hr` or `payroll`) ·
**Describe** (conversation). All three produce **draft roles**. Nothing is scored until a role is
`confirmed`.

- **Comes in:** names, titles, reporting lines, optionally emails. **Emails are held back** until the
  structure is confirmed.
- **Never comes in:** KPIs, targets, salaries, performance history, or personal data beyond the chart.
- **Import creates `people`, never `users`.** Two hundred people cost nothing; seats are an
  administrator's act with a price.
- **A connected source proposes, never applies.** Starters, leavers and moves arrive as suggestions an
  administrator accepts. Nothing may silently restructure a chart mid-month.
- **Re-import never overwrites.** It is diffed and offered as changes.

### 4.2 Building it — follow the streams

Top row is the three streams (Commercial, Operational, Growth) — which is also the COGS membership.
Then **depth first**: finish one stream entirely before starting the next. The question is always
**"who comes next?"**

**Never a blank chart.** Industry + headcount produce a sample structure to argue with.

### 4.3 Moving things

Everything structural is easy and reversible: drag a role anywhere (it moves with its holder and
everything beneath; **history is never reset**), add a role inline, remove one **only when vacant**,
rename, split, merge, undo.

- **A closed month keeps the chain it had** (`chain_snapshot`). Moving a role never re-runs a
  deduction or re-points a roll-up. The new chain applies from the open month forward.
- **Visibility changes the same minute.** Access follows the role, both directions.

### 4.4 Role change vs merge

Entering the same person into a second role prompts which it is:

- **Role change** — the old role becomes vacant; the name moves fully.
- **Merge** — the person keeps both roles; both are scored.

**Merge arithmetic:** incentive is calculated on the **higher of the two ceilings, once** — not
summed. `role_pct` for that purpose is the **mean of the two roles**. **Both chains count** for the
deduction, still capped at 25%. Visibility follows both roles.

### 4.5 The Link Review

Offered **once**, when the chart is first complete enough to review, as an invitation in place — never
a blocking modal.

> *"Nine roles, thirty-four people, three streams. Ready to make this org chart sing?"*

- Run by **administrators or people an administrator assigns**, as a **team huddle** — the senior group
  standing, the chart on a screen, changes made live.
- Runs six checks and raises **only what it found**, one at a time, each with its reason, **skip on
  every one**: too many direct reports · a layer that only passes information · two people accountable
  for the same outcome · a pillar with nobody accountable · a person reporting to somebody who cannot
  see their work · a title that is a reward rather than a role.
- **No score, no grade, no percentage, no warning triangles.**
- Ends with a plain summary and one press to confirm the chart. **That press is the end of Link.**
- Declining changes nothing and it is never raised automatically again. Re-offered **only when a
  stream head changes**.

### 4.6 Groups and entities

One account, one bill, one login, each entity a sealed branch.

- Region and currency on the tenant; **financial year overridable per entity**.
- Each entity closes its own month; one being behind never blocks another.
- **Group roll-up needs no new arithmetic** — the group is one more level: the mean of the scored
  people in the group team (the owner and the entity heads).
- **Deductions stay inside the entity.** The owner, above all three, carries all three, still capped
  at 25%.
- Board packs per entity, plus a group view of the four lines each.
- Removing an entity **closes** it; history is never deleted.

---

## 5. Periods, locking, amendments, comments

### 5.1 The cycle

A period is a **calendar month of work**, and is **marked and locked during the month that follows
it** — August is closed during September. Financial KPIs arrive when the P&L does; nothing is guessed
at to hit a date.

- Opens automatically on the 1st. Never set up by hand.
- Marks editable until locked, with no record of the churn.
- **Locking is a person's decision, not a date.** Lock what you know — a KPI still waiting sits
  `pending` and arrives later as an amendment.
- Locked months are **immutable**. A correction is an `amendment` — dated, attributed, shown beside
  the original.
- October opens whether or not August was locked.
- **The next period reloads automatically**: same roles, same KPIs, same targets, all marks back to
  `pending`. The structure carries forward; only the marks reset.

### 5.2 The financial year

Defaults from region — **July** (AU, NZ), **April** (UK), **January** (US and most others).
**Changed only by an administrator.** Never asked at signup; stated once, at the first quarterly
review or first year-so-far view, with a way to correct it.

Affects **only**: the year-so-far view, the quarterly review, and year-to-date figures in the pack.
**Quarters follow the financial year, never the calendar.** It affects no monthly arithmetic.

### 5.3 The closed month is the performance record

Locking files the month to each person's performance record: the score, the working, and both
comments. Twelve dated entries a year showing what was expected, what happened, and what both people
said.

**HR reads it in SPEC** under a `grants` row of kind `hr_records` — visible on that person's profile
to everyone it covers, with an end date, revocable. If personnel files live elsewhere, an
administrator-authorised person **withdraws** the record.

### 5.4 Comments

There is **no challenge process, appeal form or dispute workflow**. There is a comment, and **both
sides have the right to leave one**.

- **Who:** the person the card belongs to, and their direct leader. Nobody else writes; everyone above
  in the chain reads.
- **Before lock:** the author may edit or remove their own. **After lock: permanent**, for everyone.
- **It never changes the number.** A wrong score is an amendment; the two mechanisms are separate.
- **Neither side is prompted.** SPEC never asks *"do you want to respond to this?"* — inviting a
  response manufactures a disagreement that mostly was not there.

---

## 6. Incentive

### 6.1 Ceilings (defaults — a business may set its own)

| Level | Ceiling |
|---|---|
| Director | **not in the scheme** |
| General Manager | $4,000 |
| Manager | $2,000 |
| Supervisor | $1,000 |
| Specialist | $750 |
| Technician | $500 |
| Apprentice | $250 |

**The rule of 8 does not apply here** — it governs published prices only. The halving shape is what
makes the ladder explainable.

### 6.2 Arithmetic

```
ceiling  = role_ceiling × 2   if Sales Ace held that month, else role_ceiling
earned   = ceiling × role_pct
deduction= 5% × (count of pillars scoring < 50% anywhere in their chain), capped at 25%
payable  = earned × (1 − deduction)
```

A failed pillar means **Behind — under 50%**. A pillar at 60% is a bad month, not a failure.
**Failures flow upward only.** A leader is never credited for a good team, only reduced for a bad one.

### 6.3 First period

The first period runs **without incentives attached**. The leader chooses when the switch happens.

### 6.4 Sales Ace

A **mark of respect** for hitting the sales KPIs — the outcome and the behaviours. **Both halves, in
the same month, three months running:**

- **Outcome** — the growth meter at or above target, with **no month carried by a single deal**.
- **Behaviours** — every KPI on that role with `is_sales_behaviour = true` met: calls, client meetings,
  new leads, lead value, whatever that business chose.

**Lost by two consecutive months where either half fails.** Applies from the month earned, **never
backdated**; reverts the month it is lost. Only roles with a growth meter **and** sales KPIs can hold
it. The deduction still applies afterwards. More than one person can hold it — **a standard, not a
ranking**. The director can switch the doubling off, in which case the standing still shows with no
money attached.

**Exposure must be shown to the director before enabling**, not discovered: a sales manager plus four
specialists is $5,000/month at plain ceilings and **$10,000/month if all five hold it**.

---

## 7. Power meters

```
component_pct = Σ (key_pct × key_weight)        weights within a component total 100
meter_pct     = Σ (component_pct × share_pct)   shares total 100
reading       = green if meter_pct ≥ target · amber 60 – 89.9 · red < 60
```

Bands read on the **meter percentage itself**, not a fraction of target. Default target **90**. A
business may raise its target; **the amber floor of 60 does not move.**

**The meter reaches exactly one scorecard — its owner's — as a single KPI under Earnings**, passing or
failing against its target. The keys inside it never appear as separate KPIs on anyone's card.

---

## 8. Seats, pricing and billing

### 8.1 Prices — decided per region, never converted

| Region | Seat | With training |
|---|---|---|
| Australia | AUD $26 | AUD $44 |
| New Zealand | NZD $35 | NZD $53 |
| United Kingdom | GBP £17 | GBP £26 |
| Europe | EUR €26 | EUR €44 |
| United States | USD $26 | USD $44 |
| Canada | CAD $35 | CAD $53 |

Every price reduces to 8. **A price never moves because an exchange rate did.** A new region gets a
round local number chosen to obey the rule, checked before publishing.

### 8.2 Rules

- Priced **per seat per month** — per person who can sign in.
- **People on the chart without a seat are free** and still scored.
- **Board roles are free.**
- **No minimum. One seat is a complete product. No tier unlocks features.**
- Zero seats is free.
- Seats bill from the day taken, pro-rata; removing a person stops the charge at month end.
- **Billed in the business's own currency**, set by where the business is.
- A lapsed subscription goes **read-only**. Nothing is deleted; nothing can change until paid.
- **Export always works**, including while read-only.

### 8.3 Rework required in the built product

The live app implements **A$100/year "SPEC Basic"** with a stage-gated trial and scoring periods
locked until payment. **All of that is superseded.** Stripe products, the tenant plan flag, the trial
gate and the checkout flow need rebuilding against §8.1–8.2.

---

## 9. Containment, withdrawal, recovery

### 9.1 Nothing comes out

Tenant data is processed **only to serve that tenant**. Never used to train anything. **Never pooled,
aggregated, benchmarked or compared across tenants — even anonymised.** Never sold or shared.

**Forbidden by construction:** cross-customer benchmarking, customer content in any training or
evaluation, customer content submitted as feedback to any provider, any analytics vendor or
third-party script near business data, and **any code path that reads across tenants** — the last one
is always added for a good reason and must be caught in review.

**SPEC as a company has no access.** No support tool renders customer content; no person has a query
path to it; **there is no break-glass.** Consequences that must be designed in from the start:
support diagnoses from content-free logs and reproductions, and **every capability support would
otherwise perform is one the administrator screen owes them** — self-service recovery, self-service
audit, an undo for anything irreversible.

### 9.2 Nothing is sent; withdrawal is administrator-controlled

**Sending does not exist** — no email with content, no attachment, no link that works for anyone
unseated. There is no feature to configure and no permission that enables it.

**Withdrawal does exist**, off for everyone by default including administrators, granted to a named
person in a named role over what they can already see, **every withdrawal recorded and attributed**,
revocable.

### 9.3 The recovery contact

Named person, **no access to anything**. Exists solely to claim administration if every administrator
is gone, on proof of business identity — and **claiming never gives SPEC sight of anything**.

Offered **once**, **not at signup**, but the first time a seat is given to somebody else. One line,
blocks nothing. **If declined, never raised again** — it becomes one unfinished item in the
administrator area. The consequence is stated once, plainly, at the moment of declining. The named
person is told and may decline. Two administrators is encouraged, **never enforced**.

---

## 10. What the system sends

Every email SPEC will ever send. **No digests, no marketing, no re-engagement.**

| Email | To | When |
|---|---|---|
| Take your seat | one named person | an administrator added a seat. Single use, expiring, bound to that address |
| Sign in | the person signing in | they asked to |
| Your month is marked | the person scored | their card was completed. Once per person per month |
| Waiting on you | a manager with unmarked KPIs | three days before month end. **Once. Never again** |
| Your board pack is ready | board-role seats | the leader locked and released it. **No attachment, no link, no content** |
| A connection stopped working | whoever set it up | the feed failed. Nobody else is told |

---

## 11. The AI layer

- **SPEC is the agent.** Nothing a customer sees names Claude, Anthropic or a model — not in chat,
  chrome, settings or marketing. **No "powered by" anywhere.** Anthropic appears only in the
  subprocessor list and the DPA, and is admitted honestly if asked directly.
- **Disclosure:** that AI is involved, once per session, wherever an AI-produced suggestion or guide
  appears. It names nothing.
- **The agent is present from the first minute, free tier included** — read-only, scoped by §2.
- **Reading real meeting content and generating KPI suggestions is off until switched on**, per
  meeting, with the content shown first.
- **Two layers:** the visible chat may be Claude or the company's preferred model; **the engine is
  always Claude**. Neither can write.
- **Never:** set or mark a KPI, produce a score, characterise a named person, or answer beyond what
  the asker can see. **No API key ever reaches the browser.**
- **Cost control:** cache the fixed context, route ordinary questions to the cheaper model, and never
  build anything that reads whole datasets continuously.

---

## 12. Build order

**Phase 1 — the model-free core.** Needs no API key, no connectors, no content.
1. Fix `/signin` (500, digest `508667066`) — blocks everything.
2. Schema per §1, with RLS and the `can_view` function per §2.
3. Chart: build, confirm, move, entities (§4). Screens 2, 6, 7.
4. KPIs and marking: statuses, pillar/role/team arithmetic (§3). Screens 3, 8, 9, 10.
5. Periods, locking, amendments, comments (§5). Screen 12.
6. Incentive and meters (§6, §7). Screen 11.
7. The pack, read in place (§9.2). Screen 13.
8. My Page (§screens). Screen 5.
9. Pricing rework (§8.3). Seats, Stripe, regional prices.

**Phase 2 — the AI layer** (§11). Needs the fourteen-step Anthropic setup.
**Phase 3 — connectors** (§1.5), by category.
**Phase 4 — training content.** Independent; can run in parallel throughout.

---

## 13. Deliberately not in v1

Staff logins and the phone · introducing SPEC to the team · the incentive statement · recruiting an
open role as its own screen · a certification LMS · People sentiment/development tracking.

---

## 14. The never list

- No cross-tenant read path, for any reason.
- Nothing recalculates history.
- No leaderboard, ranking or comparison, anywhere, including anonymised.
- Nothing is emailed with content, attached, or linked.
- No public links, no "anyone with the link", no staff-initiated invitations, no guest accounts.
- No self-elevation of visibility, by anyone, including an administrator acting for someone else.
- No AI writes a KPI, a target, a score, or a structural change.
- No vendor name in the schema or the UI.
- No client is ever named by SPEC — no logo wall, no case studies, ever.
- No feature tour, no tooltips carousel, no "here's what you can do".
- No blank form a leader has to invent an answer for.
- No re-asking for anything the business has already told SPEC.
- Pending is never red.
