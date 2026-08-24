export const UNKNOWN_LABEL_FA = "مورد ناشناخته";

function labelFrom(map: Readonly<Record<string, string>>, value: unknown): string {
  return typeof value === "string" && map[value] ? map[value] : UNKNOWN_LABEL_FA;
}

const PLATFORM_LABELS = {
  youtube: "YouTube",
  instagram: "Instagram",
  telegram: "Telegram",
} as const;

const ROLE_LABELS = {
  owner: "مالک",
  manager: "مدیر",
  editor: "ویرایشگر",
  publisher: "ناشر",
  analyst: "تحلیل‌گر",
  viewer: "بیننده",
} as const;

const PERMISSION_LABELS = {
  view_content: "مشاهده محتوا",
  upload_content: "بارگذاری محتوا",
  edit_content: "ویرایش محتوا",
  delete_content: "حذف محتوا",
  submit_for_review: "ارسال برای بازبینی",
  approve_content: "تأیید محتوا",
  schedule_content: "زمان‌بندی محتوا",
  publish_now: "انتشار فوری",
  manage_accounts: "مدیریت حساب‌ها",
  manage_users: "مدیریت کاربران",
  view_analytics: "مشاهده آمار",
  export_data: "خروجی داده‌ها",
  manage_settings: "مدیریت تنظیمات",
  view_workflow: "مشاهده گردش کار",
  manage_programs: "مدیریت برنامه‌ها",
  update_assigned_deliverables: "ویرایش خروجی‌های محول‌شده",
  manage_publications: "مدیریت انتشارها",
  manage_workflow_templates: "مدیریت الگوهای گردش کار",
  import_workflow: "ورود گردش کار",
  view_mail: "مشاهده ایمیل",
  manage_mail: "مدیریت ایمیل",
  view_content_room: "مشاهده اتاق محتوا",
  update_assigned_content: "ویرایش محتوای محول‌شده",
  manage_content_room: "مدیریت اتاق محتوا",
  manage_channels: "مدیریت کانال‌ها",
  view_dashboard: "مشاهده داشبورد",
  view_assets: "مشاهده فایل‌ها",
  view_archive: "مشاهده بایگانی",
} as const;

const STATUS_LABELS = {
  draft: "پیش‌نویس",
  uploaded: "بارگذاری‌شده",
  in_review: "در حال بررسی",
  changes_requested: "نیازمند اصلاح",
  approved: "تأییدشده",
  rejected: "ردشده",
  archived: "بایگانی‌شده",
  pending: "در انتظار",
  mock: "حالت آزمایشی",
  connected: "متصل",
  disconnected: "متصل نیست",
  error: "خطا",
  ok: "سالم",
  degraded: "ناپایدار",
  offline: "آفلاین",
  not_started: "شروع‌نشده",
  in_progress: "در حال آماده‌سازی",
  ready_for_review: "آماده بازبینی",
  ready: "آماده انتشار",
  cancelled: "لغوشده",
  waiting_for_production: "منتظر آماده‌شدن",
  scheduled: "زمان‌بندی‌شده",
  publishing: "در حال انتشار",
  published: "منتشرشده",
  failed: "ناموفق",
  do_not_publish: "منتشر نشود",
  imported: "واردشده",
  editing_youtube: "در حال تدوین YouTube",
  copyright_fix: "رفع کپی‌رایت",
  highlight_done: "هایلایت آماده",
  reel_done: "ریل آماده",
  cover_ready: "کاور آماده",
  ready_to_send: "آماده ارسال",
} as const;

const NEXT_ACTION_LABELS = {
  changes_requested: "اصلاح خروجی",
  publication_failed: "رفع خطای انتشار",
  overdue_production: "رسیدگی به تأخیر تولید",
  overdue_publication: "رسیدگی به تأخیر انتشار",
  publication_ready: "انتشار خروجی آماده",
  production_due: "رسیدگی به موعد تولید",
  overdue: "رسیدگی به خروجی‌های معوق",
} as const;

const WORKFLOW_ACTION_LABELS = {
  created: "ایجاد",
  updated: "به‌روزرسانی",
  archived: "بایگانی",
  unarchived: "خروج از بایگانی",
  reordered: "تغییر ترتیب",
  created_program: "ایجاد برنامه",
  updated_program: "ویرایش برنامه",
  create_deliverable: "ایجاد خروجی",
  update_deliverable: "ویرایش خروجی",
  transition_production: "تغییر وضعیت تولید",
  transition_publication: "تغییر وضعیت انتشار",
  start: "شروع تولید",
  submit_review: "ارسال برای بازبینی",
  request_changes: "درخواست اصلاح",
  approve: "تأیید تولید",
  reopen: "بازگشایی",
  cancel: "لغو",
  restore: "بازگردانی",
  prepare: "آماده‌سازی",
  schedule: "زمان‌بندی",
  claim_publish: "شروع انتشار",
  publish_succeeded: "انتشار موفق",
  publish_failed: "انتشار ناموفق",
  cancel_schedule: "لغو زمان‌بندی",
  suppress: "منتشر نشود",
  restore_suppressed: "بازگردانی انتشار",
  manual_publish: "ثبت دستی انتشار",
  override_terminal_status: "اصلاح وضعیت پایانی",
  attach_content: "اتصال محتوا",
  detach_content: "جداسازی محتوا",
} as const;

const DELIVERABLE_KIND_LABELS = {
  youtube_full: "ویدئوی کامل YouTube",
  highlight: "هایلایت",
  reel: "ریل",
  cover: "کاور",
  video: "ویدئو",
  image: "تصویر",
} as const;

const NOTIFICATION_EVENT_LABELS = {
  assignment: "محول‌شدن خروجی",
  assignee_changed: "تغییر مسئول خروجی",
  failure: "خطای انتشار",
  publish_failed: "انتشار ناموفق",
  due_24h: "یادآوری موعد ۲۴ ساعت آینده",
  due24h: "یادآوری موعد ۲۴ ساعت آینده",
  overdue_daily: "یادآوری روزانه تأخیر",
} as const;

const AUDIT_ACTION_LABELS = {
  ...WORKFLOW_ACTION_LABELS,
  account_connected_oauth: "اتصال حساب با OAuth",
  account_connected_mock: "ایجاد حساب آزمایشی",
  account_updated: "به‌روزرسانی حساب",
  account_disconnected: "قطع اتصال حساب",
  account_analytics_synced: "همگام‌سازی آمار حساب",
  user_created: "ایجاد کاربر",
  user_updated: "به‌روزرسانی کاربر",
  user_deactivated: "غیرفعال‌سازی کاربر",
  user_permissions_updated: "به‌روزرسانی دسترسی‌های کاربر",
  owner_bootstrap: "راه‌اندازی مالک",
  login: "ورود",
  mini_app_login: "ورود از برنامه Telegram",
  content_rescheduled: "تغییر زمان محتوا",
  content_bulk_rescheduled: "تغییر گروهی زمان محتوا",
  settings_updated: "به‌روزرسانی تنظیمات",
  telegram_topic_mapped: "نگاشت تاپیک Telegram",
  telegram_topic_updated: "به‌روزرسانی تاپیک Telegram",
  telegram_topic_deleted: "حذف تاپیک Telegram",
  telegram_test_connection: "آزمایش اتصال Telegram",
  rebuild_index: "بازسازی نمایه",
  status_changed: "تغییر وضعیت",
  file_updated: "به‌روزرسانی فایل",
  sent_to_publication: "ارسال برای انتشار",
  created_from_content_room: "ایجاد از اتاق محتوا",
  created_from_template: "ایجاد از الگو",
  instantiate_template: "ساخت برنامه از الگو",
  publish_attempt: "تلاش برای انتشار",
  workflow_publish_failed: "خطای انتشار گردش کار",
  workflow_publish_failed_reflect: "ثبت خطای انتشار در گردش کار",
  reconciliation_missing_content: "محتوای همگام‌سازی یافت نشد",
  reconciliation_missing_target: "مقصد همگام‌سازی یافت نشد",
  reconciliation_noop_terminal_protected: "حفظ وضعیت پایانی",
  reconciliation_reflect: "همگام‌سازی وضعیت",
  noop_terminal_protected: "حفظ وضعیت پایانی",
  adapter_update: "به‌روزرسانی مقصد",
} as const;

const ENTITY_TYPE_LABELS = {
  content: "محتوا",
  content_product: "محصول محتوا",
  content_part: "بخش محتوا",
  social_account: "حساب شبکه اجتماعی",
  user: "کاربر",
  settings: "تنظیمات",
  telegram_topic: "تاپیک Telegram",
  workflow: "گردش کار",
  workflow_program: "برنامه گردش کار",
  workflow_deliverable: "خروجی گردش کار",
  workflow_publication: "انتشار گردش کار",
  workflow_template: "الگوی گردش کار",
} as const;

const SOURCE_LABELS = {
  manual: "دستی",
  automatic: "خودکار",
  imported: "واردشده",
  worker: "سامانه انتشار",
  api: "API",
  sheet_import: "ورود از شیت",
  content_room: "اتاق محتوا",
} as const;

const FIELD_LABELS = {
  status: "وضعیت",
  productionStatus: "وضعیت تولید",
  publicationStatus: "وضعیت انتشار",
  title: "عنوان",
  name: "نام",
  description: "توضیحات",
  notes: "یادداشت‌ها",
  reason: "دلیل",
  assigneeUserId: "مسئول",
  ownerUserId: "مالک",
  dueAt: "موعد",
  scheduledAt: "زمان انتشار",
  publishedAt: "زمان انتشار نهایی",
  platform: "پلتفرم",
  kind: "نوع خروجی",
  contentId: "محتوا",
  active: "فعال",
  archivedAt: "زمان بایگانی",
  version: "نسخه",
  sortOrder: "ترتیب",
  terminalOwner: "ثبت‌کننده وضعیت پایانی",
  externalId: "شناسه بیرونی",
  permalink: "پیوند انتشار",
  lastErrorCode: "کد خطا",
  lastErrorMessage: "پیام خطا",
} as const;

export const platformLabelFa = (value: unknown) => labelFrom(PLATFORM_LABELS, value);
export const roleLabelFa = (value: unknown) => labelFrom(ROLE_LABELS, value);
export const permissionLabelFa = (value: unknown) => labelFrom(PERMISSION_LABELS, value);
export const statusLabelFa = (value: unknown) => labelFrom(STATUS_LABELS, value);
export const workflowNextActionLabelFa = (value: unknown) => labelFrom(NEXT_ACTION_LABELS, value);
export const workflowActionLabelFa = (value: unknown) => labelFrom(WORKFLOW_ACTION_LABELS, value);
export const deliverableKindLabelFa = (value: unknown) => labelFrom(DELIVERABLE_KIND_LABELS, value);
export const notificationEventLabelFa = (value: unknown) => labelFrom(NOTIFICATION_EVENT_LABELS, value);
export const auditActionLabelFa = (value: unknown) => labelFrom(AUDIT_ACTION_LABELS, value);
export const entityTypeLabelFa = (value: unknown) => labelFrom(ENTITY_TYPE_LABELS, value);
export const sourceLabelFa = (value: unknown) => labelFrom(SOURCE_LABELS, value);
export const fieldLabelFa = (value: unknown) => labelFrom(FIELD_LABELS, value);

export function oauthErrorMessageFa(code: unknown): string {
  if (code === "missing_code") return "پاسخ اتصال ناقص بود. دوباره اتصال حساب را آغاز کنید.";
  if (code === "unknown_platform") return "این پلتفرم برای اتصال پشتیبانی نمی‌شود.";
  return "اتصال حساب انجام نشد. دوباره تلاش کنید.";
}
