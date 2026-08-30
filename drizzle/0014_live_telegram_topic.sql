-- Live conductor: dedicated Telegram topic (live_alerts → t.me/emamyt/2540)
BEGIN;

INSERT INTO telegram_topics (id, key, label, purpose, is_fixed, message_thread_id)
VALUES ('TPC-LIVE-ALERTS', 'live_alerts', '🔴 لایو', 'پنل مدیریت و اعلان‌های استریم زنده', true, 2540)
ON CONFLICT (key) DO UPDATE SET
  message_thread_id = 2540,
  label = EXCLUDED.label,
  purpose = EXCLUDED.purpose,
  is_fixed = true;

COMMIT;
