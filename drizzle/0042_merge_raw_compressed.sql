-- raw_compressed was the same step as raw_telegram (HandBrake-compressed raw).
-- Fold its ticks into raw_telegram, then drop the key.
ALTER TABLE content_part_activities DROP CONSTRAINT IF EXISTS content_part_activities_activity_check;
UPDATE content_part_activities AS target
SET is_done = true,
    completed_at = COALESCE(target.completed_at, src.completed_at, now()),
    completed_by = COALESCE(target.completed_by, src.completed_by)
FROM content_part_activities AS src
WHERE target.part_id = src.part_id
  AND target.activity = 'raw_telegram'
  AND target.is_done = false
  AND src.activity = 'raw_compressed'
  AND src.is_done = true;
DELETE FROM content_part_activities WHERE activity = 'raw_compressed';
ALTER TABLE content_part_activities ADD CONSTRAINT content_part_activities_activity_check CHECK (activity IN ('raw_telegram','yt_check_upload','copyright_report','music_replaced','final_full','cover_ready','highlight_done','reel_done','previously_published'));
