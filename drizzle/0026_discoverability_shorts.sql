CREATE TABLE IF NOT EXISTS discoverability_runs (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  engine_version text NOT NULL DEFAULT '1.0.0',
  schema_version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'done',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS discoverability_findings (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES discoverability_runs(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  severity text NOT NULL,
  message text NOT NULL,
  dismissed boolean NOT NULL DEFAULT false,
  dismiss_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shorts_drafts (
  id text PRIMARY KEY,
  source_content_id text NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  title text NOT NULL,
  start_sec integer NOT NULL DEFAULT 0,
  duration_sec integer NOT NULL DEFAULT 30,
  layout text NOT NULL DEFAULT 'center-crop',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discoverability_runs_content_idx ON discoverability_runs(content_id);
CREATE INDEX IF NOT EXISTS shorts_drafts_source_idx ON shorts_drafts(source_content_id);
