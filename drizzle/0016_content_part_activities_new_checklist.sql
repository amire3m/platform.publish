-- Allow the two checklist activities added in code (raw_done, editing_full_done)
-- which migration 0010's CHECK constraint rejected, breaking all product creation.
ALTER TABLE content_part_activities DROP CONSTRAINT IF EXISTS content_part_activities_activity_check;
ALTER TABLE content_part_activities ADD CONSTRAINT content_part_activities_activity_check CHECK (activity IN ('raw_done','editing_full_done','editing_youtube','copyright_fix','highlight_done','reel_done','cover_ready','previously_published'));
-- Backfill the two new activities for pre-existing parts (idempotent)
INSERT INTO content_part_activities (id, part_id, activity, is_done)
SELECT 'CPA-' || substr(md5(id || activity),1,12), id, activity, false
FROM content_parts CROSS JOIN (VALUES ('raw_done'),('editing_full_done')) AS t(activity)
ON CONFLICT DO NOTHING;
