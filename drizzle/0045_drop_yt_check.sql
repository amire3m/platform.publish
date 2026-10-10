-- The YouTube check-upload step is dropped entirely (no tick, no link, no queue).
ALTER TABLE content_part_activities DROP CONSTRAINT IF EXISTS content_part_activities_activity_check;
DELETE FROM content_part_activities WHERE activity = 'yt_check_upload';
ALTER TABLE content_part_activities ADD CONSTRAINT content_part_activities_activity_check CHECK (activity IN ('raw_telegram','copyright_report','music_replaced','final_full','cover_ready','highlight_done','reel_done','previously_published'));
