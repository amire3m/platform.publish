CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  title varchar(200) NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  due_at timestamptz,
  product_id text REFERENCES content_products(id) ON DELETE SET NULL,
  part_id text REFERENCES content_parts(id) ON DELETE SET NULL,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  awaiting_approval_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_status_check CHECK (status IN ('open', 'awaiting_approval', 'completed', 'archived')),
  CONSTRAINT task_version_check CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  job_function text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  submission_note text,
  submission_url text,
  submitted_by text REFERENCES users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  PRIMARY KEY (task_id, job_function),
  CONSTRAINT task_assignment_status_check CHECK (status IN ('open', 'submitted')),
  CONSTRAINT task_assignment_job_function_check CHECK (
    job_function IN ('full_editor', 'reel_editor', 'graphic', 'publisher_admin')
  )
);

CREATE INDEX IF NOT EXISTS task_open_order_idx
  ON tasks (status, due_at, created_at, id);
CREATE INDEX IF NOT EXISTS task_approval_order_idx
  ON tasks (status, awaiting_approval_at, id);
CREATE INDEX IF NOT EXISTS task_completed_order_idx
  ON tasks (status, completed_at, id);
CREATE INDEX IF NOT EXISTS task_archived_order_idx
  ON tasks (status, archived_at, id);
CREATE INDEX IF NOT EXISTS task_product_idx ON tasks (product_id);
CREATE INDEX IF NOT EXISTS task_part_idx ON tasks (part_id);
CREATE INDEX IF NOT EXISTS task_assignment_job_status_idx
  ON task_assignments (job_function, status, task_id);
