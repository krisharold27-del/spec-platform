# Angus Shield ⇄ SiteVIP: the connection contract

**Version 1.0.0 · 25 September 2026 · the single source of truth both sides build to.**
An identical copy lives in `angus-shield/docs/` and `spec-platform/docs/`. Change one, change both
in the same day, and bump the version (section 7). Where this file and either repo's other docs
disagree about the connection, **this file wins**; each repo's `DECISIONS.md` records why it changed.

---

## In plain words (for Kris)

- **SiteVIP is the virtual GM; Angus Shield is the virtual admin department.** Both are "powered by
  SPEC", made by SPEC Business Solutions. A business can run either one on its own; used together
  they feel like one system. Connecting them is **one yes**, and it works straight away. Nothing to set up.
- **Each thing has one home.** Jobs, quotes, hours, crew and licences live in SiteVIP. Money lives in
  Angus Shield: invoices, payments, bills, receipts, pay, leave balances, super, GST and the books.
  Each side shows the other's figures but never keeps a second, competing copy.
- **SiteVIP never sees the private money:** no bank details, no tax file numbers, no one's pay.
  It sees what a GM needs: what's invoiced, what's paid, what each job cost and made.
- **When something breaks, the person who made the connection is told, in plain words, with the one
  thing to do.** Nothing is half-done: either an update lands whole or it waits and retries.
- **Either side can switch it off at any time.** What's already there stays.

---

## 0. Two principles above everything in this file (Kris, 25 September)

**Separate products, seamless together.** Angus Shield is its own product: sold on its own to any
business, with its own codebase, security and brand. SiteVIP is the same. But **for a customer using
both, it must feel like one system**: one yes, no re-typing anything either side already knows, the
same words, the same look of decisions ("Is this correct?", two plain options), data flowing
instantly both ways, and moving between them never feels like switching apps (same sign-in feel,
links land on the exact matching page, the same design language). Every rule below serves this.

**Branding.** Angus Shield is sold as **"Angus Shield powered by SPEC"**. SiteVIP is sold as
**"SiteVIP powered by SPEC"**. Two different products, both made by SPEC Business Solutions for SME
businesses in any industry. Each product names the other by its full name where the connection
appears ("Connect Angus Shield powered by SPEC?" may be shortened to "Connect Angus Shield?" once
the lockup is on screen).

---

## 1. The one yes/no

### What the owner sees
In SiteVIP (Virtual GM → Virtual admin, or Connections → Financial system), a card:

> **Connect Angus Shield?**
> Your jobs, hours and crew flow to your books, and your invoices, payments and job costs flow back.
> Bank details, tax file numbers and pay stay in Angus Shield.
> **[Yes]** **[Not now]**

- **Yes** opens Angus Shield's own consent screen (the owner signs in there with their passkey or
  authenticator, as always). It shows the same three sentences and one button: **Yes, connect**.
  Back in SiteVIP it says **Connected.** and the first sync starts. That's the whole setup.
- **Not now** records the answer and asks again only when it's relevant (SiteVIP rule 10: ask once,
  never nag). Same question from the Angus Shield side: Connections → **Connect SiteVIP?**
- **Already signed up to both with the same email?** Still two taps: a connection moves money data,
  so it is always a deliberate yes, confirmed with MFA in Angus Shield.
- **Who may say yes:** in Angus Shield, the owner. In SiteVIP, an **administrator**, and SiteVIP's
  own rule still applies: the `financials` category needs the approval SiteVIP asks for
  (`isSensitive`, board approval). Angus Shield waits until SiteVIP says the approval is in; the
  card says who it is waiting on, never "pending" in red.
- **Matching people and customers** happens once, straight after Yes: both sides propose matches
  by email, then name, then ABN. Anything uncertain is shown as **"Is this correct?"** with two
  plain options ("Same person" / "Different people"). Nothing is merged without a yes.

### How it works underneath
- **OAuth 2.0 authorisation code with PKCE.** SiteVIP is the client; Angus Shield is the
  authorisation server. One connection = one SiteVIP tenant ⇄ one Angus Shield business.
- Scope is fixed by this contract version: `sitevip.v1` (no pick-and-choose scopes; the contract *is*
  the scope).
- Access tokens: 15 minutes. Refresh tokens: 60 days, rotating, single use. Both sealed at rest
  (SiteVIP: `secret-box.ts` with `TOKEN_ENCRYPTION_KEY`, in `connection_credentials` with
  `provider = 'angus_shield'`; Angus Shield: field encryption, `src/lib/security/field-crypto.ts`).
- Each side also registers a **webhook endpoint** and gets a per-connection **signing secret**
  (32 random bytes), exchanged once over the OAuth channel, sealed at rest.
- SiteVIP records the connection as category **`financials`** in `system_connections`. Angus Shield
  records it in `access_grants` with `kind = 'spec_product'`, `party = 'sitevip'`.

---

## 2. What flows each way, and which side is the master

**Master** = the only place it can be changed. The other side shows it read-only and links back.

### Conventions (both sides, every payload)
| Thing | Format |
|---|---|
| IDs | Each side's own ids, as text (both use UUIDs). Payloads carry both where known: `sitevip_id`, `angus_id`. Never reuse or re-mint the other side's id. |
| Money | Integer cents, `amount_cents`, with `currency: "AUD"`. Never floats. Ex-GST unless the field says `_inc_gst`. |
| GST | `gst_cents` alongside, never inferred by the receiver. |
| Dates | `YYYY-MM-DD` (Australian business dates). Timestamps: ISO 8601 UTC with `Z`. |
| Time worked | Integer `minutes` (SiteVIP's unit). |
| Names | The business's own words, never rewritten by the receiver. |
| Unknown fields | Ignored by the receiver (section 7). |

Angus Shield keeps the id pairs in an `external_refs` table: (`tenant_id`, `system = 'sitevip'`,
`kind`, `external_id`, `local_id`). SiteVIP keeps them on its own rows (`angus_id` columns or a
matching refs table; its choice).

### The data

| Data | Master | SiteVIP → Angus Shield | Angus Shield → SiteVIP |
|---|---|---|---|
| **Customers** | Split: SiteVIP for who they are and the job contact; **Angus Shield for billing** (ABN, billing email, terms, what they owe) | name, contact person, email, phone, site addresses | ABN (checked), `owed_cents`, `overdue_cents`, oldest overdue days |
| **Jobs** | **SiteVIP** | ref (`J-1001`), title, customer, site, stage, `value_cents` (agreed price ex GST), dates by stage | nothing about the job itself; see job costs and profit |
| **Quotes** | **SiteVIP** (its quote builder, markup, kits) | when won: quote ref, `value_cents`, stages for progress billing | nothing (Angus Shield's own quotes are for businesses without SiteVIP) |
| **Invoices, claims, variations** | **Angus Shield** (the invoice of record: number, GST, due date, sending, reminders) | an *invoice request* from a `job_bills` row once `agreed`: kind (`invoice`/`claim`/`variation`), what, `amount_cents`, `retention_cents`, job | invoice number, `total_inc_gst_cents`, status (`approved`/`sent`/`part_paid`/`paid`/`void`), due date, `paid_cents`, `paid_on`, days overdue |
| **Payments received** | **Angus Shield** | nothing | via the invoice status above; SiteVIP moves the job to `paid` from it |
| **Hours (timesheets)** | **SiteVIP** (captured and approved there) | each **approved** entry: person, job (or none), day, `minutes`, `billable`, approved by/at | `pay_run.paid` for the period (that the hours were paid, no amounts) |
| **Crew (employees)** | Split: SiteVIP for who works where; **Angus Shield for employment and pay** | name, email, phone, start date, active or not | nothing about pay. Only: `on_payroll: true/false` and start/finish dates if payroll holds them |
| **Subcontractors** | **SiteVIP** (onboarding, the six checks) | business, contact, ABN, status, each check's state and expiry | ABN verified and GST-registered (yes/no), `paid_cents` this financial year (for the contractor report) |
| **Licences and checks** | **SiteVIP** (`subbie_checks`, `obligations`) | state changes, especially `expired` | nothing |
| **Leave** | **Angus Shield for balances and the pay effect**; **SiteVIP for the request and the manager's decision** | request: person, kind, from/to, then the decision and who made it | a balance check on each request: `enough: true/false`, `short_by_minutes` (hours only, never dollars) |
| **Payroll inputs** | **Angus Shield** (rates, awards, tax, super) | approved hours and approved leave, as above | never pay rates, pay amounts, payslips, tax or super |
| **Costs: bills, receipts, POs** | **Angus Shield** for bills and receipts; **SiteVIP** for purchase orders and plant on hire | PO: ref (`PO-0001`), supplier, job, `total_cents`; plant hire: what, supplier, job, on/off dates | per job: each cost line's date, supplier name, what, `amount_cents` ex GST, category (`materials`/`subcontractor`/`plant`/`other`), matched PO ref |
| **Job profit** | **Angus Shield** (it holds every real cost and every dollar received) | nothing | per job: `invoiced_cents`, `received_cents`, `labour_cost_cents` (a total, from real pay, never per person), `materials_cents`, `subcontractor_cents`, `plant_cents`, `other_cents`, `profit_cents`, `margin_pct` (basis points), `as_at` |

**SiteVIP's own margin maths** (`jobMargin`, `labourCostCents` from `labour_rates`) stays as the
estimate when not connected (manual mode is complete and permanent). When connected, SiteVIP shows
Angus Shield's figure, labelled "from your books", with its own estimate beside it only while a job
is still on site.

---

## 3. Events and timing

Every event is a signed webhook (section 4) with this envelope:

```json
{
  "contract": "1.0.0",
  "event_id": "uuid",          // idempotency key: a repeat is ignored
  "type": "job.won",
  "occurred_at": "2026-09-25T03:20:00Z",
  "tenant": { "sitevip_id": "…", "angus_id": "…" },
  "data": { }
}
```

**Delivery:** sent within **60 seconds** of the change, never during a page render (SiteVIP rule).
Retried with backoff (1 min, 5, 15, 60, then hourly) for **24 hours**. Every event carries the full
current state of the thing (not a diff), so a late or repeated event can't corrupt anything, and
the receiver keeps whichever has the newer `occurred_at`.

**Nightly check:** at 2am AEST each side asks the other for everything changed in the last 48 hours
(`GET /v1/changes?since=`) and applies anything missed. Webhooks are for speed; the nightly check
is for certainty.

### SiteVIP → Angus Shield
| Event | When | Angus Shield does |
|---|---|---|
| `customer.upserted` | A customer is added or changed | Updates the contact (never its billing fields) |
| `job.quoted` | Job moves to `quoted` | Notes the quote value for forecasting (no invoice) |
| `job.won` | Job moves to `won` | Opens the job for costs; sets up progress-billing stages if sent |
| `job.completed` | Job leaves `onsite` (work done) | Offers the final invoice if one isn't requested yet |
| `job.stage_changed` | Any other stage change | Keeps the stage for reports |
| `invoice.requested` | A `job_bills` row becomes `agreed` (variation) or is marked to send | Creates the invoice from it, approves it and sends it, or asks "Is this correct?" if something doesn't add up (e.g. over the quote) |
| `hours.approved` | A leader approves timesheet entries | Queues them for the next pay run and job labour cost |
| `leave.requested` / `leave.decided` | Request made / approved or declined | Checks the balance (replies `leave.balance_checked`) / applies to pay |
| `crew.upserted` | Staff or subcontractor added or changed | Updates the link; for subbies, checks the ABN |
| `licence.changed` | Any `subbie_checks` or `obligations` state change; **`licence.lapsed`** when one becomes `expired` | Flags new bills from that subcontractor with "Is this correct? Their licence lapsed on …" |
| `po.raised` | A purchase order is sent | Waits for the bill and matches it |
| `plant.hired` / `plant.off_hire` | Plant on or off hire | Expects the hire bill; flags if none arrives |

### Angus Shield → SiteVIP
| Event | When | SiteVIP does |
|---|---|---|
| `invoice.created` | The invoice exists | Shows its number on the job bill |
| `invoice.sent` | Sent to the customer | Moves the job to `invoiced` |
| `invoice.paid` / `invoice.part_paid` | Money received | Moves the job to `paid` when fully paid |
| `invoice.overdue` | 7, 14 and 30 days after due | Shows it on the job and the customer (never red; plain "11 days late") |
| `job.costs_updated` | A cost lands on a job (bill, receipt, pay run) | Refreshes the job's costs |
| `job.profit_updated` | After any of the above | Refreshes the job's profit |
| `leave.balance_checked` | Reply to `leave.requested` | Shows "Enough leave" or "Short by 15.2 hours, is this correct?" to the approver |
| `pay_run.paid` | A pay run is paid | Marks those hours as paid |
| `abn.checked` | A subcontractor's ABN is verified | Updates the ABN check |
| `customer.balance_changed` | What a customer owes changes | Updates the customer's owed/overdue |

**SiteVIP gap to build (not a contract change):** SiteVIP has no `completed` stage today; it emits
`job.completed` when a job leaves `onsite`. If SiteVIP later adds a completed stage, it emits the
same event then.

---

## 4. Security

### Separate systems
- **Separate code, databases, hosting, keys and release processes.** No shared database, no shared
  login table, no direct database access either way, ever. The only door is this API.
- Angus Shield's data stays in Australia. Nothing from Angus Shield is pooled, benchmarked or
  compared across businesses (SiteVIP rule, and Angus Shield's).
- **Nobody at SPEC Business Solutions can read either side's customer data through this
  connection.** The connection is between one business's two accounts, not a company back door.

### Authentication between them
- API calls: `Authorization: Bearer <access token>` (OAuth, section 1), TLS 1.2+ only.
- Webhooks: header `X-Angus-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>` (same
  shape `X-SiteVIP-Signature` the other way). Rejected if the signature fails or `t` is more than
  **5 minutes** old. Each side keeps seen `event_id`s for 7 days to refuse replays.
- No API key ever reaches a browser. All calls are server to server.

### What SiteVIP may never see or touch
Enforced by Angus Shield's API (the fields don't exist in any response), and tested (section 8):
- **Bank:** account numbers, BSBs, card numbers, bank lines, balances.
- **Tax file numbers**, tax withheld, tax scales.
- **Payroll detail:** pay rates, salaries, awards, payslips, individual pay amounts, allowances,
  deductions, super amounts, super fund details, leave **dollar** values.
- **The books:** journals, the chart of accounts, BAS/GST returns, other customers' records.
- **Writing:** SiteVIP can never change anything Angus Shield is master of. Its only "writes" are
  requests (e.g. `invoice.requested`), which Angus Shield checks and turns into its own records.

### What Angus Shield may never see or touch
- SiteVIP's scores, KPIs, the org chart's scoring, board packs, safety incident details, CRM notes.
- Anything SiteVIP is master of: it can never change a job, quote, timesheet, crew or licence.

### Logging and revoking
- **Angus Shield** writes every call and event (in and out) to its hash-chained audit log: who,
  what, when, `event_id`, result.
- **SiteVIP** keeps no audit table by design; it records the connection's state on
  `system_connections` (`status`, `last_sync_at`, `last_error_at`) and each applied event's id on
  the row it changed.
- **Revoke:** "Disconnect" in either product (owner in Angus Shield, administrator in SiteVIP)
  revokes all tokens at once and deletes the signing secret. Events stop within 60 seconds.
  **What was already copied stays** (SiteVIP rule; Angus Shield's records are also legal records).
  Reconnecting is the same one yes.

---

## 5. Shared words and rules

Both sides use the same words for the same things, in the owner's language:

| Say | Never say |
|---|---|
| Money in / Money out | Receivables / payables, debtors / creditors |
| Owed / Overdue ("11 days late") | Aged receivables, delinquent |
| Job, quote, customer, crew, subbie, hours, leave | Project entity, client record, resource, T&A |
| Job profit ("made $4,200 on this job") | Net margin, contribution |
| You pay the ATO | Net GST liability |
| Connected / Not connected | Integrated, synced, API |

- **"Is this correct?"**, never red warnings: anything unusual (a bill from a subbie whose licence
  lapsed, an invoice over the quote, leave short) is a gentle card with two plain options.
- **Pending is never red** (SiteVIP rule 9): waiting for the other side is shown as waiting, with
  who or what it's waiting on.
- **"Not simple?"** is on every Angus Shield screen (the Simple Guarantee). SiteVIP screens that show
  Angus Shield figures carry the same button, and a report from either side reaches both teams.
- **No "coming soon".** If the connection can't do something yet, the screen doesn't show it.
- Australian English. The business's own words are never rewritten.

---

## 6. When something goes wrong

- **Sync breaks** (token revoked, other side down, a payload refused after 24 hours of retries):
  - The **person who made the connection** is told, in the product, and by the one email both
    products allow for this ("A connection stopped working → whoever set it up", SiteVIP §10). The
    email carries no business content: "Your SiteVIP ⇄ Angus Shield connection stopped. Open
    SiteVIP to fix it."
  - The message says what stopped, since when, and the **one thing to do** (usually "Reconnect",
    one tap).
  - Both sides keep working. SiteVIP falls back to its manual mode (complete and permanent); Angus
    Shield keeps the books. Nothing is lost: missed events are replayed on reconnect via
    `/v1/changes`.
- **A single event is refused** (e.g. an invoice request for a job Angus Shield can't find): the
  receiver answers `422` with a plain-English `reason` and a `fix`; the sender shows it where the
  thing was made ("This invoice didn't reach your books: the customer isn't linked yet. Link them").
- **A conflict** (both sides changed a split record): the master wins; the other side's change is
  shown as "Is this correct?" to the person who made it.
- **Never half-applied:** each event is applied in one transaction or not at all.
- Error responses: `{ "error": "short_code", "reason": "plain English", "fix": "the one step" }`.

---

## 7. Versioning, so neither side breaks the other

- The contract has a version (`MAJOR.MINOR.PATCH`); every payload carries `"contract"`.
- **Minor (1.x):** additive only: new optional fields, new event types. Receivers ignore what they
  don't know. Either side may ship a minor change first.
- **Major (2.0):** anything that removes, renames or changes the meaning of a field. Both sides must
  support the old and new major **side by side for at least 90 days**; the API path carries the
  major (`/v1/`, `/v2/`).
- `GET /v1/contract` on each side returns the versions it supports; the connection uses the highest
  both support and shows a plain message if there is none ("Update needed on the SiteVIP side;
  nothing for you to do").
- **Changing this file:** same text in both repos, same day, version bumped, a line in both
  `DECISIONS.md` files. A pull request that changes the connection code without changing this file
  (when behaviour changes) fails review.

---

## 8. Test checklist both sides must pass

Each item is an automated test in the repo that owns it, using the shared fixture payloads in
section 3 (both repos keep a copy of the same JSON fixtures, `tests/fixtures/contract-v1/`).

**Connection**
- [ ] Yes in SiteVIP → consent in Angus Shield → "Connected." with no other steps.
- [ ] Not now is remembered; not asked again until relevant.
- [ ] SiteVIP's approval rule for `financials` is respected; Angus Shield waits and says who for.
- [ ] Disconnect from either side revokes tokens; the next call fails with `401`; copied data stays.
- [ ] Reconnect replays missed changes via `/v1/changes` with no duplicates.

**Security**
- [ ] No Angus Shield response to SiteVIP contains any field from the "never see" list (schema test
      on every response type).
- [ ] A webhook with a bad signature, or `t` older than 5 minutes, is refused.
- [ ] A repeated `event_id` is ignored (idempotency), and an older `occurred_at` never overwrites a newer one.
- [ ] One tenant's token can never read or write another tenant's data.
- [ ] SiteVIP can't change anything Angus Shield is master of, and vice versa (only requests).
- [ ] Every call and event appears in Angus Shield's audit log.

**Data**
- [ ] Money round-trips to the cent; GST is never inferred by the receiver.
- [ ] Each event in section 3 produces exactly the effect in its table, from the fixture.
- [ ] Approved hours reach the next pay run once, and never before approval.
- [ ] A lapsed licence flags that subcontractor's next bill with "Is this correct?".
- [ ] Leave short of balance shows "Short by … hours" to the approver; no dollar value ever crosses.
- [ ] Job profit in SiteVIP equals Angus Shield's for the same job and date.
- [ ] Invoice paid in Angus Shield moves the SiteVIP job to `paid` within 60 seconds.

**Failure**
- [ ] Other side down: events retried for 24 hours, then the connector's owner is told with one fix.
- [ ] A refused event shows its plain-English reason and fix where it was made.
- [ ] Both products keep working with the connection off.

**Words**
- [ ] No red for anything pending or waiting; "Is this correct?" for anything unusual.
- [ ] None of the "never say" words appear on any connection screen (copy test).

---

*Owners: Angus Shield sessions own sections 2–4 on the Angus Shield side; SiteVIP sessions own the
SiteVIP side. Kris decides anything neither side can agree. Changes: see section 7.*
