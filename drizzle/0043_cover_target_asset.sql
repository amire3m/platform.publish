-- Instance-level cover linkage: which cover belongs to which exact highlight/reel asset.
ALTER TABLE content_part_assets ADD COLUMN IF NOT EXISTS target_asset_id text REFERENCES content_part_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS content_part_assets_target_asset_idx ON content_part_assets (target_asset_id);
