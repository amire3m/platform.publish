-- Allow the 'raw_video' product type added in code; without it every
-- raw-video product creation fails on real databases with a 500.
ALTER TABLE content_products DROP CONSTRAINT IF EXISTS content_products_product_type_check;
ALTER TABLE content_products ADD CONSTRAINT content_products_product_type_check CHECK (product_type IN ('serial','documentary','tv_program','film','short_film','educational','teaser','music_video','raw_video'));
