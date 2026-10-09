-- Optional per-tick work report (گزارش کار) on each activity check
ALTER TABLE content_part_activities ADD COLUMN IF NOT EXISTS note text;
