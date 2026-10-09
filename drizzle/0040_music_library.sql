-- Shared music library (reuse across channels/videos without re-upload)
CREATE TABLE IF NOT EXISTS music_library (
  id text PRIMARY KEY,
  title text NOT NULL,
  file_ref text NOT NULL,
  file_name text,
  telegram_link text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS music_library_created_idx ON music_library (created_at DESC);
-- Which musics are used in which part (many-to-many)
CREATE TABLE IF NOT EXISTS content_part_music (
  part_id text NOT NULL REFERENCES content_parts(id) ON DELETE CASCADE,
  music_id text NOT NULL REFERENCES music_library(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (part_id, music_id)
);
CREATE INDEX IF NOT EXISTS content_part_music_music_idx ON content_part_music (music_id);
