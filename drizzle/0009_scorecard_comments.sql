-- The conversation on a month's card.
--
-- A score without its reasoning is a number somebody has to take on trust. Comments travel with the
-- month to sign-off and into the board pack, which is why they hang off the period as well as the
-- role: what was said in August belongs to August, and a locked month takes no new comment.
CREATE TABLE IF NOT EXISTS scorecard_comments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  role_id text NOT NULL REFERENCES roles(id),
  period_id text NOT NULL REFERENCES assessment_periods(id),
  author text NOT NULL,
  author_user_id text REFERENCES users(id),
  body text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS scorecard_comments_role_period ON scorecard_comments (role_id, period_id);
ALTER TABLE scorecard_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scorecard_comments_tenant_isolation ON scorecard_comments;
CREATE POLICY scorecard_comments_tenant_isolation ON scorecard_comments
  USING (tenant_id = auth_tenant_id()) WITH CHECK (tenant_id = auth_tenant_id());
