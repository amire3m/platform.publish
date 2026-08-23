BEGIN;

ALTER TABLE "users" ADD COLUMN "allowed_channels" jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
