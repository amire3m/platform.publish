CREATE TABLE IF NOT EXISTS content_part_assets (
  id text PRIMARY KEY,
  part_id text NOT NULL REFERENCES content_parts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('highlight','reel')),
  file_ref text NOT NULL,
  file_name text,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_part_assets_part_idx ON content_part_assets(part_id);
CREATE INDEX IF NOT EXISTS content_part_assets_kind_idx ON content_part_assets(kind);
-- migrate existing single highlight/reel refs into assets table
INSERT INTO content_part_assets (id, part_id, kind, file_ref, file_name)
SELECT 'CPA-' || substr(md5(random()::text),1,12), id, 'highlight', highlight_file_ref, 'highlight' FROM content_parts WHERE highlight_file_ref IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO content_part_assets (id, part_id, kind, file_ref, file_name)
SELECT 'CPA-' || substr(md5(random()::text),1,12), id, 'reel', reel_file_ref, 'reel' FROM content_parts WHERE reel_file_ref IS NOT NULL ON CONFLICT DO NOTHING;
