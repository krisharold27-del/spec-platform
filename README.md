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

## Run locally

The app runs on Postgres, so local work needs one. **Point `DATABASE_URL` at a Postgres on your own
machine, never at the hosted database** — `db:push` applies schema changes wherever it is aimed.

Put local settings in `.env.local`, which git ignores. It takes precedence over `.env`, so the
hosted connection string stays untouched:

```
# .env.local
DATABASE_URL=postgres://spec:spec@127.0.0.1:5432/spec
APP_URL=http://localhost:3000
```

On Debian or Ubuntu, a local Postgres from nothing:

```
sudo apt-get install -y postgresql
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE ROLE spec LOGIN PASSWORD 'spec' SUPERUSER"
sudo -u postgres createdb -O spec spec
```

Then:

```
npm install
npm run db:push     # apply the schema
npm run db:seed     # demo tenant, "Acme Electrical"
npm run dev         # http://localhost:3000
npm test            # the pure logic in src/lib, 133 tests
```

`npm test` needs no database — everything in `src/lib` that carries a rule is pure and tested
without one. Signing in needs Supabase Auth credentials (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`); without them the schema, the seed and the whole test suite still
run, but the signed-in pages will bounce to `/signin`.

RLS policies are applied by hand rather than by `db:push` — see the header of `drizzle/0001_rls.sql`
for why, and run each `drizzle/*.sql` once against a new database.
