BEGIN;

ALTER TABLE "content_products" ADD COLUMN "archived_at" timestamp with time zone;
CREATE INDEX "content_product_archived_idx" ON "content_products" ("archived_at");

COMMIT;
