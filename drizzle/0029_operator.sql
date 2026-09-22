CREATE TABLE IF NOT EXISTS operator_strategies (
  id text PRIMARY KEY,
  objective text NOT NULL,
  audience text NOT NULL,
  pillars jsonb NOT NULL DEFAULT '[]'::jsonb,
  cadence_per_week integer NOT NULL DEFAULT 2,
  videos_per_run integer NOT NULL DEFAULT 2,
  default_format text NOT NULL DEFAULT 'tutorial',
  default_length text NOT NULL DEFAULT 'medium',
  primary_kpi text NOT NULL DEFAULT 'views',
  target_value integer,
  target_window_days integer NOT NULL DEFAULT 28,
  monthly_budget integer,
  currency text NOT NULL DEFAULT 'USD',
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operator_runs (
  id text PRIMARY KEY,
  strategy_id text NOT NULL REFERENCES operator_strategies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'planned',
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);
CREATE INDEX IF NOT EXISTS operator_runs_strategy_idx ON operator_runs(strategy_id);
