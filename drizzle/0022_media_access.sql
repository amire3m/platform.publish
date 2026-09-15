CREATE TABLE IF NOT EXISTS media_access (
  file_path text PRIMARY KEY,
  last_access timestamp with time zone NOT NULL DEFAULT now(),
  access_count integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
