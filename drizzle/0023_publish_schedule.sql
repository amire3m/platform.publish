ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS publish_daily_cap integer,
  ADD COLUMN IF NOT EXISTS publish_cooldown_min integer,
  ADD COLUMN IF NOT EXISTS publish_window_start text,
  ADD COLUMN IF NOT EXISTS publish_window_end text,
  ADD COLUMN IF NOT EXISTS publish_jitter_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS instant_post boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_published_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS published_day date,
  ADD COLUMN IF NOT EXISTS published_today_count integer NOT NULL DEFAULT 0;
