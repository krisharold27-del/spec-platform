-- Systems a client already runs. Replaces claude_registrations: Claude is white-labelled and the
-- client must never be asked to register it, so the old table has nothing left to hold.
CREATE TABLE IF NOT EXISTS system_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  category text NOT NULL,
  owner_name text,
  owner_email text,
  owner_is_self boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'requested',
  last_sync_at text,
  last_error_at text,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS system_connections_tenant ON system_connections (tenant_id);

ALTER TABLE system_connections ENABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS claude_registrations;
