-- Live scorecard: a KPI now carries the number, where the number came from, and a status label
-- richer than a tick. `answer` is left in place as the scoring value so existing rows keep working
-- and the scoring engine is untouched.
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "result" text;
ALTER TABLE "assessments" ADD COLUMN IF NOT EXISTS "source" text;

-- Backfill a status for anything scored before these columns existed, so nothing displays blank.
UPDATE "assessments" SET "status" = CASE
  WHEN "answer" = 'Y'  THEN 'met'
  WHEN "answer" = 'N'  THEN 'not_met'
  WHEN "answer" = 'NA' THEN 'pending'
  ELSE NULL
END WHERE "status" IS NULL;
