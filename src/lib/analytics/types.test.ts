import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AccountDailyMetric,
  AnalyticsFetchInput,
  AnalyticsOverview,
  AnalyticsSnapshotInput,
  ContentAnalytics,
  ContentDailyMetric,
} from "@/lib/analytics/types";

const emptyTotals = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  watchTimeMinutes: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  subscriberGrowth: 0,
  engagementRate: 0,
};

const emptyChanges = {
  views: null,
  likes: null,
  comments: null,
  shares: null,
  watchTimeMinutes: null,
  subscriberGrowth: null,
  engagementRate: null,
};

describe("analytics type contracts", () => {
  it("accepts explicit incremental fetch intervals", () => {
    expectTypeOf<AnalyticsFetchInput>().toEqualTypeOf<{
      accountId: string;
      startDate: Date;
      endDate: Date;
      timezone: string;
    }>();
  });

  it("supports nullable historical subscriber totals and external content", () => {
    expectTypeOf<AccountDailyMetric["subscribersTotal"]>().toEqualTypeOf<
      number | null
    >();
    expectTypeOf<ContentDailyMetric["contentId"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<ContentDailyMetric["channelId"]>().toEqualTypeOf<string>();
    expectTypeOf<ContentDailyMetric["channelTitle"]>().toEqualTypeOf<string>();
  });

  it("models repository snapshots as individual typed scope rows", () => {
    const accountMetrics = {
      metricType: "account" as const,
      views: 100,
      likes: 10,
      comments: 2,
      shares: 1,
      watchTimeMinutes: 250,
      averageViewDurationSeconds: 45,
      subscribersTotal: null,
      subscribersGained: 4,
      subscribersLost: 1,
    };
    const contentMetrics = {
      metricType: "content" as const,
      views: 80,
      likes: 8,
      comments: 1,
      shares: 1,
      watchTimeMinutes: 200,
      averageViewDurationSeconds: 40,
    };
    const accountMetadata = {
      metadataType: "account" as const,
      channelId: "channel-1",
      channelTitle: "Channel",
    };
    const contentMetadata = {
      metadataType: "content" as const,
      contentId: null,
      videoId: "video-1",
      title: "External video",
      thumbnailUrl: null,
      publishedAt: null,
      channelId: "channel-1",
      channelTitle: "Channel",
    };
    const shared = {
      platform: "youtube",
      accountId: "account-1",
      date: new Date("2026-08-20T20:30:00.000Z"),
      fetchedAt: new Date("2026-08-21T12:00:00.000Z"),
    } as const;

    const accountRow = {
      ...shared,
      scopeType: "account",
      scopeId: "channel-1",
      metrics: accountMetrics,
      metadata: accountMetadata,
    } satisfies AnalyticsSnapshotInput;
    const contentRow = {
      ...shared,
      scopeType: "content",
      scopeId: "video-1",
      metrics: contentMetrics,
      metadata: contentMetadata,
    } satisfies AnalyticsSnapshotInput;

    // @ts-expect-error Account rows cannot carry content metrics.
    const accountWithContentMetrics: AnalyticsSnapshotInput = { ...accountRow, metrics: contentMetrics };
    // @ts-expect-error Account rows cannot carry content metadata.
    const accountWithContentMetadata: AnalyticsSnapshotInput = { ...accountRow, metadata: contentMetadata };
    // @ts-expect-error Content rows cannot carry account metrics.
    const contentWithAccountMetrics: AnalyticsSnapshotInput = { ...contentRow, metrics: accountMetrics };
    // @ts-expect-error Content rows cannot carry account metadata.
    const contentWithAccountMetadata: AnalyticsSnapshotInput = { ...contentRow, metadata: accountMetadata };
    // @ts-expect-error Account metadata is required.
    const accountWithoutMetadata: AnalyticsSnapshotInput = { ...accountRow, metadata: null };
    // @ts-expect-error Content metadata is required.
    const contentWithoutMetadata: AnalyticsSnapshotInput = { ...contentRow, metadata: null };

    const rows: readonly AnalyticsSnapshotInput[] = [accountRow, contentRow];

    expect(rows).toHaveLength(2);
  });

  it("supports multi-account overviews and channel-average content comparison", () => {
    const overview = {
      scope: "overview",
      accounts: [
        {
          accountId: "account-1",
          channelId: "channel-1",
          channelTitle: "Channel 1",
        },
        {
          accountId: "account-2",
          channelId: "channel-2",
          channelTitle: "Channel 2",
        },
      ],
      range: 30,
      currentStart: new Date("2026-07-21T20:30:00.000Z"),
      currentEnd: new Date("2026-08-20T20:30:00.000Z"),
      comparison: {
        current: emptyTotals,
        previous: emptyTotals,
        percentageChanges: emptyChanges,
      },
      chartSeries: [],
      topVideos: [
        {
          accountId: "account-1",
          channelId: "channel-1",
          channelTitle: "Channel 1",
          contentId: null,
          videoId: "video-1",
          title: "External video",
          thumbnailUrl: null,
          publishedAt: null,
          totals: emptyTotals,
        },
      ],
      subscribersTotal: null,
      lastSyncedAt: null,
      isStale: false,
    } satisfies AnalyticsOverview;

    const content = {
      scope: "content",
      accountId: "account-1",
      channelId: "channel-1",
      channelTitle: "Channel 1",
      contentId: null,
      videoId: "video-1",
      title: "External video",
      thumbnailUrl: null,
      publishedAt: null,
      range: 30,
      currentStart: new Date("2026-07-21T20:30:00.000Z"),
      currentEnd: new Date("2026-08-20T20:30:00.000Z"),
      comparison: {
        current: emptyTotals,
        previous: emptyTotals,
        percentageChanges: emptyChanges,
      },
      channelAverageComparison: {
        content: emptyTotals,
        channelAverage: emptyTotals,
        percentageDifferences: emptyChanges,
      },
      chartSeries: [],
      lastSyncedAt: null,
      isStale: false,
    } satisfies ContentAnalytics;

    expect(overview.accounts).toHaveLength(2);
    expect(content.channelAverageComparison.channelAverage.views).toBe(0);
  });
});
