CREATE TABLE IF NOT EXISTS engagement_comments (
  id text PRIMARY KEY,
  video_id text NOT NULL,
  comment_id text NOT NULL UNIQUE,
  author text,
  text text NOT NULL,
  sentiment text NOT NULL DEFAULT 'neutral',
  theme text,
  is_spam boolean NOT NULL DEFAULT false,
  is_question boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS engagement_drafts (
  id text PRIMARY KEY,
  comment_id text NOT NULL REFERENCES engagement_comments(comment_id) ON DELETE CASCADE,
  draft_text text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audience_ideas (
  id text PRIMARY KEY,
  title text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retention_snapshots (
  id text PRIMARY KEY,
  video_id text NOT NULL,
  kind text NOT NULL DEFAULT 'long',
  curve jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS engagement_comments_video_idx ON engagement_comments(video_id);
CREATE INDEX IF NOT EXISTS retention_snapshots_video_idx ON retention_snapshots(video_id);
