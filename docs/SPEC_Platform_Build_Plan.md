# SPEC Business Solutions — Platform Build Plan (Claude Code)

Prepared 6 September 2026 from a review of the SPEC JBI Live folder in Drive: SPEC_Workbook_Full (40+ tabs), SPEC_Master_Scorecard_Professional (incl. the Power BI fact/dimension tables), the JBI System Architecture Map, the Claude Enterprise Handoff Summary, and the August 2026 Board Output.

Note: the PRD/build brief drafted earlier was not found in Drive or in this project. This plan stands on its own; when that PRD turns up, merge it in.

---

## 1. What the files say the product actually is

Strip away the 40 tabs and SPEC is five things:

1. **A scoring engine.** Four pillars → weighted Y/N/NA criteria per role → pillar score → person score → team score. The maths is already written in the Master Scorecard (`SUMPRODUCT(answer="Y" × weight) / SUMIF(answer<>"NA", weight)`), and the PBI_Assessments / PBI_People / PBI_Categories tables are a ready-made relational schema.
2. **Rules on top of the scores.** The 90% rule (all four pillars ≥90% for two consecutive months = "the business is SPEC"), pass/fail hard gates (Zero Harm, Clear to Work = 100% training compliance), 2 KPIs per pillar per role, STAR rating for financial reporting.
3. **A rollout sequence.** Organisational diagnostic → First Meeting alignment → cost/revenue coverage checklist → org chart (COGS: Commercial, Operations, Growth) → KPI negotiation → weekly pulse / SOG meeting → monthly board output. This is the "clear plan in two days" rule book.
4. **A linked org view.** GM scorecard linked to manager scorecards linked to supervisor scorecards, with full access above supervisor and read-only below (JBI: 10 full, 30 read-only).
5. **Claude as the explainer and reporter.** Generates the monthly board output, explains *why* a plan makes sense from SPEC principles, later reads Simpro/Xero/HubSpot.

Everything else in the workbook (tender scans, brand colours, insights & paradoxes, delivery models) is content, not code. It becomes seed data or documentation, not features.

### 1a. The product as specified by SPEC Business Solutions (6 Sept 2026)

A business signs up on its own. Claude guides them from the first screen — how the system works, what to enter, what happens next. The leader (usually the GM) enters the business expectations and the top of the org chart. Then the cascade: the GM defines the roles that report to them and assigns people; each of those managers defines the roles under them and assigns people; the KPI system builds downward with it. Everyone ends up on a dashboard of four pillars — Safety, People, Earnings, Compliance — each with the KPIs that matter for *that role*.

Two rules govern the whole build:

- **Role first, person second.** Roles are defined by what the business needs. A person is then assigned to the role. The role is never reshaped to fit the person. In the data model that means KPIs hang off `roles`, never off `users`.
- **Claude is the interface, not a feature.** Guidance, training, "what do I do next", "why does this KPI exist" — all of it is Claude, reading the tenant's data and the SPEC rule book. The forms and dashboards are the display layer; the conversation is the product.

Access follows the org chart: leadership and managers are full-access (define roles, set KPIs, score, write notes); admin and field staff are read-only (see their own role's pillars, KPIs and status).

## 2. What not to build first

- Do not rebuild the 40-tab workbook screen-for-screen. Build the engine and the rollout sequence; keep the workbook as the reference.
- Do not start with Simpro / Xero / HubSpot integrations. Manual entry first, integrations in phase 4. The Board Output shows the real blocker at JBI is that nobody has entered data — the product has to be usable with hand-entered numbers.
- Do not put JBI names, financials, or client data in the product repo. The product ships with a generic seed tenant; JBI lives in its own tenant's database rows only.
- Do not build a certification LMS in v1. The certification track is a later module.

## 3. Recommended stack

Chosen for one non-developer building with Claude Code, cheap hosting, and easy multi-tenant auth:

- **Next.js (App Router) + TypeScript** — one codebase for web app and API.
- **Supabase** — Postgres, auth, row-level security (RLS) for tenant isolation and full/read-only roles, free tier to start.
- **Drizzle ORM** — schema as code (`src/db/schema.ts`), SQLite for local dev, Postgres for production; no binary engines to download.
- **Tailwind + shadcn/ui** — dashboards without design work.
- **Anthropic API (Claude)** — board output generation, "why this plan" explanations, later the tool-calling layer over connectors.
- **Vercel** — hosting, one-command deploy.
- **GitHub** — the repo; Claude Code works against it.

## 4. Data model (v1)

```
tenants            id, name, sector, start_date, status
users              id, tenant_id, email, role_id, access ('full' | 'readonly')
roles              id, tenant_id, title, cogs_stream ('commercial'|'operations'|'growth'|'gm'|'board'),
                   reports_to_role_id,         -- the org chart (roles report to roles, not people)
                   level ('gm'|'manager'|'supervisor'|'staff'), default_access
role_assignments   id, role_id, user_id, from_date, to_date   -- person placed into role; history kept
pillars            id, code ('S','P','E','C'), name, colour, sort
criteria           id, tenant_id, role_id, pillar_id, text, weight, kpi_flag, target_value, active
assessment_periods id, tenant_id, period (YYYY-MM), status ('open'|'locked')
assessments        id, period_id, role_id, criterion_id, answer ('Y'|'N'|'NA'), note, entered_by, entered_at
gates              id, tenant_id, period_id, gate ('zero_harm'|'clear_to_work'|'star'), value, pass, reason
diagnostics        id, tenant_id, section, question, answer, answered_at   -- First Meeting + org diagnostic
meetings           id, tenant_id, type ('SOG'|'board'), date, minutes, actions(json)
board_outputs      id, tenant_id, period_id, markdown, generated_by, approved_by
rulebook_rules     id, pattern, action, source_tenant (anonymised), version   -- cross-client learnings
```

Scores are never stored — they are computed views: `pillar_score(role, period)`, `person_score`, `team_score`, `spec_status` (90% two-months rule). Snapshots are append-only per period (matches the PBI note "append a new dated snapshot instead of replacing").

RLS: every table filtered by `tenant_id`; `readonly` users can select their own role's rows only; `full` users can insert/update within their tenant.

## 5. Build order (phases, each one shippable)

**Phase 0 — Repo and rule book (week 1)**
Create the repo, `CLAUDE.md` containing the SPEC principles, the pillar definitions, the scoring rules, the 90% rule, the gates, and the rollout sequence. This file is what makes every Claude Code session "already know SPEC". Export the First Meeting questions and the cost/revenue checklist from the workbook into `seed/diagnostic.json`; export the role criteria templates into `seed/criteria_templates.json` (generic wording, no JBI specifics).

**Phase 1 — Scoring engine + single-tenant scorecards (weeks 2–3)**
Schema, migrations, seed. Pages: org chart, role scorecard (enter Y/N/NA + note), pillar/person/team rollup, executive summary (four pillar tiles + three free-text fields + gates). Success test: re-create the JBI GM/Jordan/Anthony/Jason scorecards in the app and match the workbook numbers.

**Phase 2 — Self-serve signup + the cascade (weeks 4–5)** — journey built locally 6 Sept 2026; see `docs/SPEC_Deployment_Journey.md`. Remaining: Supabase Auth/Postgres, email invites.
Auth, RLS, `full`/`readonly`. Signup creates the tenant and makes the signer the top role (GM). Claude-guided onboarding then runs the cascade:

1. Business expectations — the First Meeting questions, answered in conversation with Claude, stored in `diagnostics`.
2. GM's roles — Claude proposes the COGS roles (Commercial, Operations, Growth) plus any the business needs; GM confirms. Roles exist before anyone is named.
3. KPIs per role — Claude proposes 2 per pillar from the criteria templates, tuned to the role and sector; GM accepts/edits. This is the negotiation step (e.g. GP target).
4. Assign people — GM invites a person into each role by email. Invite sets `full` or `readonly` from the role's level.
5. Repeat downward — each manager who accepts an invite is walked through steps 2–4 for their own reports. Supervisors define team-leader/staff roles; those are read-only by default.

The org chart, the KPI tree and the access map all come out of the same walk. Target: a fresh business is provisioned and every leader has a scored role within a week of signup, with no consultant involvement.

Guardrail in code: a role can exist with no person; a person cannot exist without a role. Reassigning a person moves them; it never edits the role.

**Phase 3 — Monthly rhythm + Claude reporting (weeks 6–7)**
Period open/lock, SOG meeting log with actions, monthly board output generated by Claude from the period's data (same structure as the August Board Output: pillars vs 90%, gates, plain-terms section, what we need from the owner, data-integrity flags). "Explain this" button on any KPI/plan that answers from SPEC principles in `CLAUDE.md`, not from the consultant.

**Phase 4 — Data feeds (month 3+)**
Read-only pulls: Xero (revenue, GP), Simpro (billable utilisation, job costing), HubSpot (pipeline, activity → power meter), Safety Minder (incidents, training compliance → gates). Start with CSV import for each before building live connectors.

**Phase 5 — Rule book loop + certification (month 4+)**
End-of-engagement export that strips names and financials and writes `pattern → action` rules into `rulebook_rules`; provisioning wizard reads the latest rule set. Certification tracks (Manager Basic/Intermediate/Advanced, Supervisor, Team Leader) as a checklist module tied to incentives.

## 6. Repo layout

```
spec-platform/
  CLAUDE.md                 # SPEC rule book — principles, scoring, gates, rollout sequence, coding conventions
  README.md
  src/db/schema.ts          # Drizzle schema (SQLite dev / Postgres prod)
  seed/
    diagnostic.json         # First Meeting + org diagnostic questions
    criteria_templates.json # generic role criteria per pillar
    rulebook.json           # pattern → action rules
  src/app/
    (auth)/                 # login, invite
    [tenant]/dashboard      # exec summary
    [tenant]/org            # org chart
    [tenant]/scorecard/[roleId]
    [tenant]/meetings
    [tenant]/board/[period]
    admin/new-client        # provisioning wizard
  src/lib/scoring.ts        # pure functions: pillarScore, personScore, teamScore, specStatus, gates
  src/lib/claude.ts         # board output + explain prompts
  tests/scoring.test.ts     # must reproduce workbook numbers
```

## 7. How to run the build in Claude Code (practical)

1. Install Claude Code, `git init spec-platform`, write `CLAUDE.md` first (paste the rule book — this is the single most valuable hour of the project).
2. First prompt: *"Read CLAUDE.md. Scaffold a Next.js + TypeScript + Supabase app matching the repo layout in the build plan. Create the Prisma schema for the data model in section 4. Write `src/lib/scoring.ts` as pure functions with unit tests that reproduce these expected numbers: [paste Rob/Janice rows and scores from the Master Scorecard]."*
3. Work one page per session. Each session: state the page, the data it reads/writes, the access rule, and "match the workbook". Commit at the end of every session.
4. Keep a `DECISIONS.md` — every time you tell Claude Code "no, do it this way", record it. That file plus `CLAUDE.md` is the product's institutional memory.
5. Test with a fake tenant ("Acme Electrical") in dev; JBI data only in a separate production tenant.
6. Deploy to Vercel on day one so there is always a live URL the reference client can see progress on weekly.

## 8. First-week checklist

- [ ] GitHub repo created, Claude Code installed on the PC
- [ ] `CLAUDE.md` written from the workbook (principles, pillars, scoring, 90% rule, gates, rollout sequence, access tiers)
- [ ] `seed/diagnostic.json` and `seed/criteria_templates.json` exported (generic wording)
- [ ] Scoring functions + tests passing against Master Scorecard numbers
- [ ] Supabase project created, schema migrated
- [ ] Vercel deploy of the empty shell
