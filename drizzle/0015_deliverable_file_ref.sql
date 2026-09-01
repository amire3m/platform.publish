-- Link deliverables in the publishing room to their actual media files
BEGIN;

ALTER TABLE workflow_deliverables ADD COLUMN IF NOT EXISTS file_ref text;

COMMIT;
