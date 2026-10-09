-- Full-editor pipeline checklist: raw_telegram, raw_compressed, yt_check_upload,
-- copyright_report, music_replaced, final_full (+ unchanged cover/highlight/reel).
-- Backfills new ticks from legacy ones (OR + audit carry-over), then drops legacy rows.
-- 0) Drop the old CHECK first (it rejects the new keys on insert)
ALTER TABLE content_part_activities DROP CONSTRAINT IF EXISTS content_part_activities_activity_check;
-- 1) New rows for pre-existing parts (idempotent)
INSERT INTO content_part_activities (id, part_id, activity, is_done)
SELECT 'CPA-' || substr(md5(id || activity), 1, 12), id, activity, false
FROM content_parts CROSS JOIN (VALUES ('raw_telegram'),('raw_compressed'),('yt_check_upload'),('copyright_report'),('music_replaced'),('final_full')) AS t(activity)
ON CONFLICT DO NOTHING;
-- 2a) raw_done -> raw_telegram + raw_compressed
UPDATE content_part_activities AS target
SET is_done = true,
    completed_at = COALESCE(target.completed_at, src.completed_at, now()),
    completed_by = COALESCE(target.completed_by, src.completed_by)
FROM content_part_activities AS src
WHERE target.part_id = src.part_id
  AND target.activity IN ('raw_telegram','raw_compressed')
  AND target.is_done = false
  AND src.activity = 'raw_done'
  AND src.is_done = true;
-- 2b) copyright_fix -> yt_check_upload + copyright_report + music_replaced
UPDATE content_part_activities AS target
SET is_done = true,
    completed_at = COALESCE(target.completed_at, src.completed_at, now()),
    completed_by = COALESCE(target.completed_by, src.completed_by)
FROM content_part_activities AS src
WHERE target.part_id = src.part_id
  AND target.activity IN ('yt_check_upload','copyright_report','music_replaced')
  AND target.is_done = false
  AND src.activity = 'copyright_fix'
  AND src.is_done = true;
-- 2c) editing_full_done -> final_full
UPDATE content_part_activities AS target
SET is_done = true,
    completed_at = COALESCE(target.completed_at, src.completed_at, now()),
    completed_by = COALESCE(target.completed_by, src.completed_by)
FROM content_part_activities AS src
WHERE target.part_id = src.part_id
  AND target.activity = 'final_full'
  AND target.is_done = false
  AND src.activity = 'editing_full_done'
  AND src.is_done = true;
-- 3) Drop legacy rows (must precede the tightened CHECK)
DELETE FROM content_part_activities WHERE activity IN ('raw_done','editing_full_done','editing_youtube');
-- 4) Add the tightened CHECK to the pipeline list (old rows already deleted above)
ALTER TABLE content_part_activities ADD CONSTRAINT content_part_activities_activity_check CHECK (activity IN ('raw_telegram','raw_compressed','yt_check_upload','copyright_report','music_replaced','final_full','cover_ready','highlight_done','reel_done','previously_published'));
-- 5) Optional per-part YouTube check-upload URL (unlisted check video)
ALTER TABLE content_parts ADD COLUMN IF NOT EXISTS yt_check_url text;
