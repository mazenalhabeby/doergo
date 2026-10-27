-- Additive: the part of a time-outside-the-shift decision counted BEFORE the planned start (the part after the end
-- is an approved overtime round already), so an office rule on overtime counts both.
ALTER TABLE "time_entries" ADD COLUMN "outsideBeforeMinutes" INTEGER;
