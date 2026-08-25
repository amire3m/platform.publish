import { describe, expect, it, vi } from "vitest";

import {
  AnalyticsAccessError,
  createAnalyticsQueryService,
  type AnalyticsAccountStatus,
  type AnalyticsQueryRepository,
} from "@/lib/analytics/queries";
import type { AnalyticsSnapshotRecord } from "@/lib/analytics/repository";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-21T12:00:00.000Z");
const CURRENT_END = new Date("2026-08-20T20:30:00.000Z");

function accountRow(
  accountId: string,
  daysBeforeEnd: number,
  overrides: Partial<Extract<AnalyticsSnapshotRecord, { scopeType: "account" }>> = {},
): Extract<AnalyticsSnapshotRecord, { scopeType: "account" }> {
  const dateUtc = new Date(CURRENT_END.getTime() - daysBeforeEnd * DAY);
  return {
    id: `${accountId}-account-${daysBeforeEnd}`,
    platform: "youtube",
    accountId,
    scopeType: "account",
    scopeId: accountId,
    dateJalali: "1405/05/30",
    dateUtc,
    fetchedAt: new Date("2026-08-21T08:00:00.000Z"),
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    watchTimeMinutes: 0,
    averageViewDurationSeconds: 0,
    impressions: null,
    ctr: null,
    estimatedRevenue: null,
    cpm: null,
    channelId: `channel-${accountId}`,
    channelTitle: `Channel ${accountId}`,
    subscribersTotal: null,
    subscribersGained: 0,
    subscribersLost: 0,
    ...overrides,
  };
}

function contentRow(
  accountId: string,
  videoId: string,
  daysBeforeEnd: number,
  overrides: Partial<Extract<AnalyticsSnapshotRecord, { scopeType: "content" }>> = {},
): Extract<AnalyticsSnapshotRecord, { scopeType: "content" }> {
  const dateUtc = new Date(CURRENT_END.getTime() - daysBeforeEnd * DAY);
  return {
    id: `${accountId}-${videoId}-${daysBeforeEnd}`,
    platform: "youtube",
    accountId,
    scopeType: "content",
    scopeId: videoId,
    dateJalali: "1405/05/30",
    dateUtc,
    fetchedAt: new Date("2026-08-21T08:00:00.000Z"),
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    watchTimeMinutes: 0,
    averageViewDurationSeconds: 0,
    impressions: null,
    ctr: null,
    estimatedRevenue: null,
    cpm: null,
    contentId: null,
    videoId,
    title: `Video ${videoId}`,
    thumbnailUrl: null,
    publishedAt: null,
    channelId: `channel-${accountId}`,
    channelTitle: `Channel ${accountId}`,
    ...overrides,
  };
}

function repository(
  rows: readonly AnalyticsSnapshotRecord[],
  statuses: readonly AnalyticsAccountStatus[] = [],
): AnalyticsQueryRepository & {
  readSnapshots: ReturnType<typeof vi.fn>;
  readAccountStatuses: ReturnType<typeof vi.fn>;
  aggregateContentByAccount: ReturnType<typeof vi.fn>;
} {
  return {
    readSnapshots: vi.fn().mockResolvedValue(rows),
    readAccountStatuses: vi.fn().mockResolvedValue(statuses),
    aggregateContentByAccount: vi.fn(async ({ accountId, startDateInclusive, endDateExclusive }) => {
      const grouped = new Map<string, ReturnType<typeof contentRow>[]>();
      for (const item of rows) {
        if (
          item.scopeType !== "content"
          || item.accountId !== accountId
          || item.dateUtc < startDateInclusive
          || item.dateUtc >= endDateExclusive
        ) continue;
        grouped.set(item.videoId, [...(grouped.get(item.videoId) ?? []), item]);
      }
      const videoTotals = [...grouped.values()].map((items) => ({
        views: items.reduce((sum, item) => sum + item.views, 0),
        likes: items.reduce((sum, item) => sum + item.likes, 0),
        comments: items.reduce((sum, item) => sum + item.comments, 0),
        shares: items.reduce((sum, item) => sum + item.shares, 0),
        watchTimeMinutes: items.reduce((sum, item) => sum + item.watchTimeMinutes, 0),
      }));
      const count = videoTotals.length || 1;
      return {
        views: videoTotals.reduce((sum, item) => sum + item.views, 0) / count,
        likes: videoTotals.reduce((sum, item) => sum + item.likes, 0) / count,
        comments: videoTotals.reduce((sum, item) => sum + item.comments, 0) / count,
        shares: videoTotals.reduce((sum, item) => sum + item.shares, 0) / count,
        watchTimeMinutes: videoTotals.reduce((sum, item) => sum + item.watchTimeMinutes, 0) / count,
        averageViewDurationSeconds: 0,
        videoCount: videoTotals.length,
      };
    }),
  };
}

describe("analytics query service", () => {
  it("uses one bounded read, aggregates weighted totals, and takes only the latest subscriber count per account", async () => {
    const repo = repository([
      accountRow("a", 8, { views: 50, likes: 5, subscribersTotal: 90 }),
      accountRow("a", 2, { views: 100, likes: 10, subscribersTotal: 100, subscribersGained: 4, subscribersLost: 1 }),
      accountRow("a", 1, { views: 300, likes: 3, comments: 3, shares: 3, subscribersTotal: 110, subscribersGained: 2 }),
      accountRow("b", 1, { views: 100, likes: 10, subscribersTotal: 20, subscribersGained: 1 }),
    ]);

    const result = await createAnalyticsQueryService(repo).getOverview({
      range: 7,
      allowedAccountIds: ["a", "b"],
      now: NOW,
    });

    expect(repo.readSnapshots).toHaveBeenCalledOnce();
    expect(repo.readSnapshots).toHaveBeenCalledWith({
      accountIds: ["a", "b"],
      startDateInclusive: new Date("2026-08-06T20:30:00.000Z"),
      endDateExclusive: CURRENT_END,
    });
    expect(result.comparison.current).toMatchObject({
      views: 500,
      likes: 23,
      comments: 3,
      shares: 3,
      subscribersGained: 7,
      subscribersLost: 1,
      subscriberGrowth: 6,
    });
    expect(result.comparison.current.engagementRate).toBeCloseTo(5.8);
    expect(result.subscribersTotal).toBe(130);
    expect(result.comparison.percentageChanges.views).toBe(900);
    expect(result.chartSeries).toHaveLength(7);
    expect(result.chartSeries.filter((point) => point.views === 0)).toHaveLength(5);
  });

  it.each([7, 30, 90] as const)("builds exact %i-day current and previous bounds", async (range) => {
    const repo = repository([]);

    const result = await createAnalyticsQueryService(repo).getOverview({
      range,
      allowedAccountIds: null,
      now: NOW,
    });

    expect(result.chartSeries).toHaveLength(range);
    expect(result.currentEnd).toEqual(CURRENT_END);
    expect(result.currentStart).toEqual(new Date(CURRENT_END.getTime() - range * DAY));
    expect(repo.readSnapshots.mock.calls[0][0]).toEqual({
      startDateInclusive: new Date(CURRENT_END.getTime() - range * 2 * DAY),
      endDateExclusive: CURRENT_END,
    });
  });

  it("returns null percentage changes when the previous value is zero", async () => {
    const repo = repository([accountRow("a", 1, { views: 10, likes: 2 })]);

    const result = await createAnalyticsQueryService(repo).getOverview({
      range: 7,
      allowedAccountIds: ["a"],
      now: NOW,
    });

    expect(result.comparison.percentageChanges.views).toBeNull();
    expect(result.comparison.percentageChanges.engagementRate).toBeNull();
  });

  it("derives snapshot presence from actual rows rather than padded chart points or account status", async () => {
    const withoutRows = await createAnalyticsQueryService(repository([], [
      { accountId: "a", lastSyncAt: NOW, lastError: null },
    ])).getOverview({ range: 7, allowedAccountIds: ["a"], now: NOW });
    const withZeroSnapshot = await createAnalyticsQueryService(repository([
      accountRow("a", 1),
    ])).getOverview({ range: 7, allowedAccountIds: ["a"], now: NOW });

    expect(withoutRows.chartSeries).toHaveLength(7);
    expect(withoutRows.hasSnapshotData).toBe(false);
    expect(withZeroSnapshot.comparison.current.views).toBe(0);
    expect(withZeroSnapshot.hasSnapshotData).toBe(true);
  });

  it("applies allowed accounts in the repository filter and rejects a denied requested account before any read", async () => {
    const repo = repository([]);
    const service = createAnalyticsQueryService(repo);

    await service.getOverview({ range: 30, allowedAccountIds: ["a", "b"], now: NOW });
    expect(repo.readSnapshots.mock.calls[0][0].accountIds).toEqual(["a", "b"]);

    await expect(service.getOverview({
      range: 30,
      accountId: "c",
      allowedAccountIds: ["a", "b"],
      now: NOW,
    })).rejects.toBeInstanceOf(AnalyticsAccessError);
    expect(repo.readSnapshots).toHaveBeenCalledOnce();
  });

  it("normalizes an empty non-null allowed list to unrestricted scope", async () => {
    const repo = repository([accountRow("a", 1)]);

    const result = await createAnalyticsQueryService(repo).getOverview({
      range: 7,
      allowedAccountIds: [],
      now: NOW,
    });

    expect(repo.readSnapshots).toHaveBeenCalledWith({
      startDateInclusive: new Date("2026-08-06T20:30:00.000Z"),
      endDateExclusive: CURRENT_END,
    });
    expect(result.accounts.map((account) => account.accountId)).toEqual(["a"]);
  });

  it("normalizes an empty list to unrestricted content and export reads", async () => {
    const repo = repository([contentRow("a", "target", 1, { views: 25 })]);
    const service = createAnalyticsQueryService(repo);

    const content = await service.getContent({
      externalVideoId: "target",
      range: 7,
      allowedAccountIds: [],
      now: NOW,
    });
    const exported = await service.getExportRows({
      scope: "content",
      range: 7,
      accountId: null,
      contentId: "target",
      startDate: new Date("2026-08-13T20:30:00.000Z"),
      endDate: CURRENT_END,
      allowedAccountIds: [],
    });

    expect(content?.accountId).toBe("a");
    expect(exported).toHaveLength(1);
    expect(repo.readSnapshots.mock.calls.every(([filter]) => filter.accountIds === undefined)).toBe(true);
  });

  it("orders aggregated top videos by views and then stable video ID", async () => {
    const repo = repository([
      contentRow("a", "video-b", 2, { views: 40 }),
      contentRow("a", "video-b", 1, { views: 60 }),
      contentRow("a", "video-a", 1, { views: 100 }),
      contentRow("b", "video-z", 1, { views: 200 }),
    ]);

    const result = await createAnalyticsQueryService(repo).getOverview({
      range: 7,
      allowedAccountIds: null,
      now: NOW,
    });

    expect(result.topVideos.map((video) => `${video.accountId}:${video.videoId}:${video.totals.views}`))
      .toEqual(["b:video-z:200", "a:video-a:100", "a:video-b:100"]);
  });

  it("adds current-versus-previous percentage changes to top videos", async () => {
    const result = await createAnalyticsQueryService(repository([
      contentRow("a", "video-a", 8, { views: 40, watchTimeMinutes: 20 }),
      contentRow("a", "video-a", 1, { views: 100, watchTimeMinutes: 30 }),
      contentRow("a", "video-b", 1, { views: 25 }),
    ])).getOverview({ range: 7, allowedAccountIds: ["a"], now: NOW });

    expect(result.topVideos[0].percentageChanges.views).toBe(150);
    expect(result.topVideos[0].percentageChanges.watchTimeMinutes).toBe(50);
    expect(result.topVideos[1].percentageChanges.views).toBeNull();
  });

  it("returns content comparison and an average over distinct current channel videos", async () => {
    const repo = repository([
      contentRow("a", "target", 8, { views: 50, likes: 5 }),
      contentRow("a", "target", 1, { views: 100, likes: 10 }),
      contentRow("a", "other", 1, { views: 300, likes: 30 }),
    ]);

    const result = await createAnalyticsQueryService(repo).getContent({
      externalVideoId: "target",
      range: 7,
      allowedAccountIds: ["a"],
      now: NOW,
    });

    expect(result?.comparison.current.views).toBe(100);
    expect(result?.comparison.percentageChanges.views).toBe(100);
    expect(result?.channelAverageComparison.channelAverage.views).toBe(200);
    expect(result?.channelAverageComparison.percentageDifferences.views).toBe(-50);
    expect(result?.chartSeries).toHaveLength(7);
    expect(repo.readSnapshots).toHaveBeenCalledWith({
      accountIds: ["a"],
      scopeType: "content",
      scopeId: "target",
      startDateInclusive: new Date("2026-08-06T20:30:00.000Z"),
      endDateExclusive: CURRENT_END,
    });
    expect(repo.aggregateContentByAccount).toHaveBeenCalledWith({
      accountId: "a",
      startDateInclusive: new Date("2026-08-13T20:30:00.000Z"),
      endDateExclusive: CURRENT_END,
    });
  });

  it("returns the same null result for missing and inaccessible external video IDs", async () => {
    const inaccessibleRepo = repository([contentRow("secret", "hidden", 1)]);
    const missingRepo = repository([]);

    const inaccessible = await createAnalyticsQueryService(inaccessibleRepo).getContent({
      externalVideoId: "hidden",
      range: 7,
      allowedAccountIds: ["public"],
      now: NOW,
    });
    const missing = await createAnalyticsQueryService(missingRepo).getContent({
      externalVideoId: "missing",
      range: 7,
      allowedAccountIds: ["public"],
      now: NOW,
    });

    expect(inaccessible).toBeNull();
    expect(missing).toBeNull();
    expect(inaccessibleRepo.readSnapshots.mock.calls[0][0].accountIds).toEqual(["public"]);
    expect(inaccessibleRepo.aggregateContentByAccount).not.toHaveBeenCalled();
  });

  it("exports only rows matching range, scope, account, content, and allowed-account filters", async () => {
    const inRange = contentRow("a", "target", 1, { views: 25 });
    const repo = repository([
      inRange,
      contentRow("a", "other", 1),
      contentRow("b", "target", 1),
      accountRow("a", 1),
      contentRow("a", "target", 8),
    ]);

    const rows = await createAnalyticsQueryService(repo).getExportRows({
      scope: "content",
      range: 7,
      accountId: "a",
      contentId: "target",
      startDate: new Date("2026-08-13T20:30:00.000Z"),
      endDate: CURRENT_END,
      allowedAccountIds: ["a", "b"],
    });

    expect(repo.readSnapshots).toHaveBeenCalledWith({
      accountIds: ["a"],
      scopeType: "content",
      scopeId: "target",
      startDateInclusive: new Date("2026-08-13T20:30:00.000Z"),
      endDateExclusive: CURRENT_END,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountId: "a", videoId: "target", views: 25 });
  });

  it.each([
    [{ lastSyncAt: new Date("2026-08-21T08:00:00.000Z"), lastError: null }, "fresh"],
    [{ lastSyncAt: new Date("2026-08-19T12:00:00.000Z"), lastError: null }, "stale"],
    [{ lastSyncAt: new Date("2026-08-21T08:00:00.000Z"), lastError: "failed" }, "error"],
    [{ lastSyncAt: null, lastError: null }, "never"],
  ] as const)("derives %s account freshness", async (status, expected) => {
    const repo = repository([], [{ accountId: "a", ...status }]);

    const result = await createAnalyticsQueryService(repo).getOverview({
      range: 7,
      allowedAccountIds: ["a"],
      now: NOW,
    });

    expect(result.freshness.accounts[0].state).toBe(expected);
    expect(result.freshness.state).toBe(expected);
  });
});
