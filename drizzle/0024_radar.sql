CREATE TABLE IF NOT EXISTS radar_runs (
  id text PRIMARY KEY,
  week_start date NOT NULL,
  status text NOT NULL DEFAULT 'done',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS radar_items (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES radar_runs(id) ON DELETE CASCADE,
  source text NOT NULL,
  query_lang text NOT NULL,
  query text NOT NULL,
  similar_to_part_id text,
  similar_to_title text,
  external_id text NOT NULL,
  title text NOT NULL,
  channel text,
  views bigint,
  published_at timestamp with time zone,
  similarity_score double precision NOT NULL DEFAULT 0,
  thumb_url text,
  permalink text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_items_run_idx ON radar_items(run_id);
CREATE INDEX IF NOT EXISTS radar_items_similarity_idx ON radar_items(similarity_score DESC);
