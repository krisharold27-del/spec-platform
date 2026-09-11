-- The tier: one question to the leader — "do you want the power of AI?"
--
--   basic    — no connectors, no assistant. Every number typed in and confirmed by a named person.
--   advanced — systems feed the KPIs, every figure traces to where it came from, and Claude is on
--              every page.
--
-- Defaults to basic because manual is a complete and permanent way to run SPEC, not a lesser one:
-- nothing should switch itself on for a business that has not asked for it.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'basic';
