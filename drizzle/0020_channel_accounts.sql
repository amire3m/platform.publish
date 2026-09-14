CREATE TABLE IF NOT EXISTS channel_accounts (
  channel_id text PRIMARY KEY,
  youtube_account_id text,
  instagram_account_id text,
  telegram_topic_id text,
  updated_by text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
