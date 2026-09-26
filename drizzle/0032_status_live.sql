INSERT INTO telegram_topics (id, key, label, purpose, is_fixed) VALUES ('TPC-STATUS-LIVE', 'status_live', '🔵 وضعیت زنده سامانه', 'پیام آپ‌تایم زنده ربات و سایت (به‌روزرسانی هر 90 ثانیه)', true) ON CONFLICT (key) DO NOTHING;
ALTER TABLE telegram_topics ADD COLUMN IF NOT EXISTS status_message_id integer;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS status_message_id integer;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS status_topic_id text;
