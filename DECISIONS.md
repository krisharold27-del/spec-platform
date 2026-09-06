# Decisions log

Record every correction or choice made while building. Newest at the bottom.

- 2026-09-06 — Company documents are about SPEC Business Solutions, not the founder personally. Personal goals stay out of this repo.
- 2026-09-06 — Role first, person second: criteria hang off roles; `role_assignments` keeps placement history separately.
- 2026-09-06 — Claude is the interface (guided onboarding, explanations, board output), not a bolt-on feature.
- 2026-09-06 — Scores are computed, never stored. Periods are append-only and lockable.
- 2026-09-06 — Source workbook pillar weights do not always sum to 100% (e.g. 85%, 91%). Engine normalises by applicable weight so it reproduces the workbook; the UI must enforce 100% on save.
- 2026-09-06 — Integrations (job system, accounting, CRM, safety) come after manual/CSV entry works. Phase 4.
- 2026-09-06 — Drizzle ORM instead of Prisma: Prisma needs downloaded query engines, which the build environment could not fetch. Drizzle is pure TypeScript, supports SQLite (dev) and Postgres (prod), and is easier for Claude Code to reason about.
- 2026-09-06 — Team averages are computed over scored roles only. An unscored role is missing data, not a zero; the executive summary says how many roles are scored.
- 2026-09-06 — Local dev needs no accounts: `npm run db:push && npm run db:seed && npm run dev` gives a working demo tenant ("Acme Electrical") on SQLite.
- 2026-09-06 — The four questions are the front door (`/start`); the answers are the tenant's first diagnostic and steer which pillars' KPIs are emphasised.
- 2026-09-06 — Claude registration is a hard gate: nothing in the journey opens until the business confirms a Claude workspace with seats for supervisor level and above.
- 2026-09-06 — Journey step status is computed from data, never ticked by hand.
- 2026-09-06 — Two tiers: Basic (self-serve) and Program (consulting arm on site). Sign-up lands on Basic; Program is requested from the journey page.
- 2026-09-06 — Board output is generated on period lock from the data; Claude rewrites it in plain terms when an API key is present, otherwise the deterministic version stands. Never presents an empty template as a result.
