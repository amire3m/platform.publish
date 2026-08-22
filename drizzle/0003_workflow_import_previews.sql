BEGIN;

CREATE TABLE "workflow_import_previews" (
  "id" text PRIMARY KEY,
  "actor_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "csv_snapshot" text NOT NULL,
  "csv_hash" text NOT NULL,
  "mapping" jsonb NOT NULL,
  "decisions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone
);

CREATE INDEX "workflow_import_preview_expiry_idx" ON "workflow_import_previews" ("expires_at");

COMMIT;
