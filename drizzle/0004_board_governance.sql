-- Board cadence and governance. The board is the fourth audience on the same data, and governance
-- (is the board actually sitting, and who are the directors) belongs inside Compliance.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS board_cadence text NOT NULL DEFAULT 'monthly';

CREATE TABLE IF NOT EXISTS directors (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  title text,
  appointed_at text,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS directors_tenant ON directors (tenant_id);
ALTER TABLE directors ENABLE ROW LEVEL SECURITY;
