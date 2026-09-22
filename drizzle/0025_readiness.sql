ALTER TABLE content ADD COLUMN IF NOT EXISTS generation_stage jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE content ADD COLUMN IF NOT EXISTS readiness_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE content ADD COLUMN IF NOT EXISTS readiness_checked_at timestamp with time zone;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS readiness_last_run_at timestamp with time zone;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS readiness_last_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS readiness_last_result jsonb NOT NULL DEFAULT '{}'::jsonb;
