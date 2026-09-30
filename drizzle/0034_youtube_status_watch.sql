CREATE TABLE IF NOT EXISTS "youtube_status_snapshots" (
  "publication_id" text PRIMARY KEY REFERENCES "workflow_publications"("id") ON DELETE CASCADE,
  "account_id" text NOT NULL,
  "external_id" text NOT NULL,
  "upload_status" text,
  "rejection_reason" text,
  "privacy_status" text,
  "checked_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "youtube_status_account_idx" ON "youtube_status_snapshots" ("account_id");
