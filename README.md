# YouTube EmRo

پلتفرم مدیریت چند کانال یوتیوب و چند پیج اینستاگرام، با این تصمیم معماری کلیدی:

> **گروه خصوصی تلگرام، مخزن اصلی فایل‌ها و داده‌های کسب‌وکار است.** پنل وب فقط یک رابط کاربری روی آن است.

این پیاده‌سازی، معماری درخواستی را روی استکی که این محیط (sandbox) در اختیار می‌گذارد پیاده کرده است:
**Next.js (App Router) + TypeScript + Tailwind + Drizzle ORM + PostgreSQL**، به‌جای Monorepo چندسرویسه NestJS/Fastify/BullMQ+Redis.
تمام قراردادهای معماری درخواستی (تلگرام = دیتابیس اصلی، ایندکس محلی قابل بازسازی، تقویم جلالی، RBAC ریزدانه، Capability-driven UI، عدم شبیه‌سازی انتشار واقعی) حفظ شده‌اند. تفاوت‌های عملی در بخش «تطبیق معماری» زیر توضیح داده شده‌اند.

---

## ۱. معماری خلاصه

```
                       ┌──────────────────────────┐
   کاربر فارسی  ───▶   │   Next.js Panel (RTL)     │
   (RTL, جلالی)        │  App Router + API Routes  │
                       └────────────┬──────────────┘
                                    │
                     ┌──────────────┼───────────────┐
                     ▼                              ▼
       ┌────────────────────────┐      ┌─────────────────────────┐
       │ Local Index (Postgres) │      │   Telegram Bot API        │
       │ - rebuildable cache    │◀────▶│  Private Supergroup+Topics│
       │ - fast search/queue    │      │  = SOURCE OF TRUTH        │
       └────────────┬────────────┘      └─────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────┐
        │  In-process Publish Worker   │  ── هر ۶۰ ثانیه ──▶ YouTube Data API
        │  (src/lib/worker.ts)         │  ── هر ۶۰ ثانیه ──▶ Instagram Graph API
        └─────────────────────────────┘
```

* **تلگرام = دیتابیس محتوا.** هر آپلود، فایل اصلی را به‌صورت Document در Topic حساب مقصد ارسال می‌کند و بلافاصله یک پیام متادیتای ساختاریافته با مارکر `TGDB|v1` در همان گروه ثبت می‌کند (`src/lib/telegram/tgdb.ts`).
* **Postgres = ایندکس/کش قابل بازسازی، نه منبع حقیقت.** جدول‌های `src/db/schema.ts` فقط برای جست‌وجوی سریع، تقویم و صف Worker استفاده می‌شوند. هر رکورد `telegram_message_id` مربوط به خودش را نگه می‌دارد و از طریق Export/Import (`/api/telegram/export`) قابل بازسازی است.
* **Secretها هرگز در تلگرام ذخیره نمی‌شوند.** توکن‌های OAuth یوتیوب/اینستاگرام رمزنگاری‌شده (AES-256-GCM) در جدول `credentials` نگهداری می‌شوند و فقط با `credential_ref` به حساب متصل می‌شوند (`src/lib/crypto.ts`).
* **همه تاریخ‌ها از یک لایه مرکزی عبور می‌کنند:** `src/lib/date/jalali.ts` — تنها فایل مجاز برای تبدیل جلالی⇄میلادی⇄UTC در کل پروژه.

### تطبیق معماری با محیط اجرا (تفاوت با معماری Monorepo پیشنهادی سند)

| بخش سند اصلی | پیاده‌سازی فعلی | دلیل |
|---|---|---|
| `apps/web` + `apps/api` (NestJS/Fastify) جدا | یک اپ Next.js با API Routes زیر `src/app/api` | محیط اجرا فقط یک سرویس Next.js را مدیریت می‌کند |
| `apps/worker` جدا + BullMQ/Redis | Worker در همان پروسه Next.js (`src/instrumentation.ts` + `setInterval` هر ۶۰ ثانیه روی جدول `content`) + endpoint دستی `POST /api/cron/tick` برای Cron بیرونی | نبود Redis در محیط پیش‌فرض؛ منطق طوری نوشته شده که با Lease/Lock (`lockedBy`/`lockedAt`) بدون تغییر به یک Worker مستقل قابل انتقال است |
| `packages/*` جدا | ماژول‌های معادل زیر `src/lib/*` (`telegram/`, `providers/`, `date/`, `capabilities.ts`, ...) | یک پروژه TypeScript واحد، بدون نیاز به مدیریت Workspaceهای npm |

منطق دامنه (Telegram-as-DB، Capability config، Jalali، Workflow، RBAC) کاملاً مستقل از این جزئیات چیدمان فایل نوشته شده تا در صورت نیاز به تفکیک به چند سرویس/Repo، فقط کافی است این پوشه‌ها منتقل شوند.

---

## ۲. محدودیت‌های واقعی API که در طراحی لحاظ شده‌اند

### Telegram Bot API
* **فهرست کردن Topicهای موجود امکان‌پذیر نیست.** متدی مثل `getForumTopics` وجود ندارد. برای همین صفحه «تنظیمات تلگرام» دو راه دارد: (الف) «ایجاد از طریق ربات» (`createForumTopic`) که شناسه را برمی‌گرداند، (ب) «نگاشت دستی» یک `message_thread_id` که ادمین از لینک Topic در اپ تلگرام کپی می‌کند.
* **خواندن تاریخچهٔ کامل گروه ممکن نیست.** Bot API متد جست‌وجو/صفحه‌بندی کامل پیام‌های قدیمی ندارد. راهکار پیاده‌سازی‌شده: **Export/Import** (`GET/POST /api/telegram/export`) به‌عنوان مکانیزم عملی بازسازی ایندکس، به‌جای یک History Adapter مبتنی بر MTProto (که در این محیط بدون سشن کاربر واقعی قابل اجرا نیست و مستند شده که به‌صورت افزونه آینده اضافه شود).
* **محدودیت حجم فایل ۵۰ مگابایت** برای Bot معمولی (بدون Local Bot API Server). این مقدار در `TELEGRAM_BOT_API_FILE_LIMIT_MB` و `appSettings.fileSizeLimitMb` قابل تنظیم است و اعتبارسنجی آپلود (`src/lib/capabilities.ts`) پیش از ارسال آن را بررسی و در صورت عبور، خطای فارسی روشن + پیشنهاد Local Bot API Server نمایش می‌دهد.
* **Rate limit / 429**: کلاینت تلگرام (`src/lib/telegram/client.ts`) به‌صورت خودکار `retry_after` را می‌خواند و Backoff می‌کند.

### YouTube Data API
* آپلود Resumable واقعی از طریق `googleapis` پیاده شده (`src/lib/providers/youtube.ts`)، اما فقط وقتی `GOOGLE_CLIENT_ID/SECRET` تنظیم و حساب OAuth متصل باشد.
* **محدودیت سنی (Age Restriction)** و **Thumbnail سفارشی برای Shorts** از طریق API عمومی پشتیبانی نمی‌شوند → در Capability Config غیرفعال و در UI با پیام فارسی نمایش داده می‌شوند.
* هرگز فرض نمی‌شود آپلود = انتشار موفق؛ Worker وضعیت واقعی برگشتی از API را ذخیره می‌کند.

### Instagram Graph API
* فقط حساب Business/Creator، فقط از طریق Graph API رسمی (Container → Publish). هیچ Web Automation/Scraping/لاگین با رمز عبور وجود ندارد.
* استوری، موزیک، Collab و لینک قابل‌کلیک در نسخهٔ فعلی Graph API عمومی به این شکل پشتیبانی نمی‌شوند و در Capability Config/UI غیرفعال‌اند.
* چون Graph API برای ساخت Container به یک URL عمومی نیاز دارد (نه بایت خام)، یک **پراکسی موقت و امضاشده** (`/api/media/telegram/[token]`, اعتبار ۱۵ دقیقه‌ای JWT) فایل را از تلگرام می‌خواند و بدون افشای توکن ربات به Instagram تحویل می‌دهد. این یعنی روی دیسک سرور چیزی ذخیره نمی‌شود، ولی **این مسیر باید روی یک دامنهٔ HTTPS عمومی (`APP_BASE_URL`) اجرا شود** تا سرورهای Meta بتوانند آن را Fetch کنند.

---

## ۳. کدام داده کجا ذخیره می‌شود؟

| داده | محل ذخیره | توضیح |
|---|---|---|
| فایل اصلی ویدیو/عکس | **تلگرام** (Document در Topic حساب) | هرگز به‌صورت دائم روی دیسک سرور نیست |
| متادیتای محتوا (عنوان، کپشن، وضعیت، زمان‌بندی، Platform Targets) | **تلگرام** (پیام `TGDB|v1`) + کپی در Postgres (ایندکس) | Postgres فقط کش قابل بازسازی است |
| کپشن/توضیحات طولانی (>۶۰۰ کاراکتر) | پیام جدا در Topic «کپشن و سناریو» | شناسه پیام در رکورد اصلی ذخیره می‌شود |
| رویدادهای Audit | **تلگرام** (Topic «لاگ فعالیت‌ها») + Postgres | |
| Snapshot آنالیز | **تلگرام** (Topic «گزارش‌ها») + Postgres | هرگز عدد جعلی تولید نمی‌شود |
| **توکن OAuth یوتیوب/اینستاگرام** | **فقط Postgres، رمزنگاری‌شده AES-256-GCM** (`credentials` table) | هرگز در تلگرام یا لاگ عمومی |
| Bot Token / Group ID / Client Secret | **فقط Environment Variables** | هرگز در پایگاه‌داده یا UI عمومی نمایش داده نمی‌شود (فقط Masked) |

---

## ۴. شروع سریع (Local Dev)

```bash
npm install
cp .env.example .env
# .env را با مقادیر توسعه پر کنید (به بخش زیر مراجعه کنید)
npx drizzle-kit push
npm run dev
```

برای ورود بدون یک دامنهٔ عمومی HTTPS (لازمهٔ Telegram Login Widget واقعی)، `.env` را با موارد زیر تنظیم کنید تا **ورود آزمایشی** فعال شود:

```
ALLOW_DEV_LOGIN=1
NEXT_PUBLIC_ALLOW_DEV_LOGIN=1
```

سپس در صفحهٔ ورود، شناسهٔ عددی تلگرام دلخواه را وارد کنید — اولین کاربری که وارد می‌شود به‌صورت خودکار **Owner** می‌شود (Bootstrap Owner).
⚠️ در Production حتماً `ALLOW_DEV_LOGIN=0` باشد.

---

## ۵. راه‌اندازی تلگرام

1. **ساخت ربات**: با [@BotFather](https://t.me/BotFather) دستور `/newbot` را بزنید و توکن را در `TELEGRAM_BOT_TOKEN` قرار دهید.
2. **ساخت Supergroup**: یک گروه بسازید، آن را به Supergroup تبدیل کنید (کافی است تعداد اعضا از ۲۰۰ عبور کند یا از تنظیمات گروه «نوع گروه» را تغییر دهید) و **Topics را از تنظیمات گروه فعال کنید** («موضوعات» / Topics).
3. **دریافت Chat ID**: ربات [@userinfobot](https://t.me/userinfobot) یا @RawDataBot را به گروه اضافه کنید یا از متد `getUpdates` استفاده کنید؛ شناسه‌ای شبیه `-1001234567890` را در `TELEGRAM_GROUP_ID` قرار دهید.
4. **Admin کردن ربات**: ربات را به گروه اضافه و از تنظیمات گروه، آن را Admin کنید با دسترسی‌های: ارسال پیام، ارسال رسانه، پین کردن پیام، مدیریت Topics.
5. **Owner Telegram ID**: شناسهٔ عددی خودتان (از @userinfobot) را در `OWNER_TELEGRAM_ID` قرار دهید تا هنگام اولین ورود، نقش Owner بگیرید.
6. وارد پنل شوید → «تنظیمات تلگرام» → «تست اتصال» → سپس هر Topic ثابت را یا با «ایجاد از طریق ربات» بسازید یا شناسهٔ `message_thread_id` یک Topic موجود را دستی نگاشت کنید.
7. برای هر کانال/پیج، هنگام «افزودن حساب» می‌توانید یک Topic اختصاصی (صف انتشار آن حساب) انتخاب کنید.

### Webhook (Production)
برای دریافت بروزرسانی‌ها به‌صورت Webhook (به‌جای Polling):
```
curl -F "url=https://YOUR_DOMAIN/api/telegram/webhook" \
     -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
     https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
```
نسخهٔ فعلی این پروژه به‌صورت پیش‌فرض تعامل با تلگرام را با فراخوانی مستقیم متدهای Bot API (ارسال پیام/فایل) انجام می‌دهد و نیازی فوری به دریافت Webhook برای جریان اصلی محصول ندارد؛ Endpoint فوق به‌عنوان نقطهٔ توسعهٔ آینده (مثلاً دریافت دستورات کاربران در چت خصوصی) در نظر گرفته شده و در `src/app/api` قابل افزودن است.

---

## ۶. راه‌اندازی YouTube OAuth

1. در [Google Cloud Console](https://console.cloud.google.com) یک پروژه بسازید و **YouTube Data API v3** و **YouTube Analytics API** را فعال کنید.
2. در «OAuth consent screen»، اسکوپ‌های `youtube.upload`، `youtube.readonly`، `yt-analytics.readonly` را اضافه کنید.
3. یک OAuth Client (نوع Web Application) بسازید؛ Redirect URI را دقیقاً برابر `GOOGLE_REDIRECT_URI` (مثلاً `https://YOUR_DOMAIN/api/accounts/callback/youtube`) بگذارید.
4. `GOOGLE_CLIENT_ID` و `GOOGLE_CLIENT_SECRET` را در `.env` قرار دهید.
5. از صفحهٔ «کانال‌ها و پیج‌ها» → «افزودن حساب» → «اتصال رسمی OAuth» را بزنید.

## ۷. راه‌اندازی Meta App و Instagram Graph API

1. در [Meta for Developers](https://developers.facebook.com) یک اپ از نوع Business بسازید.
2. محصول «Instagram Graph API» را اضافه کنید و دسترسی‌های `instagram_basic`، `instagram_content_publish`، `pages_show_list`، `business_management` را درخواست دهید (برای Production نیاز به App Review دارد).
3. حساب اینستاگرام باید **Business یا Creator** باشد و به یک **صفحهٔ فیسبوک** متصل باشد.
4. `META_APP_ID`، `META_APP_SECRET`، `META_REDIRECT_URI` را تنظیم کنید.
5. از پنل، «اتصال رسمی OAuth» را برای اینستاگرام بزنید.

---

## ۸. اجرای Worker

Worker به‌صورت پیش‌فرض داخل همان پروسهٔ Next.js با فاصلهٔ `WORKER_TICK_INTERVAL_MS` (پیش‌فرض ۶۰۰۰۰ میلی‌ثانیه) اجرا می‌شود (`src/instrumentation.ts`).
برای غیرفعال کردن آن و استفاده از یک Cron بیرونی:
```
DISABLE_PUBLISH_WORKER=1
```
و سپس هر دقیقه:
```bash
curl -X POST https://YOUR_DOMAIN/api/cron/tick -H "x-cron-secret: $CRON_SECRET"
```

منطق Idempotency: هر Platform Target با `content_id + platform + account_id + attempts` شناسایی می‌شود؛ هدف هرگز دوباره منتشر نمی‌شود اگر target از قبل `status = published` باشد. Lease با ستون‌های `lockedBy/lockedAt` (۵ دقیقه) پیاده شده تا Restart شدن سرور باعث انتشار دوباره نشود؛ رکوردهای گیرافتاده در `publishing` پس از انقضای Lease دوباره در صف بررسی قرار می‌گیرند.

---

## ۹. Backup / Restore و بازسازی ایندکس

* **Export**: `GET /api/telegram/export` (نیاز به مجوز `export_data`) یک JSON کامل از تمام جدول‌های محلی برمی‌گرداند.
* **Import**: `POST /api/telegram/export` با همان ساختار JSON، رکوردها را Upsert می‌کند — مسیر عملی برای «بازسازی از روی اطلاعات تلگرام» طبق محدودیت‌های Bot API (بخش ۲).
* **Rebuild Index**: `POST /api/telegram/rebuild-index` (یا دکمهٔ «بازسازی ایندکس» در صفحهٔ گزارش‌ها) اتصال تلگرام را بررسی، وضعیت Sync را به‌روزرسانی و رکوردهای دارای مدیای گم‌شده/بدون پیام متادیتا را فهرست می‌کند.
* توصیهٔ عملیاتی: به‌صورت دوره‌ای خروجی `export` را در یک محل امن نگه دارید (مثلاً یک Job که آن را در یک باکت خصوصی جدا از تلگرام ذخیره می‌کند) تا در صورت از دست رفتن کامل ولوم Postgres، با `import` به‌سرعت ایندکس بازسازی شود.

---

## ۱۰. مدل داده و نقش‌ها

نقش‌های پیش‌فرض: `owner`, `manager`, `editor`, `publisher`, `analyst`, `viewer` (جزئیات در `src/lib/permissions.ts`).
مجوزهای ریزدانه: `view_content`, `upload_content`, `edit_content`, `delete_content`, `submit_for_review`, `approve_content`, `schedule_content`, `publish_now`, `manage_accounts`, `manage_users`, `view_analytics`, `export_data`, `manage_settings`.
دسترسی به هر کانال/پیج از طریق `allowedAccountIds` روی کاربر قابل محدودسازی است.

> ⚠️ **نکتهٔ امنیتی مهم**: اعضای گروه تلگرام ممکن است بتوانند Topicهای دیگر را مستقیماً در اپ تلگرام ببینند، چون محدودیت دسترسی سطح Topic در خود تلگرام (برای اعضای عادی گروه) وجود ندارد. **کنترل دسترسی واقعی همیشه در پنل و API اعمال می‌شود**، نه در تلگرام. برای محرمانگی کامل، فقط افراد مورد اعتماد را عضو گروه تلگرام کنید.

چرخهٔ وضعیت محتوا: `draft → uploaded → in_review → changes_requested → approved → scheduled → publishing → published`, به‌علاوهٔ `rejected/cancelled/failed/archived`. **محتوای منتشرشده هرگز حذف نمی‌شود** — فقط آرشیو می‌شود (`DELETE /api/content/:id` فقط برای `draft` مجاز است).

---

## ۱۱. مستندات API

تمام Endpointها زیر `src/app/api` با Convention زیر پیاده شده‌اند (پاسخ یکنواخت `{ ok, data }` یا `{ ok:false, error, code }`):

* `POST /api/auth/telegram`, `POST /api/auth/dev-login`, `GET /api/auth/me`, `POST /api/auth/logout`
* `POST /api/telegram/test-connection`, `GET|POST /api/telegram/topics`, `PATCH|DELETE /api/telegram/topics/:id`, `POST /api/telegram/rebuild-index`, `GET|POST /api/telegram/export`, `GET /api/telegram/message/:id`
* `GET|POST /api/users`, `PATCH|DELETE /api/users/:id`, `POST /api/users/:id/permissions`
* `GET /api/accounts`, `POST /api/accounts/connect/:platform`, `GET /api/accounts/callback/:platform`, `PATCH|DELETE /api/accounts/:id`, `GET /api/accounts/:id/capabilities`, `POST /api/accounts/:id/sync`
* `POST /api/content/upload`, `GET /api/content`, `GET|PATCH|DELETE /api/content/:id`, `POST /api/content/:id/{submit-review|approve|request-changes|schedule|publish-now|cancel|retry|archive}`
* `GET /api/calendar`, `PATCH /api/calendar/:contentId/reschedule`, `POST /api/calendar/bulk-reschedule`
* `GET /api/analytics/overview`, `GET /api/analytics/account/:id`, `GET /api/analytics/content/:id`, `POST /api/analytics/sync`, `GET /api/analytics/export`
* `GET /api/audit-logs`, `GET /api/errors`
* `GET|PATCH /api/settings`
* `POST /api/cron/tick`

هر Endpoint احراز هویت (Session Cookie از `/api/auth/telegram` یا `/dev-login`)، احراز دسترسی (permission ریزدانه)، اعتبارسنجی ورودی (Zod) و ثبت Audit Log دارد. برای مرجع تعاملی OpenAPI/Swagger می‌توانید Schema بالا را در Swagger Editor Import کنید یا از `zod-to-openapi` برای تولید خودکار استفاده کنید (Extension Point مستند‌شده، به دلیل محدودیت زمانی این تحویل در کد پیاده‌سازی نشده است).

---

## ۱۲. تست‌ها (استراتژی و پوشش)

با توجه به محدودیت این محیط (بدون دسترسی واقعی به APIهای بیرونی)، تمام Providerهای بیرونی Adapter/Mock دارند:
* `src/lib/providers/mock.ts` — هرگز موفقیت جعلی را به‌عنوان انتشار واقعی معرفی نمی‌کند (`raw.mock = true` در هر پاسخ Mock).
* منطق تبدیل تاریخ (`src/lib/date/jalali.ts`) خالص و بدون وابستگی به I/O است، بنابراین با هر فریم‌ورک تستی (Vitest/Jest) قابل تست واحد است؛ نمونه سناریوهای بحرانی که باید پوشش داده شوند: سال کبیسهٔ جلالی (`isJalaliLeapYear`)، عبور از نوروز، تبدیل ساعت Asia/Tehran، زمان گذشته (`isPast`).
* منطق Worker (`processContent`) طوری نوشته شده که با تزریق یک Provider Mock/Fake `TelegramClient` قابل تست Integration است (بدون فراخوانی شبکهٔ واقعی).
* برای اجرای تست‌ها در آینده: `npm i -D vitest` و افزودن اسکریپت `test` — فایل‌های تست پیشنهادی: `src/lib/date/jalali.test.ts`, `src/lib/worker.test.ts`, `src/lib/permissions.test.ts`, `src/lib/capabilities.test.ts`.

---

## ۱۳. حالت آزمایشی (Mock Mode)

هر حساب یوتیوب/اینستاگرام می‌تواند به‌صورت «حالت آزمایشی» (`connectionStatus = mock`) اضافه شود تا کل مسیر آپلود → تأیید → زمان‌بندی → Worker → «انتشار» را بدون هیچ App واقعی گوگل/متا تست کنید. در این حالت:
* UI به‌صورت واضح برچسب «حالت آزمایشی» نشان می‌دهد.
* نتیجهٔ Worker شامل `raw.mock: true` است و لینک نهایی، یک لینک ساختگی قابل‌تشخیص است (`mock_...`)، هرگز به کاربر گفته نمی‌شود که این انتشار واقعی است.
* به‌محض تنظیم `GOOGLE_CLIENT_ID`/`META_APP_ID` و اتصال OAuth واقعی، همان مسیر کد بدون تغییر، از Providerهای واقعی استفاده می‌کند.

---

## ۱۴. اجرای Production با Docker

```bash
cp .env.example .env   # مقداردهی کنید
docker compose up -d --build
docker compose exec web npx drizzle-kit push
```

## ۱۵. ساختار پوشه‌ها

```
src/
  db/                    # Drizzle schema + client (Local rebuildable index)
  lib/
    date/jalali.ts        # تنها لایهٔ تبدیل تاریخ جلالی/UTC
    telegram/              # Bot API client + TGDB repository (Telegram-as-DB)
    providers/              # youtube.ts, instagram.ts, mock.ts (Publish adapters)
    capabilities.ts          # Capability Configuration (نه Hardcode)
    permissions.ts            # RBAC ریزدانه
    worker.ts                  # منطق Worker انتشار با Idempotency/Backoff/Lease
    crypto.ts                    # رمزنگاری Secretها (AES-256-GCM)
  instrumentation.ts       # اجرای Worker داخل پروسهٔ Next.js
  app/
    (panel)/...             # صفحات پنل پس از احراز هویت (RTL, دارک‌مود)
    api/...                   # تمام Endpointهای REST
    login/                     # صفحهٔ ورود (Telegram Login Widget + Dev Login)
```
