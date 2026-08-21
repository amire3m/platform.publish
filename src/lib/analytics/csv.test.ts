import { describe, expect, it } from "vitest";

import { ANALYTICS_CSV_HEADERS, encodeAnalyticsCsv } from "@/lib/analytics/csv";
import type { AnalyticsExportRow } from "@/lib/analytics/types";

function row(overrides: Partial<AnalyticsExportRow> = {}): AnalyticsExportRow {
  return {
    scope: "content",
    date: new Date("2026-08-20T20:30:00.000Z"),
    accountId: "account-1",
    channelId: "channel-1",
    channelTitle: "کانال, نمونه",
    contentId: null,
    videoId: "video-1",
    title: "عنوان \"اول\"\r\nخط دوم",
    views: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    watchTimeMinutes: 240,
    averageViewDurationSeconds: 45,
    subscribersTotal: null,
    subscribersGained: 0,
    subscribersLost: 0,
    engagementRate: 13,
    fetchedAt: new Date("2026-08-21T08:00:00.000Z"),
    ...overrides,
  };
}

describe("analytics CSV", () => {
  it("emits a UTF-8 BOM and stable Persian headers", () => {
    const csv = encodeAnalyticsCsv([]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(`${ANALYTICS_CSV_HEADERS.join(",")}\r\n`);
    expect(ANALYTICS_CSV_HEADERS).toEqual([
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
    ]);
  });

  it("uses CRLF records and RFC 4180 escaping for commas, quotes, and line breaks", () => {
    const csv = encodeAnalyticsCsv([row()]);

    expect(csv).toContain('"کانال, نمونه"');
    expect(csv).toContain('"عنوان ""اول""\r\nخط دوم"');
    expect(csv.split("\r\n")[1]).toContain("2026-08-21,content");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it.each(["=1+1", " +SUM(A1:A2)", "\t@cmd", "-danger"])(
    "neutralizes textual formula cell %j before RFC escaping",
    (title) => {
      const csv = encodeAnalyticsCsv([row({ title })]);

      expect(csv).toContain(`'${title}`);
    },
  );

  it("keeps trusted negative numeric metrics numeric", () => {
    const record = encodeAnalyticsCsv([row({ title: "normal", subscribersLost: -2 })]).split("\r\n")[1];

    expect(record).toContain(",-2,");
    expect(record).not.toContain("'-2");
  });
});
