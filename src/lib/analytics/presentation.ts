import {
  formatJalaliDateTime,
  JALALI_MONTH_LABELS,
  toPersianDigits,
  utcToJalaliParts,
} from "@/lib/date/jalali";
import type { AnalyticsFreshnessState, ContentAnalytics, MetricTotals } from "./types";

export type SemanticTone = "positive" | "negative" | "warning" | "neutral";

const fullNumber = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat("fa-IR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatAnalyticsNumber(
  value: number | null | undefined,
  style: "full" | "compact" = "full",
): string {
  if (value == null || !Number.isFinite(value)) return "بدون داده";
  return (style === "compact" ? compactNumber : fullNumber).format(value).replace(/\u00a0/g, " ");
}

export function formatWatchMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "بدون داده";
  const totalMinutes = Math.max(0, Math.round(value));
  if (totalMinutes < 60) return `${formatAnalyticsNumber(totalMinutes)} دقیقه`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `${formatAnalyticsNumber(hours)} ساعت`
    : `${formatAnalyticsNumber(hours)} ساعت و ${formatAnalyticsNumber(minutes)} دقیقه`;
}

export function formatComparison(value: number | null | undefined): {
  label: string;
  tone: SemanticTone;
} {
  if (value == null || !Number.isFinite(value)) {
    return { label: "بدون داده مقایسه‌ای", tone: "neutral" };
  }
  if (value === 0) return { label: "بدون تغییر", tone: "neutral" };
  const amount = formatAnalyticsNumber(Math.abs(value));
  return value > 0
    ? { label: `${amount}٪ رشد`, tone: "positive" }
    : { label: `${amount}٪ کاهش`, tone: "negative" };
}

export function formatFreshness(
  state: AnalyticsFreshnessState,
  lastSyncedAt: string | Date | null,
): { label: string; description: string; tone: SemanticTone } {
  const lastSync = lastSyncedAt
    ? `آخرین همگام‌سازی: ${formatJalaliDateTime(lastSyncedAt, { withWeekday: false })}`
    : null;

  if (state === "fresh") {
    return {
      label: "به‌روز",
      description: lastSync ?? "داده‌ها به‌روز هستند.",
      tone: "positive",
    };
  }
  if (state === "stale") {
    return {
      label: "نیازمند به‌روزرسانی",
      description: `داده‌ها قدیمی‌اند. دوباره همگام‌سازی کنید.${lastSync ? ` ${lastSync}` : ""}`,
      tone: "warning",
    };
  }
  if (state === "error") {
    return {
      label: "خطا در همگام‌سازی",
      description: lastSync
        ? `دریافت داده کامل نشد. دوباره همگام‌سازی کنید. ${lastSync}`
        : "دریافت داده کامل نشد. دوباره همگام‌سازی کنید.",
      tone: "negative",
    };
  }
  return {
    label: "هنوز همگام نشده",
    description: "برای دریافت نخستین آمار، همگام‌سازی را شروع کنید.",
    tone: "warning",
  };
}

export function formatAnalyticsDate(value: string | Date): string {
  const { jm, jd } = utcToJalaliParts(value);
  return `${toPersianDigits(jd)} ${JALALI_MONTH_LABELS[jm - 1]}`;
}

function percentageChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

export function combinedInteractionsChange(current: MetricTotals, previous: MetricTotals): number | null {
  return percentageChange(current.comments + current.shares, previous.comments + previous.shares);
}

export function channelAverageMetrics(
  comparison: ContentAnalytics["channelAverageComparison"],
): { totals: MetricTotals; percentageChanges: ContentAnalytics["channelAverageComparison"]["percentageDifferences"] } {
  return {
    totals: comparison.channelAverage,
    percentageChanges: comparison.percentageDifferences,
  };
}

export function safeThumbnailUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
