-- Live conductor: channel profiles, daily schedules, session history
BEGIN;

CREATE TABLE IF NOT EXISTS live_channels (
  id text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'youtube',
  rtmp_url text NOT NULL,
  stream_key_encrypted text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_schedules (
  id text PRIMARY KEY,
  name text NOT NULL,
  channel_ref text NOT NULL,
  playlist_input text NOT NULL,
  quality text NOT NULL DEFAULT '720',
  loop boolean NOT NULL DEFAULT true,
  overlay_enabled boolean NOT NULL DEFAULT false,
  start_tehran text NOT NULL,
  end_tehran text,
  days_of_week jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_started_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id text PRIMARY KEY,
  schedule_ref text,
  channel_ref text,
  playlist_input text NOT NULL DEFAULT '',
  quality text NOT NULL DEFAULT '720',
  loop boolean NOT NULL DEFAULT true,
  overlay_enabled boolean NOT NULL DEFAULT false,
  trigger text NOT NULL DEFAULT 'manual',
  state text NOT NULL DEFAULT 'live',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  error text,
  stats jsonb NOT NULL DEFAULT '{"itemsPlayed":0,"itemsFailed":0,"secondsStreamed":0}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_sessions_started_idx ON live_sessions(started_at);
CREATE INDEX IF NOT EXISTS live_sessions_state_idx ON live_sessions(state);

CREATE TABLE IF NOT EXISTS live_session_items (
  id text PRIMARY KEY,
  session_ref text NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  position integer NOT NULL,
  video_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  duration_sec integer,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamp with time zone,
  finished_at timestamp with time zone
);
CREATE INDEX IF NOT EXISTS live_session_items_session_idx ON live_session_items(session_ref);

COMMIT;
