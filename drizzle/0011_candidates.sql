-- Somebody being considered for a role.
--
-- Rated against the same four pillars the role is scored on: the alternative is a gut feel nobody
-- can defend three months later, and hiring against the pillars is what makes the scorecard mean
-- something on day one rather than at the first review.
--
-- Deliberately thin. SPEC is not an applicant tracking system.
CREATE TABLE IF NOT EXISTS candidates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  role_id text NOT NULL REFERENCES roles(id),
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'applied',   -- applied | screening | interview | offer | placed | declined
  ratings text,                            -- JSON {safety,people,earnings,compliance} 1-5, null until rated
  checks text,
  note text,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS candidates_tenant_role ON candidates (tenant_id, role_id);
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS candidates_tenant_isolation ON candidates;
CREATE POLICY candidates_tenant_isolation ON candidates
  USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
