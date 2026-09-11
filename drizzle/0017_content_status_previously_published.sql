-- Allow the derived 'previously_published' status (written by
-- deriveProductStatusFromParts on toggle) which older CHECK constraints
-- rejected, breaking the toggle with a 500 on real databases.
ALTER TABLE content_products DROP CONSTRAINT IF EXISTS content_products_status_check;
ALTER TABLE content_products ADD CONSTRAINT content_products_status_check CHECK (status IN ('imported','editing_youtube','copyright_fix','highlight_done','reel_done','cover_ready','ready_to_send','previously_published'));
ALTER TABLE content_parts DROP CONSTRAINT IF EXISTS content_parts_status_check;
ALTER TABLE content_parts ADD CONSTRAINT content_parts_status_check CHECK (status IS NULL OR status IN ('imported','editing_youtube','copyright_fix','highlight_done','reel_done','cover_ready','ready_to_send','previously_published'));
