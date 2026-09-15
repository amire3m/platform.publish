import type { BoardChannelId, ChannelProfile } from "./types";

export const BOARD_CHANNELS: ChannelProfile[] = [
  {
    id: "zaviye_no",
    nameFa: "زاویه نو",
    tagline: "برنامه‌های تلویزیونی، گفت‌وگو و مسائل روز",
    color: "#0d9488",
    softBg: "bg-teal-500/10",
    monogram: "ز",
    contentTypes: ["برنامه‌های تلویزیونی مؤسسه", "گفت‌وگوها", "موضوعات اجتماعی", "مسائل روز", "برنامه‌های تحلیلی"],
    status: [
      "نزدیک‌ترین کانال به فعال شدن مانیتایز",
      "رشد اصلی با «فرات» و «قابل توجه»؛ اثر «فرات» به‌مراتب بیشتر",
      "در حال تبدیل شدن به یک برند مستقل",
      "نیچ در حال شکل‌گیری: گفت‌وگو، مسائل اجتماعی و موضوعات روز",
    ],
    progressNote: "نزدیک‌ترین به مانیتایز",
  },
  {
    id: "zed_revayat",
    nameFa: "ضد روایت",
    tagline: "مستند، آموزش و روایت‌های اجتماعی",
    color: "#e11d48",
    softBg: "bg-rose-500/10",
    monogram: "ض",
    contentTypes: ["مستند", "محتوای آموزشی", "روایت‌های اجتماعی", "پرونده‌های موضوعی"],
    status: [
      "حدود نیمی از حداقل‌های رشد و مانیتایز",
      "بخشی از مستندها (موضوعات حساس) امکان انتشار بین‌المللی ندارند",
      "نیازمند تولیدات کم‌هزینه، مستمر و مؤثر",
      "پیشنهاد: نیچ «پرونده اجتماعی» (آسیب‌ها، مسائل روز، تحلیل مستند و گفت‌وگومحور)",
    ],
    progressNote: "حدود ۵۰٪ مسیر مانیتایز",
  },
  {
    id: "tamashin",
    nameFa: "تماشین",
    tagline: "فیلم، سریال و تولیدات نمایشی",
    color: "#d97706",
    softBg: "bg-amber-500/10",
    monogram: "ت",
    contentTypes: ["فیلم", "سریال", "فیلم کوتاه", "تولیدات سینمایی و نمایشی"],
    status: [
      "«مشاور ۱» حدود ۹۰٪ آماده؛ انتشار منوط به تأیید صداوسیما و حذف از کانال‌های دیگر",
      "«مشاور ۲» کاملاً آماده است",
      "پس از فصل اول مشاور ۱، فصل دوم در اولویت است",
    ],
    progressNote: "در انتظار مجوز انتشار",
  },
  {
    id: "iranian_frame",
    nameFa: "Iranian Frame",
    tagline: "سینمای ایران برای مخاطب بین‌المللی",
    color: "#2563eb",
    softBg: "bg-blue-500/10",
    monogram: "IF",
    contentTypes: ["محتوای تصویری و سینمایی", "آثار منتخب بین‌المللی", "فیلم و تولیدات نمایشی", "برندینگ بین‌المللی"],
    status: ["نمایش زبان محتوا، زیرنویس و وضعیت انتشار بین‌المللی", "تمرکز بر مخاطب هدف خارجی"],
    progressNote: "مسیر بین‌المللی",
  },
];

export function channelById(id: string): ChannelProfile | undefined {
  return BOARD_CHANNELS.find((c) => c.id === (id as BoardChannelId));
}

export const EXEC_SUMMARY: string[] = [
  "راه‌اندازی و توسعه چهار کانال یوتیوبی",
  "تدوین و آماده‌سازی بخش عمده محصولات مؤسسه",
  "ایجاد ساختار منظم برای انتشار و آرشیو محتوا",
  "پایش مستمر عملکرد کانال‌ها",
  "بررسی مسیر رسیدن به مانیتایز",
  "امکان اتصال سامانه به تلگرام",
  "ایجاد امکان همکاری و انتشار محتوای بین‌کانالی",
];

export const TAMASHIN_TIMELINE: Array<{ title: string; state: "done" | "active" | "todo" }> = [
  { title: "آماده‌سازی", state: "done" },
  { title: "تدوین", state: "done" },
  { title: "بازبینی", state: "active" },
  { title: "اخذ مجوز", state: "todo" },
  { title: "حذف از کانال‌های دیگر", state: "todo" },
  { title: "آماده‌سازی انتشار", state: "todo" },
  { title: "انتشار فصل اول", state: "todo" },
  { title: "برنامه‌ریزی فصل دوم", state: "todo" },
];

export const PRODUCTION_STATUSES: Array<{ id: string; label: string }> = [
  { id: "not_started", label: "شروع نشده" },
  { id: "editing", label: "در حال تدوین" },
  { id: "edited", label: "تدوین‌شده" },
  { id: "reviewing", label: "در حال بازبینی" },
  { id: "ready", label: "آماده انتشار" },
  { id: "waiting_license", label: "منتظر مجوز" },
  { id: "published", label: "منتشرشده" },
  { id: "paused", label: "متوقف‌شده" },
  { id: "needs_fix", label: "نیازمند اصلاح" },
];

export const DEMO_PROGRAMS = ["فرات", "قابل توجه", "مشاور ۱", "پرونده اجتماعی", "سایر"];
