ALTER TABLE content_products DROP CONSTRAINT IF EXISTS content_products_product_type_check;
ALTER TABLE content_products ADD CONSTRAINT content_products_product_type_check CHECK (product_type IN ('serial','documentary','tv_program','film','short_film','educational','teaser','music_video'));
ALTER TABLE content_parts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS content_part_activities (
  id text PRIMARY KEY,
  part_id text NOT NULL REFERENCES content_parts(id) ON DELETE CASCADE,
  activity text NOT NULL CHECK (activity IN ('editing_youtube','copyright_fix','highlight_done','reel_done','cover_ready','previously_published')),
  is_done boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  completed_by text,
  UNIQUE(part_id, activity)
);
-- Backfill one row per activity per existing part
INSERT INTO content_part_activities (id, part_id, activity, is_done)
SELECT 'CPA-' || substr(md5(random()::text),1,8) || '-' || activity, id, activity, false
FROM content_parts CROSS JOIN (VALUES ('editing_youtube'),('copyright_fix'),('highlight_done'),('reel_done'),('cover_ready'),('previously_published')) AS t(activity)
ON CONFLICT DO NOTHING;
