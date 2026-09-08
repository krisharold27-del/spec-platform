-- The staff directory: names before they are accounts.
-- Drafting the business must cost nothing and send nothing, so a name can sit in a role with no
-- user row behind it. The user row (and the seat, and the invite email) is created only when the
-- leader chooses to invite that person.
CREATE TABLE IF NOT EXISTS staff (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  user_id text REFERENCES users(id),
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS staff_tenant ON staff (tenant_id);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- An assignment can now exist before the person has an account.
ALTER TABLE role_assignments ADD COLUMN IF NOT EXISTS staff_id text REFERENCES staff(id);
ALTER TABLE role_assignments ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ra_staff ON role_assignments (staff_id);

-- Backfill: every existing assignment already has a real user, so give each one a directory entry
-- so the new screen shows the people who are already in the business.
INSERT INTO staff (id, tenant_id, name, user_id, created_at)
SELECT gen_random_uuid()::text, u.tenant_id, u.name, u.id, now()::text
FROM users u
WHERE EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.user_id = u.id);

UPDATE role_assignments ra
SET staff_id = s.id
FROM staff s
WHERE ra.user_id = s.user_id AND ra.staff_id IS NULL;
