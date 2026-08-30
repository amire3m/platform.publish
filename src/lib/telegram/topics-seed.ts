// Fixed topic catalogue (item 3 of the spec). `key` is the stable machine
// identifier used across the codebase; `label` is editable by the Owner in
// Settings → Telegram and only used for human display.
export const FIXED_TOPICS: { key: string; label: string; purpose: string }[] = [
  { key: "settings", label: "⚙️ تنظیمات سیستم", purpose: "پیام‌های پیکربندی و راه‌اندازی سیستم" },
  { key: "users", label: "👥 کاربران و دسترسی‌ها", purpose: "رویدادهای مدیریت کاربران و نقش‌ها" },
  { key: "youtube_channels", label: "📺 کانال‌های یوتیوب", purpose: "اتصال و تنظیمات کانال‌های یوتیوب" },
  { key: "instagram_pages", label: "📱 پیج‌های اینستاگرام", purpose: "اتصال و تنظیمات پیج‌های اینستاگرام" },
  { key: "inbox", label: "📥 ورودی محتوا", purpose: "فایل‌های خام آپلودشده پیش از دسته‌بندی" },
  { key: "graphics", label: "🎨 گرافیک", purpose: "تصاویر، کاور و تامبنیل‌ها" },
  { key: "captions", label: "✍️ کپشن و سناریو", purpose: "متن‌های طولانی کپشن/توضیحات که در پیام مجزا ذخیره می‌شوند" },
  { key: "published", label: "✅ منتشرشده‌ها", purpose: "آرشیو محتوای منتشرشده" },
  { key: "reports", label: "📊 گزارش‌ها و آنالیز", purpose: "اسنپ‌شات‌های تحلیلی دوره‌ای" },
  { key: "errors", label: "❌ خطاهای انتشار", purpose: "خطاهای انتشار و مشکلات اتصال API" },
  { key: "logs", label: "🧾 لاگ فعالیت‌ها", purpose: "رویدادهای Audit تمام اقدامات حساس" },
  { key: "live_alerts", label: "🔴 لایو", purpose: "پنل مدیریت و اعلان‌های استریم زنده" },
  { key: "chat", label: "💬 تالار گفتگو", purpose: "گفتگوی آزاد تیم (خارج از کنترل سیستم)" },
];

// Note: per-account "صف انتشار" / "منتشرشده‌های ..." topics are not fixed —
// they are configured individually per SocialAccount (see socialAccounts.topicId).
