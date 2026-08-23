BEGIN;

CREATE TABLE "content_products" (
  "id" text PRIMARY KEY,
  "title" varchar(200) NOT NULL,
  "product_type" text NOT NULL CHECK ("product_type" IN ('serial', 'documentary', 'tv_program', 'film', 'short_film', 'educational')),
  "channel" text NOT NULL CHECK ("channel" IN ('zed_revayat', 'zaviye_no', 'tamashin', 'iranian_frame', 'shock', 'tinazh')),
  "parts_count" integer NOT NULL CHECK ("parts_count" > 0),
  "status" text NOT NULL DEFAULT 'imported' CHECK ("status" IN ('imported', 'editing_youtube', 'copyright_fix', 'highlight_done', 'reel_done', 'cover_ready', 'ready_to_send')),
  "version" integer NOT NULL DEFAULT 1,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "due_at" timestamp with time zone,
  "notes" text
);

CREATE INDEX "content_product_type_idx" ON "content_products" ("product_type");
CREATE INDEX "content_product_channel_idx" ON "content_products" ("channel");
CREATE INDEX "content_product_status_idx" ON "content_products" ("status");

CREATE TABLE "content_parts" (
  "id" text PRIMARY KEY,
  "product_id" text NOT NULL REFERENCES "content_products"("id") ON DELETE CASCADE,
  "part_number" integer NOT NULL CHECK ("part_number" > 0),
  "file_ref" text,
  "status" text CHECK ("status" IS NULL OR "status" IN ('imported', 'editing_youtube', 'copyright_fix', 'highlight_done', 'reel_done', 'cover_ready', 'ready_to_send')),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "content_part_product_idx" ON "content_parts" ("product_id");
CREATE UNIQUE INDEX "content_part_product_part_unique" ON "content_parts" ("product_id", "part_number");

COMMIT;
