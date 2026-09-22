CREATE TABLE IF NOT EXISTS growth_experiments (
  id text PRIMARY KEY,
  content_id text NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  arm_duration_hours integer NOT NULL DEFAULT 48,
  min_impressions integer NOT NULL DEFAULT 1000,
  winner_arm_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS growth_experiment_arms (
  id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES growth_experiments(id) ON DELETE CASCADE,
  title text NOT NULL,
  thumbnail_url text,
  is_control boolean NOT NULL DEFAULT false,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  ctr double precision NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outcome_settings (
  id integer PRIMARY KEY DEFAULT 1,
  primary_kpi text NOT NULL DEFAULT 'views',
  target_value integer,
  target_window_days integer NOT NULL DEFAULT 28,
  monthly_budget integer,
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_experiments_content_idx ON growth_experiments(content_id);
CREATE INDEX IF NOT EXISTS growth_experiment_arms_exp_idx ON growth_experiment_arms(experiment_id);
