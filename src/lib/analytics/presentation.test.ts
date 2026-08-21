import { describe, expect, it } from "vitest";
import {
  channelAverageMetrics,
  combinedInteractionsChange,
  formatAnalyticsDate,
  formatAnalyticsNumber,
  formatComparison,
  formatFreshness,
  formatWatchMinutes,
  safeThumbnailUrl,
} from "./presentation";
import type { ContentAnalytics, MetricTotals } from "./types";

const totals = (overrides: Partial<MetricTotals> = {}): MetricTotals => ({
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  watchTimeMinutes: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  subscriberGrowth: 0,
  engagementRate: 0,
  ...overrides,
});

describe("analytics presentation", () => {
  describe("formatAnalyticsNumber", () => {
    it("formats finite values with Persian digits in full and compact forms", () => {
      expect(formatAnalyticsNumber(1_234)).toBe("۱٬۲۳۴");
      expect(formatAnalyticsNumber(1_250_000, "compact")).toBe("۱٫۳ میلیون");
    });

    it("shows missing data instead of leaking NaN or Infinity", () => {
      expect(formatAnalyticsNumber(Number.NaN)).toBe("بدون داده");
      expect(formatAnalyticsNumber(Number.POSITIVE_INFINITY, "compact")).toBe("بدون داده");
      expect(formatAnalyticsNumber(null)).toBe("بدون داده");
    });
  });

  describe("formatWatchMinutes", () => {
    it("uses minutes below one hour and readable hours above it", () => {
      expect(formatWatchMinutes(45)).toBe("۴۵ دقیقه");
      expect(formatWatchMinutes(90)).toBe("۱ ساعت و ۳۰ دقیقه");
      expect(formatWatchMinutes(120)).toBe("۲ ساعت");
    });

    it("does not fabricate invalid watch time", () => {
      expect(formatWatchMinutes(Number.NaN)).toBe("بدون داده");
    });
  });

  describe("formatComparison", () => {
    it.each([
      [null, "بدون داده مقایسه‌ای", "neutral"],
      [12.5, "۱۲٫۵٪ رشد", "positive"],
      [-8, "۸٪ کاهش", "negative"],
      [0, "بدون تغییر", "neutral"],
    ] as const)("maps %s to a semantic label and tone", (value, label, tone) => {
      expect(formatComparison(value)).toEqual({ label, tone });
    });
  });

  describe("formatFreshness", () => {
    it("describes every freshness state and includes a Jalali last-sync time", () => {
      const syncedAt = "2026-03-21T08:30:00.000Z";

      expect(formatFreshness("fresh", syncedAt)).toEqual({
        label: "به‌روز",
        description: "آخرین همگام‌سازی: ۱ فروردین ۱۴۰۵ ساعت ۱۲:۰۰",
        tone: "positive",
      });
      expect(formatFreshness("stale", syncedAt).description).toContain("داده‌ها قدیمی‌اند");
      expect(formatFreshness("error", null)).toEqual({
        label: "خطا در همگام‌سازی",
        description: "دریافت داده کامل نشد. دوباره همگام‌سازی کنید.",
        tone: "negative",
      });
      expect(formatFreshness("never", null)).toEqual({
        label: "هنوز همگام نشده",
        description: "برای دریافت نخستین آمار، همگام‌سازی را شروع کنید.",
        tone: "warning",
      });
    });
  });

  it("formats chart dates through the central Tehran/Jalali date layer", () => {
    expect(formatAnalyticsDate("2026-03-20T21:00:00.000Z")).toBe("۱ فروردین");
  });

  it.each([
    ["https://i.ytimg.com/example.jpg", "https://i.ytimg.com/example.jpg"],
    ["http://i.ytimg.com/example.jpg", "http://i.ytimg.com/example.jpg"],
    ["javascript:alert(1)", null],
    ["data:image/svg+xml,bad", null],
    ["not a url", null],
    [null, null],
  ])("accepts only http/https thumbnail URLs", (input, expected) => {
    expect(safeThumbnailUrl(input)).toBe(expected);
  });

  it("compares combined comments and shares from period totals", () => {
    expect(combinedInteractionsChange(
      totals({ comments: 80, shares: 20 }),
      totals({ comments: 20, shares: 30 }),
    )).toBe(100);
  });

  it("selects channel-average values while preserving content-versus-average differences", () => {
    const comparison = {
      content: totals({ views: 100, comments: 8 }),
      channelAverage: totals({ views: 250, comments: 20 }),
      percentageDifferences: {
        views: -60,
        likes: null,
        comments: -60,
        shares: null,
        watchTimeMinutes: null,
        subscriberGrowth: null,
        engagementRate: null,
      },
    } satisfies ContentAnalytics["channelAverageComparison"];

    expect(channelAverageMetrics(comparison)).toEqual({
      totals: comparison.channelAverage,
      percentageChanges: comparison.percentageDifferences,
    });
  });
});
