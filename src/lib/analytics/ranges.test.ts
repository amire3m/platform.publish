import { describe, expect, it } from "vitest";

import {
  aggregateDailyMetrics,
  buildAnalyticsPeriod,
  calculateEngagementRate,
  parseAnalyticsRange,
} from "@/lib/analytics/ranges";

describe("parseAnalyticsRange", () => {
  it.each([
    ["7", 7],
    ["30", 30],
    ["90", 90],
  ] as const)("accepts the supported range %s", (value, expected) => {
    expect(parseAnalyticsRange(value)).toBe(expected);
  });

  it.each(["14", undefined, "seven", "7days", ""])(
    "rejects unsupported or malformed value %s",
    (value) => {
      expect(parseAnalyticsRange(value)).toBeNull();
    },
  );
});

describe("buildAnalyticsPeriod", () => {
  it("builds adjacent half-open periods from complete Tehran calendar days", () => {
    const period = buildAnalyticsPeriod(
      7,
      new Date("2026-08-21T12:00:00Z"),
      "Asia/Tehran",
    );

    expect(period.currentEnd.toISOString()).toBe("2026-08-20T20:30:00.000Z");
    expect(period.currentStart.toISOString()).toBe("2026-08-13T20:30:00.000Z");
    expect(period.previousEnd.toISOString()).toBe("2026-08-13T20:30:00.000Z");
    expect(period.previousStart.toISOString()).toBe("2026-08-06T20:30:00.000Z");
  });

  it.each([
    [
      30,
      "2026-07-21T20:30:00.000Z",
      "2026-06-21T20:30:00.000Z",
    ],
    [
      90,
      "2026-05-22T20:30:00.000Z",
      "2026-02-21T20:30:00.000Z",
    ],
  ] as const)(
    "builds complete Tehran calendar-day periods for range %i",
    (range, expectedCurrentStart, expectedPreviousStart) => {
      const period = buildAnalyticsPeriod(
        range,
        new Date("2026-08-21T12:00:00Z"),
        "Asia/Tehran",
      );

      expect(period.currentEnd.toISOString()).toBe("2026-08-20T20:30:00.000Z");
      expect(period.currentStart.toISOString()).toBe(expectedCurrentStart);
      expect(period.previousEnd.toISOString()).toBe(expectedCurrentStart);
      expect(period.previousStart.toISOString()).toBe(expectedPreviousStart);
    },
  );

  it("uses local midnights when a period crosses a daylight-saving transition", () => {
    const period = buildAnalyticsPeriod(
      7,
      new Date("2026-03-10T12:00:00Z"),
      "America/New_York",
    );

    expect(period.currentEnd.toISOString()).toBe("2026-03-10T04:00:00.000Z");
    expect(period.currentStart.toISOString()).toBe("2026-03-03T05:00:00.000Z");
    expect(period.previousEnd.toISOString()).toBe("2026-03-03T05:00:00.000Z");
    expect(period.previousStart.toISOString()).toBe("2026-02-24T05:00:00.000Z");
  });

  it("rejects an invalid timezone before returning period dates", () => {
    expect(() =>
      buildAnalyticsPeriod(
        7,
        new Date("2026-08-21T12:00:00Z"),
        "Not/A_Timezone",
      ),
    ).toThrow("Invalid timezone: Not/A_Timezone");
  });
});

describe("aggregateDailyMetrics", () => {
  it("totals additive metrics and derives subscriber growth and engagement", () => {
    const totals = aggregateDailyMetrics([
      {
        date: new Date("2026-08-19T20:30:00.000Z"),
        views: 100,
        likes: 10,
        comments: 2,
        shares: 3,
        watchTimeMinutes: 250,
        subscribersGained: 8,
        subscribersLost: 2,
      },
      {
        date: new Date("2026-08-20T20:30:00.000Z"),
        views: 300,
        likes: 20,
        comments: 4,
        shares: 1,
        watchTimeMinutes: 750,
        subscribersGained: 12,
        subscribersLost: 5,
      },
    ]);

    expect(totals).toEqual({
      views: 400,
      likes: 30,
      comments: 6,
      shares: 4,
      watchTimeMinutes: 1000,
      subscribersGained: 20,
      subscribersLost: 7,
      subscriberGrowth: 13,
      engagementRate: 10,
    });
  });
});

describe("calculateEngagementRate", () => {
  it("returns zero when views are zero", () => {
    expect(
      calculateEngagementRate({
        views: 0,
        likes: 4,
        comments: 3,
        shares: 2,
      }),
    ).toBe(0);
  });
});
