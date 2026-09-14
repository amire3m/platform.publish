CREATE TABLE IF NOT EXISTS media_mirrors (
  id text PRIMARY KEY,
  part_id text REFERENCES content_parts(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  provider text NOT NULL DEFAULT 'vids.st',
  remote_id text,
  remote_url text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','uploading','ready','error')),
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(provider, file_id)
);
