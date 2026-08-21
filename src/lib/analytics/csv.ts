import type { AnalyticsExportRow } from "@/lib/analytics/types";
import { formatTehranGregorianDate } from "@/lib/date/jalali";

export const ANALYTICS_CSV_HEADERS = [
  "تاریخ",
  "نوع",
  "کانال",
  "شناسه ویدیو",
  "عنوان",
  "بازدید",
  "پسندیدن",
  "نظر",
  "اشتراک‌گذاری",
  "زمان تماشا (دقیقه)",
  "میانگین مدت مشاهده (ثانیه)",
  "تعداد مشترکین",
  "مشترکین جدید",
  "مشترکین از دست رفته",
  "نرخ تعامل (%)",
] as const;

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safeText = typeof value === "string" && /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replaceAll('"', '""')}"` : safeText;
}

export function encodeAnalyticsCsv(rows: readonly AnalyticsExportRow[]): string {
  const records = rows.map((row) => [
    formatTehranGregorianDate(row.date),
    row.scope,
    row.channelTitle,
    row.videoId,
    row.title,
    row.views,
    row.likes,
    row.comments,
    row.shares,
    row.watchTimeMinutes,
    row.averageViewDurationSeconds,
    row.subscribersTotal,
    row.subscribersGained,
    row.subscribersLost,
    row.engagementRate,
  ].map(csvCell).join(","));
  return `\uFEFF${ANALYTICS_CSV_HEADERS.join(",")}\r\n${records.length ? `${records.join("\r\n")}\r\n` : ""}`;
}
