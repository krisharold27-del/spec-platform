# SPEC Platform

The SPEC Business Solutions operating-system platform: Safety, People, Earnings, Compliance.

Start with `CLAUDE.md` (rule book), then `docs/SPEC_Platform_Build_Plan.md` (phases) and `docs/SPEC_Master_Requirements.md` (full spec).

## Status — Phase 0 complete
- `src/lib/scoring.ts` — scoring engine (pillar / role / team scores, 90% rule, hard gates, weight validation)
- `tests/scoring.test.ts` — reproduces the Master Scorecard numbers; `npm test`
- `seed/diagnostic.json` — Question Zero, organisational diagnostic, Financial Truth Matrix, First Meeting
- `seed/criteria_templates.json` — generic role templates by stream and level
- `seed/rulebook.json` — pattern → action rules from prior engagements

## Status — Phase 1 complete
- `src/db/schema.ts` — Drizzle data model (tenants, users, roles, role_assignments, criteria, periods, assessments, gates, diagnostics, meetings, board_outputs, rulebook_rules)
- `src/lib/provision.ts` — provision a tenant from the seed templates; assign people to roles (roles first, people second)
- `scripts/seed-demo.ts` — demo tenant "Acme Electrical"
- Screens: `/` executive summary (pillar tiles, hard gates, roles table), `/org` org chart, `/team` team rollup, `/scorecard/[roleId]` Y/N/NA entry with notes and the 100%-weight guard

## Status — Phase 2 (journey) working locally
- `/start` — the four questions (front door); answers carry into sign-up and the journey
- `/signup`, `/signin` — dev auth (email only; swap `src/lib/auth.ts` for Supabase Auth in production)
- `/setup/claude` — Claude registration, a hard gate before the journey opens
- `/journey` — the deployment journey with real status computed from data (`src/lib/journey.ts`), Stage 4 milestones, and the Basic → Program upgrade option
- `/setup/expectations`, `/setup/roles`, `/setup/kpis`, `/setup/people` — the Stage 1 steps
- `/me` — invited people land on their own scorecard; `/board/[periodId]` — board output generated on period lock (Claude with `ANTHROPIC_API_KEY`, deterministic otherwise)
- `docs/SPEC_Deployment_Journey.md` — the usability spec the app enforces
- `walk.mjs` — end-to-end browser walk of a new business through the whole journey

## Next
Supabase Auth + Postgres + RLS for production; email invites; markdown rendering for the board output; Claude "why this KPI?" on every criterion; SOG meeting log; power meter.

## Run locally (no accounts needed)
```
npm install
npm run db:push     # creates data/dev.db
npm run db:seed     # demo tenant
npm run dev         # http://localhost:3000
npm test            # scoring engine vs Master Scorecard
```
