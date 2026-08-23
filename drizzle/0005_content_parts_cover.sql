BEGIN;

ALTER TABLE "content_parts" ADD COLUMN "cover_file_ref" text;
ALTER TABLE "content_parts" ADD COLUMN "version" integer NOT NULL DEFAULT 1;

COMMIT;
