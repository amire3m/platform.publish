-- Per-output covers: which cover belongs to which full/highlight/reel.
-- content_part_assets gains target_kind (NULL = legacy/unspecified); kind allows 'cover'.
ALTER TABLE content_part_assets ADD COLUMN IF NOT EXISTS target_kind text;
ALTER TABLE content_part_assets DROP CONSTRAINT IF EXISTS content_part_assets_kind_check;
ALTER TABLE content_part_assets DROP CONSTRAINT IF EXISTS content_part_assets_kind_check1;
ALTER TABLE content_part_assets ADD CONSTRAINT content_part_assets_kind_check CHECK (kind IN ('highlight','reel','clean','cover'));
-- Deliverable-level cover override (send page picks per kind; worker prefers it)
ALTER TABLE workflow_deliverables ADD COLUMN IF NOT EXISTS cover_file_ref text;
