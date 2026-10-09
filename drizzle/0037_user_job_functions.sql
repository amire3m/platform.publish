-- Staff job functions (multi-select per user; drives the task queue)
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_functions jsonb NOT NULL DEFAULT '[]';
