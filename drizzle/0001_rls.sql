-- Row-level security policies, by tenant_id.
--
-- Why raw SQL instead of drizzle-kit push: this project pushes schema changes with
-- `drizzle-kit push` (no migration-file history), which is fine for tables/columns but not
-- something we want deciding security-critical policies implicitly. Policies are applied once,
-- by hand, via the Supabase SQL editor (or `psql "$DATABASE_URL" -f drizzle/0001_rls.sql`).
-- Re-running is safe — every statement below is idempotent (DROP POLICY IF EXISTS first).
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

create or replace function auth_tenant_id() returns text
language sql stable security definer set search_path = public as $$
  select tenant_id from users where auth_user_id = auth.uid() limit 1;
$$;

-- Tables with their own tenant_id column: straightforward tenant_id = auth_tenant_id().
do $$
declare
  t text;
begin
  foreach t in array array['tenants', 'users', 'claude_registrations', 'journey_steps', 'roles', 'assessment_periods', 'diagnostics', 'meetings']
  loop
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

-- rulebook_rules has no tenant_id and RLS is not enabled on it (see schema.ts) — it's global,
-- anonymised cross-client learnings, readable by everyone. Nothing to do here.
