-- Closing the month, and the queue of things waiting on a person.

-- `submitted` sits between open and locked: the month declared finished by the person accountable
-- for it, still correctable before the signature. Locking follows the signature, not a date.
ALTER TABLE assessment_periods ADD COLUMN IF NOT EXISTS submitted_by text;
ALTER TABLE assessment_periods ADD COLUMN IF NOT EXISTS submitted_at text;
ALTER TABLE assessment_periods ADD COLUMN IF NOT EXISTS signed_by text;
ALTER TABLE assessment_periods ADD COLUMN IF NOT EXISTS signed_at text;

-- Only decisions that need a record of their own are stored. A month waiting to be signed is a
-- period with status `submitted`; a path waiting for a manager is a finished path with no signature
-- against it. Deriving what can be derived is what stops the queue drifting out of step.
CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  kind text NOT NULL,                      -- connection | spend | kpi_change | other
  title text NOT NULL,
  detail text NOT NULL,
  blocks text,
  decided_by_level text NOT NULL DEFAULT 'board',
  requested_by text NOT NULL,
  requested_at text NOT NULL,
  state text NOT NULL DEFAULT 'waiting',   -- waiting | approved | declined
  decided_by text,
  decided_at text,
  ref_id text
);
CREATE INDEX IF NOT EXISTS approvals_tenant_state ON approvals (tenant_id, state);
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approvals_tenant_isolation ON approvals;
CREATE POLICY approvals_tenant_isolation ON approvals
  USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
