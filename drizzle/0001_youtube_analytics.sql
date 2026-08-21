BEGIN;

ALTER TABLE "analytics_snapshots"
  ADD COLUMN "scope_type" text NOT NULL DEFAULT 'account',
  ADD COLUMN "scope_id" text,
  ADD COLUMN "content_title" text,
  ADD COLUMN "thumbnail_url" text,
  ADD COLUMN "published_at" timestamp with time zone,
  ADD COLUMN "subscribers_gained" bigint DEFAULT 0,
  ADD COLUMN "subscribers_lost" bigint DEFAULT 0;

UPDATE "analytics_snapshots"
SET "scope_id" = "account_id";

ALTER TABLE "analytics_snapshots"
  ALTER COLUMN "scope_id" SET NOT NULL,
  ALTER COLUMN "scope_id" SET DEFAULT '';

WITH "ranked_snapshots" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "platform", "account_id", "scope_type", "scope_id", "date_utc"
      ORDER BY "created_at" DESC, "id" DESC
    ) AS "duplicate_rank"
  FROM "analytics_snapshots"
)
DELETE FROM "analytics_snapshots"
WHERE "id" IN (
  SELECT "id"
  FROM "ranked_snapshots"
  WHERE "duplicate_rank" > 1
);

CREATE UNIQUE INDEX "analytics_snapshot_daily_scope_unique"
ON "analytics_snapshots" ("platform", "account_id", "scope_type", "scope_id", "date_utc");

ALTER TABLE "social_accounts"
  ADD COLUMN "analytics_sync_locked_at" timestamp with time zone,
  ADD COLUMN "analytics_sync_lock_id" text,
  ADD COLUMN "analytics_synced_through" timestamp with time zone,
  ADD COLUMN "analytics_last_error_code" text,
  ADD COLUMN "analytics_next_attempt_at" timestamp with time zone;

ALTER TABLE "app_settings"
  ADD COLUMN "last_analytics_run_at" timestamp with time zone;

COMMIT;
