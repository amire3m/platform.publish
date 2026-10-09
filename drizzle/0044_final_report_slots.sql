-- New per-part file slots: final (clean copyright-free full video) and report (copyright-report screenshots).
ALTER TABLE content_part_assets DROP CONSTRAINT IF EXISTS content_part_assets_kind_check;
ALTER TABLE content_part_assets ADD CONSTRAINT content_part_assets_kind_check CHECK (kind IN ('highlight','reel','clean','cover','final','report'));
