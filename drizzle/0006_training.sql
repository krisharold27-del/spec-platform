-- SPEC's own training: a catalogue, a path per role, and a person's progress through it.
--
-- The split matters. The CATALOGUE and the PATH belong to the business and to the role — role
-- first, person second, so a role may require training with nobody in it, and reassigning somebody
-- never edits the path. PROGRESS belongs to the person, because a person learns a module once.
-- SIGN-OFF belongs to the placement: trained and confirmed capable in THIS role, which correctly
-- does not travel with somebody who moves to a different one.
--
-- Idempotent, like every other file here — safe to re-run.

CREATE TABLE IF NOT EXISTS training_modules (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  title text NOT NULL,
  summary text NOT NULL,
  pillar text NOT NULL,              -- safety | people | earnings | compliance | all
  minutes integer NOT NULL DEFAULT 30,
  core boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS training_modules_tenant ON training_modules (tenant_id);
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS role_curriculum (
  id text PRIMARY KEY,
  role_id text NOT NULL REFERENCES roles(id),
  module_id text NOT NULL REFERENCES training_modules(id),
  due_days integer,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS role_curriculum_unique ON role_curriculum (role_id, module_id);
CREATE INDEX IF NOT EXISTS role_curriculum_role ON role_curriculum (role_id);
ALTER TABLE role_curriculum ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS training_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  module_id text NOT NULL REFERENCES training_modules(id),
  user_id text REFERENCES users(id),
  staff_id text REFERENCES staff(id),
  progress integer NOT NULL DEFAULT 0,
  result_pct integer,                -- null is "no mark", never zero
  started_at text,
  completed_at text
);
CREATE UNIQUE INDEX IF NOT EXISTS training_records_user_module ON training_records (user_id, module_id);
CREATE INDEX IF NOT EXISTS training_records_tenant ON training_records (tenant_id);
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;

-- The path sign-off. On the placement, not the person and not the role.
ALTER TABLE role_assignments ADD COLUMN IF NOT EXISTS trained_at text;
ALTER TABLE role_assignments ADD COLUMN IF NOT EXISTS trained_by text;

-- Policies, in the same shape as drizzle/0001_rls.sql: every row reachable only from inside its own
-- tenant. role_curriculum carries no tenant_id of its own, so it is reached through its role.
DROP POLICY IF EXISTS training_modules_tenant_isolation ON training_modules;
CREATE POLICY training_modules_tenant_isolation ON training_modules
  USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS training_records_tenant_isolation ON training_records;
CREATE POLICY training_records_tenant_isolation ON training_records
  USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS role_curriculum_tenant_isolation ON role_curriculum;
CREATE POLICY role_curriculum_tenant_isolation ON role_curriculum
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.tenant_id = auth_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.tenant_id = auth_tenant_id()));
