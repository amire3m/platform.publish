-- Multipart failover: big files split into parts, tracked as a bundle manifest.
ALTER TABLE content_part_assets ADD COLUMN IF NOT EXISTS bundle_id text;
ALTER TABLE content_part_assets ADD COLUMN IF NOT EXISTS part_index integer;
ALTER TABLE content_part_assets ADD COLUMN IF NOT EXISTS part_total integer;
ALTER TABLE content_part_assets ADD COLUMN IF NOT EXISTS file_hash text;
CREATE INDEX IF NOT EXISTS content_part_assets_bundle_idx ON content_part_assets (bundle_id);
-- Bundled video parts share the video kind (single-column slots point at bundle:<id>)
ALTER TABLE content_part_assets DROP CONSTRAINT IF EXISTS content_part_assets_kind_check;
ALTER TABLE content_part_assets ADD CONSTRAINT content_part_assets_kind_check CHECK (kind IN ('highlight','reel','clean','cover','final','report','video'));
