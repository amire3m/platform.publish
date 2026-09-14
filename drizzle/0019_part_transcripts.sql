CREATE TABLE IF NOT EXISTS part_transcripts (
  id text PRIMARY KEY,
  part_id text NOT NULL REFERENCES content_parts(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'fa',
  full_text text NOT NULL DEFAULT '',
  duration_sec integer,
  segments jsonb NOT NULL DEFAULT '[]',
  srt_text text NOT NULL DEFAULT '',
  captions jsonb,
  stt_model text,
  llm_model text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','error')),
  error text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(part_id)
);
