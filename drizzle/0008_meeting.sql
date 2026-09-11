-- The weekly senior meeting keeps more than minutes.
--
-- Attendance, because a senior meeting the senior group did not attend is a note rather than a
-- meeting. Decisions separately from the minutes, because a decision outlives the week it was made
-- in — "decisions nobody remembers" is one of the three failures the rhythm exists to fix.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendees text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS decisions text;
