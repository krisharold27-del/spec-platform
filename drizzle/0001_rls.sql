-- Row-level security policies, by tenant_id.
--
-- HOW THIS IS APPLIED: automatically, by scripts/deploy-migrate.ts, on every deploy.
--
-- It used to say "applied once, by hand, via the Supabase SQL editor". Nobody ever did — for
-- months — and it was found out only when a check was finally written that tried to run the file,
-- at which point it turned out to abort partway through on a table that does not exist, silently
-- skipping every policy below that line. **A safeguard that depends on somebody remembering a
-- manual step is a safeguard you do not have.** So the deploy does it, CI proves the deploy does
-- it, and this comment no longer sends anybody to a SQL editor.
--
-- Re-running is safe — every statement below is idempotent (DROP POLICY IF EXISTS first) — and CI
-- proves that too, by running the whole file twice.
--
-- Why raw SQL instead of drizzle-kit push: this project pushes schema changes additively (see
-- scripts/deploy-migrate.ts), which is right for tables and columns but not something that should
-- be deciding security-critical policies implicitly. They are written out, in full, here.
--
-- What this actually protects: the app itself (src/db, src/lib/queries.ts, src/lib/provision.ts)
-- already scopes every query by tenantId in application code, and connects with a role that owns
-- the tables (DATABASE_URL — the Postgres user from A4.4), which Postgres lets bypass RLS. These
-- policies are defence in depth for any OTHER path into the same database: Supabase's PostgREST
-- API, the Supabase Studio table editor, or a future service that connects as `anon`/`authenticated`
-- rather than the owning role. schema.ts's `.enableRLS()` only turns RLS on per table; it does not
-- define what's allowed, hence this file.
--
-- Identity: a signed-in request carries a Supabase Auth user (auth.uid()). auth_tenant_id() below
-- resolves that to our own users.tenant_id by way of users.auth_user_id, which src/lib/auth.ts
-- backfills the first time someone actually signs in via their magic link. Until that backfill has
-- happened for a user, auth_tenant_id() returns null and every policy below denies them — which is
-- the safe default (no accidental cross-tenant read) rather than a bug to work around.
--
-- auth.uid() returns uuid; users.auth_user_id is text (it stores Supabase's auth user id as a
-- string), so the comparison needs an explicit ::text cast or Postgres raises
-- "operator does not exist: text = uuid".

create or replace function auth_tenant_id() returns text
language sql stable security definer set search_path = public as $$
  select tenant_id from users where auth_user_id = auth.uid()::text limit 1;
$$;

-- Tables with their own tenant_id column: straightforward tenant_id = auth_tenant_id().
do $$
declare
  t text;
begin
  foreach t in array array['tenants', 'users', 'claude_registrations', 'journey_steps', 'roles', 'assessment_periods', 'diagnostics', 'meetings']
  loop
    -- Skip a table this database does not have.
    --
    -- Not defensiveness: 'claude_registrations' is in this list and is NOT in schema.ts. Without
    -- this guard the whole file aborted on that line, and every policy BELOW it -- role_assignments,
    -- criteria, assessments, gates, board_outputs -- was silently never created. The file claimed
    -- to be idempotent and re-runnable, and it was neither, because nothing ever ran it: it needs
    -- Supabase's auth.uid() and therefore cannot be applied by our own local Postgres.
    continue when to_regclass(t) is null;
    execute format('drop policy if exists tenant_isolation on %I', t);
    if t = 'tenants' then
      -- tenants.id IS the tenant id (no separate tenant_id column on this one table).
      execute format('create policy tenant_isolation on %I for all using (id = auth_tenant_id()) with check (id = auth_tenant_id())', t);
    else
      execute format('create policy tenant_isolation on %I for all using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id())', t);
    end if;
  end loop;
end $$;

-- role_assignments and criteria hang off roles, not tenants directly.
drop policy if exists tenant_isolation on role_assignments;
create policy tenant_isolation on role_assignments for all
  using (exists (select 1 from roles where roles.id = role_assignments.role_id and roles.tenant_id = auth_tenant_id()))
  with check (exists (select 1 from roles where roles.id = role_assignments.role_id and roles.tenant_id = auth_tenant_id()));

drop policy if exists tenant_isolation on criteria;
create policy tenant_isolation on criteria for all
  using (exists (select 1 from roles where roles.id = criteria.role_id and roles.tenant_id = auth_tenant_id()))
  with check (exists (select 1 from roles where roles.id = criteria.role_id and roles.tenant_id = auth_tenant_id()));

-- assessments, gates and board_outputs hang off assessment_periods.
drop policy if exists tenant_isolation on assessments;
create policy tenant_isolation on assessments for all
  using (exists (select 1 from assessment_periods p where p.id = assessments.period_id and p.tenant_id = auth_tenant_id()))
  with check (exists (select 1 from assessment_periods p where p.id = assessments.period_id and p.tenant_id = auth_tenant_id()));

drop policy if exists tenant_isolation on gates;
create policy tenant_isolation on gates for all
  using (exists (select 1 from assessment_periods p where p.id = gates.period_id and p.tenant_id = auth_tenant_id()))
  with check (exists (select 1 from assessment_periods p where p.id = gates.period_id and p.tenant_id = auth_tenant_id()));

drop policy if exists tenant_isolation on board_outputs;
create policy tenant_isolation on board_outputs for all
  using (exists (select 1 from assessment_periods p where p.id = board_outputs.period_id and p.tenant_id = auth_tenant_id()))
  with check (exists (select 1 from assessment_periods p where p.id = board_outputs.period_id and p.tenant_id = auth_tenant_id()));

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- rulebook_rules: readable by everyone, writable by nobody.
--
-- Added 15 September 2026, after Supabase sent a CRITICAL alert: `rls_disabled_in_public` —
-- "anyone with your project URL can read, edit, and delete all data in this table".
--
-- This file used to say "it's global, anonymised cross-client learnings, readable by everyone.
-- Nothing to do here." The first half was right and the conclusion was wrong. No tenant_id means no
-- TENANT policy is needed; it does not mean no RLS. With RLS off in the public schema PostgREST
-- hands the table to the anonymous role for select, insert, update AND delete, so "readable by
-- everyone" quietly also meant "deletable by everyone".
--
-- The fix keeps the intent exactly: RLS on, a SELECT policy for all, and NO write policy. Everyone
-- can read the method; only the role that owns the table can change it, which is how SPEC writes it.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('rulebook_rules') is not null then
    execute 'alter table rulebook_rules enable row level security';
  end if;
end $$;

drop policy if exists rulebook_readable on rulebook_rules;
create policy rulebook_readable on rulebook_rules for select using (true);

-- Deliberately no insert, update or delete policy. RLS denies what no policy allows, so the absence
-- IS the protection — do not add one without deciding who should be able to rewrite the method.

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- The remaining ten, added 12 September 2026.
--
-- Every table above had a policy; these ten had RLS enabled and no policy at all. That combination
-- is fail-CLOSED in Postgres — a non-owner role sees nothing — so this was never an open door. It
-- was worse in a quieter way: the tables looked protected in schema.ts, and the protection was
-- "deny everything", which is indistinguishable from "correctly scoped" until the day somebody
-- connects as `authenticated` and cannot understand why half the product is empty.
--
-- Named one at a time rather than looped, because each one's route to a tenant is a decision.
-- ───────────────────────────────────────────────────────────────────────────────────────────────

-- Their own tenant_id: the straightforward case.
do $$
declare
  t text;
begin
  foreach t in array array[
    'approvals', 'business_goals', 'candidates', 'cascade_kpis', 'directors', 'leave_entries',
    'intake_entries', 'obligations', 'predicted_roles', 'register_entries', 'role_automation',
    'role_tasks', 'scorecard_comments', 'staff', 'system_connections', 'training_modules',
    'training_records',
    -- The sealed credential behind a connection. It carries its own tenant_id precisely so it can be
    -- isolated here rather than through a join: this is the one table in SPEC whose rows are sixty
    -- days of read access to somebody's accounts, and a policy that depends on a join is a policy
    -- with one more way to be wrong. Added with the table on 18 September; CI caught that it had
    -- RLS enabled and no policy, which is a table that is either closed to everybody or open to
    -- everybody depending on who is asking, and neither is a thing to find out later.
    'connection_credentials',
    -- Boards, and the two tables that hang off them. All three carry their own tenant_id — a
    -- comment and a viewer are scoped by the business, not only by the board, so that a board id
    -- guessed from a shared link still reaches nothing.
    'boards', 'board_comments', 'board_viewers',
    -- Rights over a branch somebody does not sit above, granted by an administrator. It carries its
    -- own tenant_id rather than reaching the business through the role it points at, for the same
    -- reason connection_credentials does: this table decides who can see whose scorecards, and a
    -- policy that depends on a join is a policy with one more way to be wrong.
    'role_grants',
    -- Safety, added 23 September. Each carries its own tenant_id: an injury, a claim and an
    -- anonymous wellbeing report are the last rows in SPEC that should ever depend on a join to
    -- stay inside their own business.
    'safety_reports', 'safety_actions', 'safety_checks', 'safety_claims'
  ]
  loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I for all using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id())', t);
  end loop;
end $$;

-- The safety tables are created by the additive deploy (lib/schema-sql), which writes tables and
-- columns and nothing else — so it never runs the `enable row level security` that schema.ts's
-- `.enableRLS()` implies. A policy on a table with RLS off is a policy nothing consults. Turned on
-- here, explicitly, so these four never depend on how their table happened to be created. Harmless
-- to the app, which connects as the owning role; decisive for every other way in.
do $$
declare
  t text;
begin
  foreach t in array array['safety_reports', 'safety_actions', 'safety_checks', 'safety_claims']
  loop
    continue when to_regclass(t) is null;
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- role_curriculum hangs off roles, the same as criteria and role_assignments above. It is the only
-- one of the ten with no tenant_id of its own, so it is the only one that cannot be looped.
drop policy if exists tenant_isolation on role_curriculum;
create policy tenant_isolation on role_curriculum for all
  using (exists (select 1 from roles where roles.id = role_curriculum.role_id and roles.tenant_id = auth_tenant_id()))
  with check (exists (select 1 from roles where roles.id = role_curriculum.role_id and roles.tenant_id = auth_tenant_id()));

-- training_modules carries a NOT NULL tenant_id: every business owns its own curriculum rather than
-- sharing a library SPEC ships. So it is scoped like any other table, not treated as global.

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- health_pings: locked to everybody.
--
-- Uptime readings — a timestamp, a yes-or-no and a duration. No tenant_id, so a tenant policy would
-- be meaningless; and unlike rulebook_rules there is nobody it should be readable BY. SPEC writes
-- it as the role that owns the table, which Postgres lets bypass RLS, and only /cockpit reads it.
--
-- RLS on with NO policy denies everyone else by default, which keeps it invisible through
-- PostgREST, the Supabase table editor, and anything that ever connects as `anon` — without
-- anybody having to remember to write a rule for it.
do $$
begin
  if to_regclass('health_pings') is not null then
    execute 'alter table health_pings enable row level security';
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- Jobs (23 September): the pipeline, quotes and their lines, the catalogue, labour rates, kits, the
-- schedule and timesheets. Every one carries its own tenant_id, so every one is looped the same way
-- as the straightforward tables above — no policy here depends on a join. Kept as its own block so
-- it reads, and merges, as one piece.
do $$
declare
  t text;
begin
  foreach t in array array[
    'jobs', 'quotes', 'quote_lines', 'catalogue_items', 'labour_rates', 'kits',
    'schedule_bookings', 'timesheet_entries'
  ]
  loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I for all using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id())', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- CRM (23 September): stages, organisations, people, deals, activities and each deal's history.
-- Every one carries its own tenant_id, so every one is looped the same way as the Jobs block above —
-- no policy here depends on a join. Kept as its own block so it reads, and merges, as one piece.
do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_stages', 'crm_organisations', 'crm_people', 'crm_deals', 'crm_activities', 'crm_deal_events'
  ]
  loop
    continue when to_regclass(t) is null;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I for all using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id())', t);
  end loop;
end $$;
