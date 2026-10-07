-- Merge the duplicate editing checklists: editing_youtube folds into editing_full_done (OR).
-- New column order: raw_done, copyright_fix, editing_full_done, cover_ready, highlight_done, reel_done.
-- 1) Carry over old editing_youtube ticks
UPDATE content_part_activities AS target
SET is_done = true,
    completed_at = COALESCE(target.completed_at, src.completed_at, now()),
    completed_by = COALESCE(target.completed_by, src.completed_by)
FROM content_part_activities AS src
WHERE target.part_id = src.part_id
  AND target.activity = 'editing_full_done'
  AND target.is_done = false
  AND src.activity = 'editing_youtube'
  AND src.is_done = true;
-- 2) Parts that only had the old editing_youtube row still need an editing_full_done row
INSERT INTO content_part_activities (id, part_id, activity, is_done, completed_at, completed_by)
SELECT 'CPA-' || substr(md5(part_id || 'editing_full_done'), 1, 12), part_id, 'editing_full_done', is_done, completed_at, completed_by
FROM content_part_activities
WHERE activity = 'editing_youtube'
ON CONFLICT (part_id, activity) DO NOTHING;
-- 3) Drop the old rows
DELETE FROM content_part_activities WHERE activity = 'editing_youtube';
-- 4) Tighten the activity CHECK to the merged list
ALTER TABLE content_part_activities DROP CONSTRAINT IF EXISTS content_part_activities_activity_check;
ALTER TABLE content_part_activities ADD CONSTRAINT content_part_activities_activity_check CHECK (activity IN ('raw_done','copyright_fix','editing_full_done','cover_ready','highlight_done','reel_done','previously_published'));
-- 5) Product/part status columns: fold any lingering editing_youtube into imported (conservative: no false "passed" signal)
UPDATE content_products SET status = 'imported' WHERE status = 'editing_youtube';
UPDATE content_parts SET status = 'imported' WHERE status = 'editing_youtube';
-- 6) Tighten status CHECKs (drop editing_youtube)
ALTER TABLE content_products DROP CONSTRAINT IF EXISTS content_products_status_check;
ALTER TABLE content_products ADD CONSTRAINT content_products_status_check CHECK (status IN ('imported','copyright_fix','highlight_done','reel_done','cover_ready','ready_to_send','previously_published'));
ALTER TABLE content_parts DROP CONSTRAINT IF EXISTS content_parts_status_check;
ALTER TABLE content_parts ADD CONSTRAINT content_parts_status_check CHECK (status IS NULL OR status IN ('imported','copyright_fix','highlight_done','reel_done','cover_ready','ready_to_send','previously_published'));
