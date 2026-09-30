CREATE TABLE IF NOT EXISTS "youtube_quota_usage" (
  "account_id" text NOT NULL,
  "day" date NOT NULL,
  "units" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("account_id", "day")
);
