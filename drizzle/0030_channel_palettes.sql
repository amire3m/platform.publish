CREATE TABLE IF NOT EXISTS channel_palettes (
  account_id text PRIMARY KEY REFERENCES social_accounts(id) ON DELETE CASCADE,
  paper text NOT NULL DEFAULT '#FFF8F0',
  ink text NOT NULL DEFAULT '#1A1A1A',
  primary text NOT NULL DEFAULT '#E63946',
  soft text NOT NULL DEFAULT '#F1FAEE',
  accent text NOT NULL DEFAULT '#457B9D',
  font_heading text NOT NULL DEFAULT 'Vazirmatn',
  font_body text NOT NULL DEFAULT 'Vazirmatn',
  watermark_path text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
