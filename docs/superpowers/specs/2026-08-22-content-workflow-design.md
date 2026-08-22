# طراحی مدیریت تولید و انتشار محتوا

تاریخ: 2026-08-22

## هدف

افزودن یک «اتاق انتشار» به سامانه برای مدیریت مجموعه‌ای از برنامه‌ها که هرکدام تعداد و نوع خروجی قابل تنظیم دارند. مدیر باید در یک نگاه بداند کدام خروجی تولید شده، چه چیزی باقی مانده، مسئول و موعد آن چیست و وضعیت انتشارش در تلگرام، یوتیوب و اینستاگرام چگونه است.

این قابلیت جایگزین فایل Google Sheet فعلی می‌شود. داده موجود یک‌بار با پیش‌نمایش و تأیید کاربر وارد سامانه خواهد شد و پس از آن PostgreSQL مرجع اصلی اطلاعات مدیریتی است. فایل‌های رسانه‌ای همچنان از زیرساخت فعلی محتوا و Telegram storage استفاده می‌کنند.

## تصمیم‌های تأییدشده

- خروجی‌های هر برنامه ثابت نیستند و آزادانه قابل افزودن، حذف و مرتب‌سازی‌اند.
- الگوهای قابل ذخیره، نقطه شروع ساخت برنامه هستند و پس از اعمال قابل تغییرند.
- وضعیت تولید خروجی از وضعیت انتشار هر مقصد جداست.
- مقصدهای نسخه اول تلگرام، یوتیوب و اینستاگرام‌اند.
- وضعیت انتشار در صورت انجام عملیات داخل سامانه خودکار و در سایر موارد قابل اصلاح دستی است.
- هر خروجی مسئول و موعد مستقل دارد.
- هشدارها در داشبورد و تلگرام ارائه می‌شوند.
- تاریخچه کامل تغییرات نگهداری می‌شود و «اصلاح شود» و «منتشر نشود» دلیل اجباری دارند.
- دسترسی‌ها نقش‌محورند و مسئول هر خروجی فقط محدوده مجاز خود را تغییر می‌دهد.
- ورود از شیت فقط نام و وضعیت را منتقل می‌کند؛ فایل‌ها بعداً متصل می‌شوند.
- نمای اصلی، ماتریس مدیریتی «اتاق انتشار» با اقدام بعدی و جزئیات بازشونده است.

## دامنه

### در دامنه

- مدیریت برنامه، خروجی‌های قابل تنظیم و الگوهای خروجی.
- مسئول، موعد، توضیحات و وضعیت تولید مستقل برای هر خروجی.
- وضعیت مستقل هر خروجی برای تلگرام، یوتیوب و اینستاگرام.
- اتصال اختیاری خروجی به یک رکورد `content` موجود یا جدید.
- همگام‌سازی وضعیت مقصد با worker انتشار موجود برای مقصدهای پشتیبانی‌شده.
- ویرایش دستی وضعیت مقصد با ثبت منبع تغییر و تاریخچه.
- ماتریس مدیریتی responsive، صفحه برنامه و مدیریت الگوها.
- ورود یک‌باره از Google Sheet عمومی با پیش‌نمایش، نگاشت ستون و تشخیص تکراری.
- اعلان داخل سامانه و تلگرام برای واگذاری، موعد، تأخیر، اصلاح و خطای انتشار.
- گزارش پیشرفت، موارد باقی‌مانده و اقدام بعدی.
- کنترل دسترسی سمت سرور و audit کامل.

### خارج از دامنه

- همگام‌سازی دوطرفه یا دائمی با Google Sheet.
- انتقال فایل‌های رسانه‌ای از Google Drive یا Sheet.
- ساخت موتور انتشار عمومی تلگرام در این فاز؛ وضعیت تلگرام تا زمان وجود یک publisher عمومی، دستی است.
- رفع محدودیت دسترسی Meta؛ انتشار خودکار اینستاگرام فقط پس از اتصال معتبر حساب کار می‌کند.
- طراحی workflow دلخواه توسط کاربر یا ساخت state-machine عمومی.
- وابستگی بین خروجی‌ها، بودجه، تایم‌شیت یا مدیریت پروژه عمومی.
- حذف یا بازطراحی مدل فعلی `content` و تقویم انتشار.

## معماری و مرزها

این قابلیت یک زیرسامانه workflow مستقل و normalized در PostgreSQL است. برنامه و خروجی، وظیفه مدیریتی را نمایش می‌دهند؛ رکورد `content` همچنان واحد فایل، متن، زمان‌بندی و اجرای انتشار است.

جداول `workflow_*` و رویدادهایشان استثنای صریح معماری Telegram-as-DB هستند و داده authoritative آن‌ها در PostgreSQL است. rebuild از تاریخچه Telegram این جداول را بازسازی نمی‌کند؛ بنابراین backup و restore آزموده‌شده PostgreSQL پیش‌نیاز عرضه است. خود `content`، فایل‌ها و `platformTargets` همچنان از repository موجود و مسیر Telegram-first تغییر می‌کنند و workflow نباید آن‌ها را با SQL مستقیم دور بزند.

هر خروجی می‌تواند به حداکثر یک `content` متصل شود. این اتصال اختیاری است تا برنامه‌های واردشده از شیت پیش از آماده‌شدن فایل نیز قابل مدیریت باشند. مقصدهای خروجی در سطح platform/account تعریف می‌شوند. هنگام اتصال مقصد خودکار، شناسه پایدار `workflow_publication_id` داخل target JSON ذخیره می‌شود و برابر ID رکورد publication است. adapter فقط با همین کلید همگام می‌کند؛ حدس‌زدن اتصال از platform/account مجاز نیست. targetهای قدیمی بدون این کلید legacy و خارج از workflow باقی می‌مانند.

مسیر داده:

1. کاربر برنامه را از الگو، به‌صورت خالی یا از شیت ایجاد می‌کند.
2. خروجی‌ها، مسئولان، موعدها و مقصدهای فعال مشخص می‌شوند.
3. مسئول وضعیت تولید را پیش می‌برد و در صورت آماده‌شدن، فایل یا `content` را متصل می‌کند.
4. ناشر برای مقصدهای قابل خودکارسازی، target انتشار را ایجاد یا زمان‌بندی می‌کند.
5. worker فعلی با کلید پایدار workflow، تغییر وضعیت target، external ID، permalink و خطا را به وضعیت مقصد workflow منعکس می‌کند.
6. انتشار خارج از سامانه با ویرایش دستی ثبت می‌شود و منبع آن `manual` باقی می‌ماند.
7. هر mutation صرفاً workflow در همان تراکنش، یک رویداد تاریخچه ایجاد می‌کند و اعلان‌های لازم را enqueue می‌کند. mutationهای target از ترتیب Telegram-first و reconciliation تعریف‌شده در بخش انتشار پیروی می‌کنند.

بارگذاری فایل در گروه خصوصی Telegram که نقش storage/TGDB دارد، انتشار عمومی تلگرام محسوب نمی‌شود. مقصد تلگرام فقط با تأیید دستی یا یک publisher عمومی واقعی به `published` می‌رسد.

## مدل داده

نام نهایی جداول می‌تواند با conventions موجود هماهنگ شود، اما مرز و معنای آن‌ها ثابت است.

### `workflow_programs`

- `id`
- `title`
- `series_name` اختیاری
- `owner_user_id` اختیاری
- `due_at` اختیاری
- `notes` اختیاری
- `source`: `manual | sheet_import`
- `source_ref` اختیاری برای شناسه batch/row واردشده
- `version` برای optimistic concurrency
- `created_by`, `created_at`, `updated_at`, `archived_at`

وضعیت و درصد برنامه ذخیره نمی‌شوند؛ از خروجی‌ها و مقصدهای فعال محاسبه می‌شوند تا drift ایجاد نشود.

### `workflow_deliverables`

- `id`, `program_id`
- `name` و `kind` اختیاری/قابل توسعه؛ نام برای نمایش مرجع اصلی است.
- `sort_order`
- `production_status`
- `assignee_user_id` اختیاری
- `due_at` اختیاری
- `notes` اختیاری
- `content_id` اختیاری و unique برای جلوگیری از اتصال تصادفی یک محتوا به چند خروجی
- `archived_at` اختیاری
- `version`
- `created_by`, `created_at`, `updated_at`

پس از ذخیره برنامه، «حذف خروجی» دقیقاً action `cancel` را اجرا می‌کند: `production_status=cancelled` و `archived_at=now` در یک mutation ثبت می‌شوند و hard delete وجود ندارد. حذف آزاد فقط در draft سمت مرورگر، پیش از اولین ذخیره برنامه ممکن است. خروجی لغوشده در تاریخچه باقی می‌ماند، از نمای پیش‌فرض پنهان و از پیشرفت و کارهای باقی‌مانده حذف می‌شود. action `restore`، `archived_at` را پاک و status را به `not_started` تبدیل می‌کند.

### `workflow_publications`

- `id`, `deliverable_id`
- `platform`: `telegram | youtube | instagram`
- `social_account_id` اختیاری تا زمانی که مقصد واقعی انتخاب نشده است؛ برای Telegram نسخه اول همیشه null است.
- `status`
- `created_source`: `manual | imported`
- `terminal_owner`: `automatic | manual | imported | null`
- `scheduled_at`, `published_at`
- `external_id`, `permalink`
- `last_error_code`, `last_error_message`
- `manual_reason` برای وضعیت‌های پایانی دستی
- `version`, `updated_by`, `created_at`, `updated_at`

برای account غیرnull، unique index روی deliverable/platform/account و برای accountless یک partial unique index روی deliverable/platform وجود دارد. account غیرnull باید فعال باشد و platform آن با publication برابر باشد. مقصد YouTube/Instagram بدون حساب قبل از انتشار خودکار باید به حساب فعال متصل شود. Telegram دقیقاً یک publication بدون حساب برای هر خروجی دارد، وارد `social_accounts` یا `platformTargets` نمی‌شود و در نسخه اول دستی است. UI در سطح platform جمع‌بندی می‌کند، اما جزئیات حساب در صفحه خروجی قابل مشاهده است.

### `workflow_templates` و `workflow_template_items`

Template شامل نام، توضیح، active flag و creator است. هر item شامل نام خروجی، ترتیب، مقصدهای پیش‌فرض و offset موعد نسبت به موعد برنامه است. اعمال template یک snapshot می‌سازد؛ تغییر بعدی template برنامه‌های قبلی را تغییر نمی‌دهد.

### `workflow_events`

رویداد append-only شامل entity type/id، action، before/after JSON، actor، source، reason و timestamp است. حذف یا ویرایش رویداد از UI مجاز نیست. reason برای `changes_requested`، `cancelled` و `do_not_publish` الزامی است.

### `workflow_notifications`

شامل recipient، channel، event type، payload امن، idempotency key، زمان برنامه‌ریزی، وضعیت ارسال، تعداد تلاش و آخرین خطاست. unique idempotency key از ارسال تکراری یک هشدار جلوگیری می‌کند.

### `workflow_import_batches`

batch شامل Sheet ID/tab، initiator، mapping snapshot، counts، status و timestamp است. نتیجه هر ردیف شامل row number، normalized title، action و خطا نگهداری می‌شود تا گزارش import قابل بازبینی باشد.

## وضعیت‌ها و گذارها

### تولید خروجی

- `not_started`، شروع‌نشده
- `in_progress`، در حال آماده‌سازی
- `ready_for_review`، آماده بازبینی
- `changes_requested`، اصلاح شود
- `ready`، آماده انتشار
- `cancelled`، لغو شده

مسیر عادی `not_started -> in_progress -> ready_for_review -> ready` است. از `ready_for_review` می‌توان با دلیل به `changes_requested` رفت و پس از اصلاح دوباره به `ready_for_review` برگشت. برگشت وضعیت فقط از actionهای جدول زیر مجاز است. `cancelled` فقط توسط مدیر و با دلیل ثبت می‌شود و بازگردانی آن نیز رویداد مستقل می‌سازد.

### انتشار مقصد

- `waiting_for_production`، منتظر آماده‌شدن
- `ready`، آماده انتشار
- `scheduled`، زمان‌بندی‌شده
- `publishing`، در حال انتشار
- `published`، منتشرشده
- `failed`، ناموفق
- `do_not_publish`، منتشر نشود

با رسیدن تولید به `ready`، publicationهای `waiting_for_production` به `ready` می‌روند. تا تولید خروجی `ready` نیست، مقصد نمی‌تواند وارد `scheduled` یا `publishing` شود. service و worker مسیر `ready -> scheduled -> publishing -> published/failed` را اجرا می‌کنند. تلاش مجدد `failed` را به `publishing` می‌برد. `do_not_publish` نیازمند دلیل است و از denominator پیشرفت حذف می‌شود.

ویرایش دستی `published` به اطلاعات حداقلی زمان انتشار نیاز دارد و permalink اختیاری است. هنگام ورود به `published` یا `do_not_publish`، `terminal_owner` تعیین می‌شود. worker روی terminal owner از نوع manual/imported هیچ تغییری نمی‌دهد و یک event no-op ثبت می‌کند. override فقط با action مستقل `override_terminal_status`، permission مدیر و دلیل اجباری ممکن است. منشأ هر تغییر در event ثبت می‌شود و `created_source` بازنویسی نمی‌شود.

قواعد actionها:

| حوزه | action | از | به | مجری و پیش‌شرط |
| --- | --- | --- | --- | --- |
| تولید | start | `not_started` | `in_progress` | مسئول یا مدیر |
| تولید | submit_review | `in_progress` یا `changes_requested` | `ready_for_review` | مسئول یا مدیر |
| تولید | request_changes | `ready_for_review` | `changes_requested` | مدیر، دلیل اجباری |
| تولید | approve | `ready_for_review` | `ready` | مدیر |
| تولید | reopen | `ready` | `in_progress` | مدیر، دلیل اجباری؛ در صورت published بودن هر مقصد ممنوع و نیازمند خروجی جایگزین؛ scheduleها باید قبلاً لغو شوند؛ در حالت publishing ممنوع |
| تولید | cancel | هر وضعیت تولید | `cancelled` | مدیر، دلیل اجباری؛ publication در حال publishing/published مجاز نیست و schedule باید قبلاً لغو شود |
| تولید | restore | `cancelled` | `not_started` | مدیر، دلیل اجباری |
| مقصد | prepare | `waiting_for_production` | `ready` | خودکار هنگام آماده‌شدن تولید |
| مقصد | schedule | `ready` یا `failed` | `scheduled` | ناشر/مدیر، content و account معتبر برای مقصد خودکار |
| مقصد | claim_publish | `ready`، `scheduled` یا `failed` | `publishing` | worker یا انتشار دستی اتمیک |
| مقصد | publish_succeeded | `publishing` | `published` | worker؛ external ID در صورت ارائه provider |
| مقصد | publish_failed | `publishing` | `failed` | worker، خطای safe |
| مقصد | cancel_schedule | `scheduled` | `ready` | ناشر/مدیر |
| مقصد | suppress | هر حالت جز `publishing/published` | `do_not_publish` | ناشر/مدیر، دلیل اجباری |
| مقصد | restore_suppressed | `do_not_publish` | `ready` یا `waiting_for_production` | مدیر، دلیل اجباری و بر اساس وضعیت تولید |
| مقصد | manual_publish | `ready`، `scheduled` یا `failed` | `published` | ناشر/مدیر؛ claim و ثبت `published` در یک operation دارای version check، زمان انتشار و دلیل/یادداشت؛ در صورت claim دیگر رد می‌شود |
| مقصد | override_terminal_status | `published` یا `do_not_publish` | طبق قواعد تصحیح پایانی زیر | مدیر، دلیل اجباری |

تصحیح وضعیت پایانی فقط این گذارها را دارد:

- `published` با terminal owner از نوع manual/imported می‌تواند به `ready` در صورت production=`ready` و در غیر این صورت `waiting_for_production` برگردد؛ `published_at`، external ID و permalink واردشده پاک، `terminal_owner=null` و target keyed به `approved` reset می‌شود.
- همان `published` دستی/واردشده می‌تواند برای تصحیح داده به `do_not_publish` برود؛ فیلدهای انتشار پاک، `terminal_owner=manual` و target keyed به `cancelled` می‌رود.
- `do_not_publish` می‌تواند به `ready` یا `waiting_for_production` بر اساس وضعیت تولید برگردد؛ `terminal_owner=null` و target keyed به `approved` reset می‌شود.
- `published` با terminal owner از نوع automatic واقعیت انتشار خارجی است و override نمی‌شود؛ فقط detach/archive یا ثبت خروجی جایگزین مجاز است.

detach محتوا، status را تغییر نمی‌دهد اما انتشار خودکار را غیرفعال و warning ایجاد می‌کند؛ برای publication در حال publishing ممنوع است و publication زمان‌بندی‌شده باید ابتدا با `cancel_schedule` به `ready` برگردد و `scheduled_at` آن پاک شود. حذف keyed target فقط از action مشترک detach/cancel انجام می‌شود و raw target deletion مجاز نیست. برگشت تولید از `ready`، publicationهای `ready/failed` را به `waiting_for_production` می‌برد و در همان عملیات Telegram-first، target keyed را به `approved` reset و attempts، next retry و خطای قبلی را پاک می‌کند؛ schedule باید پیش از آن لغو شده باشد و وضعیت `published` هرگز به عقب برنمی‌گردد.

## پیشرفت، تکمیل و اقدام بعدی

پیشرفت باید deterministic و قابل توضیح باشد:

- هر خروجی فعال یک واحد «تولید» دارد؛ فقط `ready` آن واحد را کامل می‌کند.
- هر مقصد فعال یک واحد «انتشار» دارد؛ فقط `published` آن واحد را کامل می‌کند.
- خروجی `cancelled` و مقصد `do_not_publish` از صورت و مخرج حذف می‌شوند.
- درصد برنامه برابر completed units تقسیم بر total active units است.
- وضعیت‌های میانی درصد مصنوعی ایجاد نمی‌کنند؛ جزئیات مرحله در کنار درصد نمایش داده می‌شود.
- اگر هیچ واحد فعالی وجود نداشته باشد، پیشرفت صفر و برنامه «بدون خروجی فعال» است، نه کامل.
- خروجی فعال بدون مقصد، پس از `ready` کامل محسوب می‌شود زیرا واحد تولید آن تکمیل شده است.

برنامه زمانی کامل است که حداقل یک خروجی فعال داشته باشد، تمام تولیدهای فعال `ready` و تمام مقصدهای فعال `published` باشند.

اولویت «اقدام بعدی»:

1. `changes_requested` و publication `failed`، بر اساس قدیمی‌ترین رخداد.
2. خروجی یا مقصد ناقصِ دارای موعد گذشته، بر اساس بیشترین تأخیر.
3. تولید آماده ولی مقصد آماده/زمان‌بندی‌نشده، بر اساس نزدیک‌ترین زمان انتشار.
4. خروجی شروع‌نشده یا در جریان، بر اساس نزدیک‌ترین موعد.
5. در نبود اقدام، «تکمیل» یا «بدون خروجی فعال» نمایش داده می‌شود.

در تمام رتبه‌بندی‌ها deadline/scheduled timestamp تهی بعد از مقادیر غیرتهی قرار می‌گیرد و tie-break نهایی `created_at` سپس `id` است. موعد publication همان زمان target است؛ اگر تهی باشد، موعد خروجی و سپس موعد برنامه برای اولویت نمایش استفاده می‌شود.

## رابط کاربری

### اتاق انتشار

یک route جدید در پنل و navigation اضافه می‌شود. دسکتاپ از ماتریس تأییدشده استفاده می‌کند:

- خلاصه پیشرفت کل، برنامه‌های فعال، نیازمند توجه و موعدهای هفته.
- جست‌وجوی عنوان برنامه یا مسئول.
- فیلتر مرحله، مسئول، موعد، مقصد و «نیازمند توجه».
- ستون‌های برنامه، پیشرفت کل، تولید، تلگرام، یوتیوب، اینستاگرام، موعد و اقدام بعدی.
- ردیف بازشونده برای دیدن خروجی‌ها و تغییر سریع وضعیت.
- bulk action فقط برای واگذاری مسئول، موعد و مقصد `do_not_publish` با تأیید و دلیل؛ bulk status آزاد در نسخه اول وجود ندارد.

در موبایل، هر برنامه یک کارت خلاصه با progress، اقدام بعدی و مقصدهاست. جزئیات خروجی با disclosure باز می‌شود و هیچ جدول عریض افقی مبنای اصلی موبایل نیست.

### صفحه برنامه

- header شامل عنوان، owner، موعد، پیشرفت و هشدارها.
- metadata قابل ویرایش با version check.
- لیست مرتب‌شونده خروجی‌ها با تولید، مسئول، موعد و سه مقصد.
- افزودن خروجی دلخواه یا از template item.
- اتصال/جداسازی محتوا با تأیید کاربر.
- پنل تاریخچه با فیلتر entity و actor.
- dialog دلیل برای اصلاح، لغو و منتشر نشود.

### ایجاد برنامه و الگوها

کاربر template یا «برنامه خالی» را انتخاب می‌کند، سپس عنوان، owner، موعد و snapshot خروجی‌ها را قبل از ثبت مرور می‌کند. مدیر می‌تواند template و itemها را ایجاد، مرتب، غیرفعال یا ویرایش کند. حذف template استفاده‌شده به archive تبدیل می‌شود.

### حالت‌های رابط

loading، empty، no-results، stale update، concurrent edit conflict، partial publication failure، import warning و permission denied متن عملی و فارسی دارند. کنترل‌ها keyboard-accessible، دارای focus visible و label مشخص هستند. رنگ تنها نشانگر وضعیت نیست و متن/آیکون نیز نمایش داده می‌شود.

## ورود یک‌باره از Google Sheet

ورودی، URL یک Google Sheet عمومی است. backend فقط hostهای مجاز Google را می‌پذیرد، Sheet ID و tab را استخراج می‌کند و CSV export را با timeout، redirect limit و سقف اندازه دریافت می‌کند تا SSRF و مصرف کنترل‌نشده منابع رخ ندهد.

مراحل:

1. دریافت header و حداکثر نمونه لازم برای پیشنهاد mapping، بدون mutation.
2. انتخاب ستون نام برنامه و نگاشت ستون‌های دیگر به خروجی/مقصد.
3. گروه‌بندی ستون‌هایی مانند «ریلز ۱ در تلگرام» و «ریلز ۱ در یوتیوب» در یک خروجی با دو مقصد.
4. نمایش preview تمام ردیف‌ها با وضعیت ترجمه‌شده، warning و duplicate.
5. انتخاب per-row برای duplicate: `skip`، `create separately` یا `update statuses`؛ پیش‌فرض `skip` است. update فقط پس از انتخاب صریح `program_id` و مشاهده diff مجاز است.
6. تولید preview token محدود و منقضی که به hash دقیق snapshot CSV، mapping، انتخاب برنامه/خروجی و تصمیم‌های کاربر متصل است.
7. commit فقط همان snapshot تأییدشده را مصرف می‌کند؛ Sheet دوباره به‌عنوان منبع commit خوانده نمی‌شود. expiry یا mismatch نیازمند preview جدید است.
8. import تراکنشی و ثبت batch/result.

نگاشت پیش‌فرض وضعیت‌های شیت:

- cell خالی: تولید `not_started` یا مقصد `waiting_for_production`.
- `کامل` در ستون مقصد: publication `published` با `created_source=imported` و `terminal_owner=imported`، بدون ادعای permalink.
- `کامل` در ستون تولید/thumbnail: production `ready`.
- `منتشر نشود`: publication `do_not_publish` با reason «واردشده از شیت».
- `اصلاح شود`: production `changes_requested` با reason «واردشده از شیت» و مقصد متناظر `waiting_for_production`.
- مقدار ناشناخته: mutation ندارد و در preview برای نگاشت دستی علامت‌گذاری می‌شود.

عنوان برای duplicate detection با trim، یکسان‌سازی فاصله و ارقام فارسی/عربی و Unicode normalization مقایسه می‌شود. اگر بیش از یک candidate وجود داشته باشد، update تا انتخاب ID دقیق مسدود است. تطبیق خروجی موجود نیز در preview با انتخاب ID انجام می‌شود و نام به‌تنهایی کلید update نیست. فقط سلول‌های دارای تصمیم صریح تغییر می‌کنند؛ غیبت ستون/سلول باعث حذف خروجی یا مقصد موجود نمی‌شود. وضعیت imported نمی‌تواند terminal status، تغییر جدیدتر از snapshot یا وضعیت worker را بدون override صریح مدیر و دلیل بازنویسی کند. مقدار ناشناخته تا mapping به وضعیت معتبر یا انتخاب `skip cell`، commit همان ردیف را مسدود می‌کند.

رکورد batch پیش از تراکنش عملیاتی ایجاد می‌شود. ایجاد/به‌روزرسانی برنامه‌ها و وضعیت‌ها در یک تراکنش جداگانه انجام می‌شود. در شکست، آن تراکنش کاملاً rollback و سپس batch/result در تراکنش مستقل با status=`failed` ثبت می‌شود؛ بنابراین failure report حفظ می‌شود ولی داده عملیاتی نیمه‌کاره ایجاد نمی‌شود. فرمول CSV به‌عنوان متن پردازش می‌شود و هیچ expression اجرا نمی‌شود. host مجاز Google پس از هر redirect دوباره اعتبارسنجی می‌شود.

## انتشار خودکار و همگام‌سازی

سرویس workflow یک adapter باریک روی نتیجه worker فعلی دارد؛ منطق provider تکرار نمی‌شود.

- ایجاد target، `workflow_publication_id` را داخل target JSON قرار می‌دهد. تغییر account یک action مشترک است که target keyed را به‌روزرسانی می‌کند و اتصال را حفظ می‌کند.
- نگاشت target به workflow دقیق است: وقتی production!=`ready`، publication غیرپایانی بدون توجه به target در `waiting_for_production` می‌ماند؛ وقتی production=`ready` است، `draft|approved -> ready`، `scheduled -> scheduled`، claim فعال worker به `publishing`، `published -> published` و `failed -> failed` نگاشت می‌شوند. `cancelled` فقط وقتی از action suppress workflow آمده باشد به `do_not_publish` نگاشت می‌شود. keyed target می‌تواند پیش از آماده‌شدن تولید ساخته شود، اما schedule/publish آن تا production=`ready` مسدود است.
- برای publication خودکار متصل، `platformTargets.publish_at_utc` مالک canonical زمان‌بندی و `workflow_publications.scheduled_at` mirror query-friendly آن است. تمام schedule/rescheduleها از service مشترک می‌گذرند، target و mirror را هماهنگ می‌کنند و API تقویم برای target مشخص کار می‌کند؛ reschedule کل content مجاز نیست. زمان content-level برای سازگاری legacy از نزدیک‌ترین target معلق مشتق می‌شود.
- `scheduled`، `publishing`، `published`، `failed`، external ID، permalink و خطای safe از target keyed منعکس می‌شوند.
- هر update خودکار با source=`automatic` و event مستقل ثبت می‌شود.
- شکست یک مقصد روی تولید یا مقصدهای دیگر اثر ندارد.
- target قدیمی که به deliverable وصل نیست رفتار فعلی خود را حفظ می‌کند.
- publication دستی بدون target مجاز است، اما عملیات «انتشار اکنون» تا انتخاب account و اتصال content غیرفعال می‌ماند.
- Instagram تا اتصال معتبر Meta فقط دستی/قابل مشاهده است.
- Telegram در نسخه اول دستی است و Telegram storage message نشانه publication نیست.

به‌دلیل Telegram-first بودن `content`، تغییر target و event workflow نمی‌توانند یک تراکنش PostgreSQL واحد باشند. ترتیب قطعی این است: repository موجود ابتدا target authoritative را به‌روزرسانی می‌کند، سپس adapter idempotent با key پایدار workflow را منعکس می‌کند. اگر مرحله دوم شکست بخورد، job reconciliation targetهای keyed را دوباره اعمال می‌کند. mutationهای صرفاً workflow شامل entity، event و notification همچنان در یک تراکنش‌اند.

## اعلان‌ها

اعلان داخل سامانه برای تمام eventهای عملی بلافاصله ایجاد می‌شود. Telegram notification در موارد زیر ارسال می‌شود:

- واگذاری یا تغییر مسئول خروجی.
- درخواست اصلاح.
- 24 ساعت مانده به موعد خروجی ناقص.
- عبور از موعد؛ سپس در خلاصه روزانه تا زمان رفع.
- شکست انتشار.

خلاصه روزانه ساعت 09:00 در timezone `Asia/Tehran` برای هر کاربر فقط موارد قابل اقدام همان کاربر را ارسال می‌کند. اگر کاربر Telegram identity قابل استفاده ندارد، اعلان داخل سامانه حفظ و وضعیت Telegram به `skipped_no_recipient` ثبت می‌شود. متن اعلان secret، credential یا raw provider response ندارد.

تغییر موعد، اعلان زمان‌بندی‌شده قبلی را با idempotency key لغو و هشدار جدید ایجاد می‌کند. archive برنامه همه اعلان‌های آینده آن را cancel می‌کند، اما publication خارجی یا schedule موجود را خودکار لغو نمی‌کند و تا لغو صریح schedule، archive مسدود است. کاربر یا account غیرفعال warning قابل اقدام برای مدیر ایجاد می‌کند.

## API و سرویس‌ها

routeها thin هستند و validation، authorization و transaction در service/repository مشترک انجام می‌شود. مجموعه endpointهای موردنیاز:

- list/create/update/archive برنامه‌ها.
- list/create/update/reorder/cancel خروجی‌ها.
- update وضعیت تولید با reason و expected version.
- create/update وضعیت مقصد، schedule، retry و manual publish.
- attach/detach `content`.
- CRUD/archive الگوها و itemها.
- Sheet preview و commit import با preview token محدود و منقضی.
- list/mark-read اعلان‌ها.
- list event history.

ورودی‌های list دارای pagination پایدار، search و filterهای server-side هستند. mutationها expected version می‌پذیرند و در conflict پاسخ `409` با وضعیت جاری برمی‌گردانند. پاسخ خطا از helperهای فعلی و پیام فارسی عملی استفاده می‌کند.

## دسترسی

permissionهای مستقل اضافه می‌شوند و roleهای موجود به آن‌ها نگاشت می‌شوند:

- `view_workflow`
- `manage_programs`
- `update_assigned_deliverables`
- `manage_publications`
- `manage_workflow_templates`
- `import_workflow`

مدیر workflow همه برنامه‌ها و assignmentها را مدیریت می‌کند. مسئول خروجی فقط وضعیت تولید، فایل و توضیح خروجی واگذارشده را تغییر می‌دهد. ناشر مقصدها، schedule و retry را مدیریت می‌کند. `manage_publications` علاوه بر permission با `allowedAccountIds` فعلی محدود می‌شود؛ accountless Telegram نیازمند همین permission و دسترسی به برنامه است. مشاهده‌گر mutation ندارد.

مسئول خروجی فقط می‌تواند content جدید خود یا contentای را که صریحاً مجاز به مشاهده/ویرایش آن است attach کند. attach به content archived ممنوع و detach نیازمند expected version است. upload فایل از permissionهای فعلی محتوا تبعیت می‌کند و permission workflow آن را دور نمی‌زند.

تمام query و mutationها سمت سرور scope می‌شوند. UI فقط قابلیت‌های مجاز را نمایش می‌دهد، اما معیار امنیت نیست. reason، actor و source از session/server تعیین می‌شوند و actor ارسالی مرورگر پذیرفته نمی‌شود.

## تراکنش، concurrency و audit

- برای mutationهای صرفاً workflow، تغییر entity، event و notification enqueue در یک تراکنش انجام می‌شود. mutationهای target-linked از ترتیب Telegram-first و reconciliation تعریف‌شده در بخش انتشار پیروی می‌کنند.
- optimistic version مانع lost update می‌شود.
- reorder خروجی‌ها تمام sort orderها را در یک تراکنش اعتبارسنجی و ذخیره می‌کند.
- import نهایی all-or-nothing است؛ preview هیچ داده عملیاتی ایجاد نمی‌کند، جز metadata موقت با expiry.
- notification worker با claim/lease و idempotency key کار می‌کند.
- eventها append-only هستند و payload قبل/بعد فقط فیلدهای business-safe دارد.
- archive به‌جای hard delete برای برنامه/template استفاده می‌شود. خروجی دارای history یا content نیز hard delete نمی‌شود و cancel/archive می‌گردد.
- race بین manual publish و worker با claim اتمیک publication و expected version حل می‌شود؛ فقط دارنده claim می‌تواند نتیجه را ثبت کند.
- archive شدن content متصل warning ایجاد می‌کند و انتشار جدید را مسدود می‌کند، اما history و وضعیت انتشار قبلی حفظ می‌شود.

## مدیریت خطا

- خطای اعتبارسنجی field-level و قابل اصلاح است.
- conflict ویرایش، داده کاربر دیگر را overwrite نمی‌کند و امکان refresh/reapply می‌دهد.
- خطای provider فقط publication مربوط را `failed` می‌کند و خطای secret-safe نمایش می‌دهد.
- خطای Telegram notification عملیات اصلی را rollback نمی‌کند؛ notification retry می‌شود.
- خطای Sheet fetch، parsing یا mapping قبل از mutation گزارش می‌شود.
- import ناموفق batch failure و گزارش ردیف‌ها را ثبت می‌کند، اما برنامه نیمه‌کاره باقی نمی‌گذارد.
- داده قدیمی `content` و انتشارهای بدون workflow بدون تغییر به کار ادامه می‌دهند.

## آزمون‌ها

### واحد

- transitionهای مجاز و غیرمجاز تولید/انتشار.
- reason اجباری و حفاظت وضعیت پایانی دستی.
- محاسبه deterministic پیشرفت و complete state.
- انتخاب اقدام بعدی با اولویت و tie-break پایدار.
- normalization عنوان و نگاشت statusهای فارسی شیت.
- idempotency key اعلان و زمان‌بندی timezone.

### integration

- CRUD برنامه، خروجی، مقصد و template با permissionهای مختلف.
- mutation هم‌زمان و پاسخ 409.
- اتصال content و انعکاس نتیجه worker بدون تغییر targetهای legacy.
- اتصال پایدار target با `workflow_publication_id`، تغییر account و reconciliation پس از شکست adapter.
- schedule target-aware و عدم تغییر targetهای دیگر همان content.
- شکست جزئی یک مقصد و ادامه سایر مقصدها.
- preview بدون mutation، snapshot/hash، duplicate update بر اساس ID، rollback کامل import و حفظ failure report.
- archive بدون حذف history.
- snapshot بودن template و عدم تغییر برنامه‌های قبلی پس از ویرایش template.
- account scope ناشر، Telegram accountless و جلوگیری از attach محتوای غیرمجاز/archived.
- اعلان Telegram mock و جلوگیری از ارسال تکراری.

### رابط کاربری

- matrix filters، جست‌وجو و expanded rows.
- quick edit، reason dialog و نمایش conflict.
- create from template و خروجی‌های قابل تغییر.
- import mapping/preview/error states.
- desktop و mobile layout، keyboard navigation، focus و نام قابل دسترس کنترل‌ها.

تست‌ها از provider و Telegram mock استفاده می‌کنند و به credential یا API تولید وابسته نیستند.

## تقسیم پیاده‌سازی

دامنه در چهار plan مستقل اجرا می‌شود و هر plan migration، API، تست و معیار پذیرش مستقل دارد:

1. **هسته workflow و RBAC:** schema، state engine، progress/next action، repository/service، audit، permissions و API پایه برنامه/خروجی/مقصد/template.
2. **اتاق انتشار و صفحات مدیریت:** ماتریس responsive، صفحه برنامه، quick edit، template UI، conflict/error/accessibility states.
3. **ورود Google Sheet:** fetch امن، mapping، snapshot preview، duplicate diff، commit تراکنشی و failure report.
4. **اتصال انتشار و اعلان‌ها:** stable target key، target-aware scheduling/calendar، worker adapter/reconciliation، notification queue و Telegram delivery.

هر plan فقط پس از پاس‌شدن تست و معیارهای خودش وارد plan بعدی می‌شود. UI در plan دوم می‌تواند وضعیت‌ها را دستی مدیریت کند و به plan سوم یا چهارم وابستگی runtime ندارد.

## مهاجرت و عرضه

1. افزودن جداول، indexها و permissionها بدون تغییر رفتار `content` موجود.
2. استقرار API و serviceها پشت permission؛ بدون نمایش navigation عمومی.
3. فعال‌سازی برنامه/template و اتاق انتشار ابتدا برای مدیران و سپس مسئولان/ناشران.
4. ورود یک batch آزمایشی از Sheet در محیط تولید پس از backup.
5. مقایسه تعداد برنامه‌ها و statusها با Sheet و اصلاح mapping در preview، نه با SQL دستی.
6. اتصال تدریجی خروجی‌ها به content موجود و فعال‌سازی target key، تقویم target-aware و reconciliation.
7. فعال‌سازی اعلان‌های Telegram پس از تست recipient و idempotency.

Migration فقط additive است. rollback application می‌تواند UI/route جدید را غیرفعال کند و جداول جدید را برای بازیابی بعدی نگه دارد. داده واردشده تا تأیید کامل Sheet حذف نمی‌شود.

## معیارهای پذیرش

- مدیر می‌تواند برنامه را از template بسازد و خروجی‌ها را قبل و بعد از ساخت تغییر دهد.
- تغییر template برنامه‌های ساخته‌شده قبلی را تغییر نمی‌دهد.
- هر خروجی مسئول، موعد، وضعیت تولید و مقصدهای مستقل دارد.
- اتاق انتشار برنامه‌های نیازمند اصلاح، خطادار و عقب‌افتاده را در یک نگاه نشان می‌دهد.
- پیشرفت و اقدام بعدی طبق قواعد سند و بدون drift محاسبه می‌شوند.
- مسئول فقط خروجی واگذارشده و ناشر فقط وضعیت مقصدهای مجاز را تغییر می‌دهد.
- ناشر نمی‌تواند publication حسابی خارج از `allowedAccountIds` را تغییر دهد و assignee نمی‌تواند content غیرمجاز را attach کند.
- دلیل اصلاح، لغو و منتشر نشود اجباری و در history قابل مشاهده است.
- وضعیت worker برای محتوای متصل خودکار منعکس می‌شود و وضعیت پایانی دستی را بی‌اجازه بازنویسی نمی‌کند.
- target keyed با تغییر account اتصال خود را حفظ می‌کند و targetهای legacy یا نامرتبط تغییر نمی‌کنند.
- زمان‌بندی publication متصل در target canonical است و reschedule فقط target انتخابی را تغییر می‌دهد.
- Sheet فعلی با preview وارد می‌شود؛ ردیف تکراری و مقدار ناشناخته قبل از commit مشخص‌اند.
- commit فقط snapshot/hash تأییدشده preview را مصرف می‌کند و update تکراری بدون انتخاب program/deliverable ID ممکن نیست.
- import شکست‌خورده هیچ برنامه نیمه‌کاره ایجاد نمی‌کند.
- import شکست‌خورده failure report را با batch ناموفق حفظ می‌کند.
- فایل‌ها در import منتقل نمی‌شوند و بعداً به خروجی متصل می‌شوند.
- هشدار داشبورد و Telegram برای موعد، تأخیر، اصلاح و خطای انتشار تکراری ارسال نمی‌شود.
- رابط در دسکتاپ و موبایل قابل استفاده و کنترل‌های اصلی keyboard-accessible هستند.
- `content` و targetهای قدیمی که به workflow متصل نیستند بدون regression کار می‌کنند.
- workflow در PostgreSQL authoritative است، در backup/restore باقی می‌ماند و Telegram rebuild آن را حذف یا بازنویسی نمی‌کند.
- publication تلگرام در نسخه اول accountless و دستی است و upload در storage آن را منتشرشده نمی‌کند.
- برنامه بدون واحد فعال کامل نیست و خروجی بدون مقصد پس از تکمیل تولید، کامل محسوب می‌شود.
- conflict version پاسخ 409 می‌دهد و entity/event/notification mutationهای صرفاً workflow اتمیک‌اند.
- archive برنامه با schedule فعال مسدود و اعلان‌های آینده پس از archive لغو می‌شوند.
- گذارهای خارج از جدول actionها رد می‌شوند؛ regression پس از publication به خروجی جایگزین نیاز دارد و terminal override فقط با permission مدیر و دلیل انجام می‌شود.
