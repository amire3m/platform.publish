-- Unified media core (phase 1): Telegram bytes behind adapter, Postgres catalog.
CREATE TABLE IF NOT EXISTS media_assets (id text PRIMARY KEY, title text NOT NULL DEFAULT '', channel text, product_id text, part_id text, kind text NOT NULL DEFAULT 'final', status text NOT NULL DEFAULT 'draft', current_revision_id text, created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media_revisions (id text PRIMARY KEY, asset_id text NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE, version integer NOT NULL DEFAULT 1, file_name text, mime text, size_bytes bigint NOT NULL DEFAULT 0, sha256 text, storage_object_id text, telegram_file_ref text, status text NOT NULL DEFAULT 'draft', created_by text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media_storage_objects (id text PRIMARY KEY, backend text NOT NULL DEFAULT 'telegram', byte_size bigint NOT NULL DEFAULT 0, part_count integer NOT NULL DEFAULT 1, manifest jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media_upload_sessions (id text PRIMARY KEY, asset_id text, file_name text NOT NULL DEFAULT '', mime text NOT NULL DEFAULT 'application/octet-stream', total_bytes bigint NOT NULL DEFAULT 0, chunk_bytes integer NOT NULL DEFAULT 8388608, total_chunks integer NOT NULL DEFAULT 1, received_chunks jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'open', created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS media_revisions_asset_idx ON media_revisions (asset_id);
CREATE INDEX IF NOT EXISTS media_upload_sessions_status_idx ON media_upload_sessions (status);
-- Binding context: which program/part/output-kind an upload belongs to (copied to the asset on complete).
ALTER TABLE media_upload_sessions ADD COLUMN IF NOT EXISTS part_id text;
ALTER TABLE media_upload_sessions ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE media_upload_sessions ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE media_upload_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'final';
