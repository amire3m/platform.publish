UPDATE media_mirrors
SET status = 'queued', remote_task_id = NULL, error = NULL, updated_at = NOW()
WHERE status = 'uploading' AND remote_task_id IS NULL;

ALTER TABLE media_mirrors
  DROP CONSTRAINT IF EXISTS media_mirrors_part_id_fkey;

ALTER TABLE media_mirrors
  DROP CONSTRAINT IF EXISTS media_mirrors_part_id_content_parts_id_fk;

ALTER TABLE media_mirrors
  ADD CONSTRAINT media_mirrors_part_id_content_parts_id_fk
  FOREIGN KEY (part_id) REFERENCES content_parts(id) ON DELETE SET NULL;
