import { describe, expect, it } from "vitest";

import { encodeAnalyticsCsv } from "@/lib/analytics/csv";
import {
  createAnalyticsRepository,
  type AnalyticsAccountCandidate,
  type AnalyticsAccountSyncStatus,
  type AnalyticsDatabasePort,
  type AnalyticsSnapshotDatabaseRow,
  type AnalyticsSnapshotFilter,
  type AnalyticsSnapshotPersistenceRow,
} from "@/lib/analytics/repository";
import { createAnalyticsQueryService } from "@/lib/analytics/queries";
import { createAnalyticsSyncService } from "@/lib/analytics/sync";
import type { AnalyticsSnapshotInput } from "@/lib/analytics/types";
import {
  YouTubeAnalyticsApiError,
  type YouTubeAnalyticsAdapter,
} from "@/lib/analytics/youtube-adapter";

const NOW = new Date("2026-08-21T12:00:00.000Z");
const CURRENT_END = new Date("2026-08-20T20:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function persistenceKey(row: AnalyticsSnapshotPersistenceRow): string {
  return [row.platform, row.accountId, row.scopeType, row.scopeId, row.dateUtc.toISOString()].join("|");
}

class InMemoryAnalyticsPort implements AnalyticsDatabasePort {
  readonly snapshots = new Map<string, AnalyticsSnapshotPersistenceRow>();
  readonly leases = new Map<string, string>();
  readonly statuses = new Map<string, {
    lastSyncAt: Date | null;
    lastError: string | null;
    lastErrorCode: string | null;
    nextAttemptAt: Date | null;
    syncedThrough: Date | null;
  }>();
  constructor(readonly accounts: AnalyticsAccountCandidate[]) {}

  async acquireLease(accountId: string, lockId: string): Promise<boolean> {
    if (this.leases.has(accountId)) return false;
    this.leases.set(accountId, lockId);
    return true;
  }

  async releaseLease(accountId: string, lockId: string): Promise<void> {
    if (this.leases.get(accountId) === lockId) this.leases.delete(accountId);
  }

  async upsertSnapshotChunk(rows: readonly AnalyticsSnapshotPersistenceRow[]): Promise<number> {
    this.writeRows(this.snapshots, rows);
    return rows.length;
  }

  async commitSync(
    accountId: string,
    lockId: string,
    syncedAt: Date,
    syncedThrough: Date,
    chunks: readonly (readonly AnalyticsSnapshotPersistenceRow[])[],
  ): Promise<number> {
    if (this.leases.get(accountId) !== lockId) throw new Error("Analytics lease lost");
    const staged = new Map(this.snapshots);
    let count = 0;
    for (const rows of chunks) {
      this.writeRows(staged, rows);
      count += rows.length;
    }
    this.snapshots.clear();
    for (const [key, row] of staged) this.snapshots.set(key, row);
    this.statuses.set(accountId, {
      lastSyncAt: syncedAt,
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough,
    });
    return count;
  }

  async getAnalyticsSyncedThrough(accountId: string): Promise<Date | null> {
    return this.statuses.get(accountId)?.syncedThrough ?? null;
  }

  async listAccountCandidates(): Promise<AnalyticsAccountCandidate[]> {
    return this.accounts;
  }

  async markSyncSuccess(accountId: string, syncedAt: Date): Promise<void> {
    const current = this.statuses.get(accountId);
    this.statuses.set(accountId, {
      lastSyncAt: syncedAt,
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough: current?.syncedThrough ?? null,
    });
  }

  async markSyncFailure(accountId: string, lockId: string | null, error: string, code: string, nextAttemptAt: Date | null): Promise<void> {
    if (lockId && this.leases.get(accountId) !== lockId) return;
    const current = this.statuses.get(accountId);
    this.statuses.set(accountId, {
      lastSyncAt: current?.lastSyncAt ?? null,
      lastError: error,
      lastErrorCode: code,
      nextAttemptAt,
      syncedThrough: current?.syncedThrough ?? null,
    });
  }

  async readSnapshots(filter: AnalyticsSnapshotFilter): Promise<AnalyticsSnapshotDatabaseRow[]> {
    return [...this.snapshots.values()].filter((row) =>
      (!filter.accountIds || filter.accountIds.includes(row.accountId))
      && (!filter.scopeType || filter.scopeType === row.scopeType)
      && (!filter.scopeId || filter.scopeId === row.scopeId)
      && (!filter.startDateInclusive || row.dateUtc >= filter.startDateInclusive)
      && (!filter.endDateExclusive || row.dateUtc < filter.endDateExclusive)
    ).map((row) => ({
      ...row,
      createdAt: typeof row.rawMetrics.fetchedAt === "string" ? new Date(row.rawMetrics.fetchedAt) : row.dateUtc,
      accountExternalId: typeof row.rawMetrics.channelId === "string" ? row.rawMetrics.channelId : null,
      accountDisplayName: typeof row.rawMetrics.channelTitle === "string" ? row.rawMetrics.channelTitle : null,
    }));
  }

  async readAccountStatuses(accountIds?: readonly string[]): Promise<AnalyticsAccountSyncStatus[]> {
    return [...this.statuses.entries()]
      .filter(([accountId]) => !accountIds || accountIds.includes(accountId))
      .map(([accountId, status]) => ({
        accountId,
        lastSyncAt: status.lastSyncAt,
        lastError: status.lastError,
        lastErrorCode: status.lastErrorCode,
        nextAttemptAt: status.nextAttemptAt,
      }));
  }

  async aggregateContentByAccount() {
    return {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTimeMinutes: 0,
      averageViewDurationSeconds: 0,
      videoCount: 0,
    };
  }

  private writeRows(
    destination: Map<string, AnalyticsSnapshotPersistenceRow>,
    rows: readonly AnalyticsSnapshotPersistenceRow[],
  ): void {
    for (const row of rows) {
      const key = persistenceKey(row);
      const existing = destination.get(key);
      destination.set(key, existing ? { ...row, id: existing.id } : row);
    }
  }
}

function accountCandidate(id: string): AnalyticsAccountCandidate {
  return {
    id,
    platform: "youtube",
    externalAccountId: `channel-${id}`,
    displayName: `Channel ${id}`,
    active: true,
    connectionStatus: "connected",
    credentialRef: `credential-${id}`,
    credentialProvider: "youtube",
    encryptedCredential: JSON.stringify({ access_token: id }),
    lastSyncAt: null,
  };
}

function oldAccountSnapshot(accountId: string): Extract<AnalyticsSnapshotInput, { scopeType: "account" }> {
  return {
    platform: "youtube",
    accountId,
    scopeType: "account",
    scopeId: accountId,
    date: new Date("2026-08-10T00:00:00.000Z"),
    fetchedAt: new Date("2026-08-10T12:00:00.000Z"),
    metrics: {
      metricType: "account",
      views: 40,
      likes: 2,
      comments: 1,
      shares: 0,
      watchTimeMinutes: 80,
      averageViewDurationSeconds: 30,
      subscribersTotal: 25,
      subscribersGained: 1,
      subscribersLost: 0,
    },
    metadata: {
      metadataType: "account",
      channelId: `channel-${accountId}`,
      channelTitle: `Channel ${accountId}`,
    },
  };
}

function successfulAdapter(accountId: string): YouTubeAnalyticsAdapter {
  return {
    async fetchAccountDaily() {
      return [{
        accountId,
        channelId: `channel-${accountId}`,
        channelTitle: `Channel ${accountId}`,
        date: new Date("2026-08-20T00:00:00.000Z"),
        views: 120,
        likes: 12,
        comments: 4,
        shares: 2,
        watchTimeMinutes: 360,
        averageViewDurationSeconds: 45,
        subscribersTotal: 500,
        subscribersGained: 8,
        subscribersLost: 1,
      }];
    },
    async fetchContentDaily() {
      return [{
        accountId,
        channelId: `channel-${accountId}`,
        channelTitle: `Channel ${accountId}`,
        contentId: "content-success",
        videoId: "video-success",
        title: "Successful video",
        thumbnailUrl: "https://example.com/video-success.jpg",
        publishedAt: new Date("2026-08-01T10:00:00.000Z"),
        date: new Date("2026-08-20T00:00:00.000Z"),
        views: 90,
        likes: 9,
        comments: 3,
        shares: 1,
        watchTimeMinutes: 240,
        averageViewDurationSeconds: 40,
      }];
    },
  };
}

function reconnectRequiredAdapter(): YouTubeAnalyticsAdapter {
  const fail = async (): Promise<never> => {
    throw new YouTubeAnalyticsApiError("reconnect_required");
  };
  return { fetchAccountDaily: fail, fetchContentDaily: fail };
}

describe("YouTube analytics integration", () => {
  it("keeps sync, scoped 7/30/90 queries, and CSV export consistent across success and reconnect failure", async () => {
    const successfulId = "account-success";
    const failedId = "account-reconnect";
    const port = new InMemoryAnalyticsPort([
      accountCandidate(successfulId),
      accountCandidate(failedId),
    ]);
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([oldAccountSnapshot(failedId)]);
    const oldCursor = await repository.getAnalyticsSyncedThrough(failedId);
    const oldSyncAt = new Date("2026-08-10T12:00:00.000Z");
    port.statuses.set(failedId, {
      lastSyncAt: oldSyncAt,
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough: oldCursor,
    });
    let lockSequence = 0;
    const sync = createAnalyticsSyncService({
      repository,
      createAdapter(credentials) {
        const accountId = String(credentials.access_token);
        return accountId === successfulId
          ? successfulAdapter(accountId)
          : reconnectRequiredAdapter();
      },
      decrypt: (payload) => payload,
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => `lock-${lockSequence += 1}`,
    });
    const query = createAnalyticsQueryService(repository);

    const results = await sync.syncAccounts([successfulId, failedId]);

    expect(results).toEqual([
      {
        accountId: successfulId,
        status: "synced",
        snapshotCount: 2,
        range: {
          start: "2026-05-22T20:30:00.000Z",
          end: "2026-08-20T20:30:00.000Z",
        },
      },
      expect.objectContaining({
        accountId: failedId,
        status: "failed",
        code: "RECONNECT_REQUIRED",
        snapshotCount: 0,
      }),
    ]);
    expect(results.map((result) => result.accountId)).toEqual([successfulId, failedId]);

    for (const range of [7, 30, 90] as const) {
      const overview = await query.getOverview({
        range,
        allowedAccountIds: [successfulId],
        now: NOW,
      });
      expect(overview.hasSnapshotData).toBe(true);
      expect(overview.accounts.map((account) => account.accountId)).toEqual([successfulId]);
      expect(overview.comparison.current.views).toBe(120);
      expect(overview.subscribersTotal).toBe(500);
    }

    expect(await repository.getAnalyticsSyncedThrough(failedId)).toEqual(oldCursor);
    const failedOverview = await query.getOverview({
      range: 90,
      accountId: failedId,
      allowedAccountIds: [successfulId, failedId],
      now: NOW,
    });
    expect(failedOverview.hasSnapshotData).toBe(true);
    expect(failedOverview.freshness.accounts).toEqual([
      expect.objectContaining({
        accountId: failedId,
        lastSyncAt: oldSyncAt,
        state: "error",
      }),
    ]);
    expect(NOW.getTime() - oldSyncAt.getTime()).toBeGreaterThan(36 * 60 * 60 * 1000);

    const restrictedOverview = await query.getOverview({
      range: 90,
      allowedAccountIds: [successfulId],
      now: NOW,
    });
    const exportRows = await query.getExportRows({
      scope: "account",
      range: 90,
      accountId: null,
      contentId: null,
      startDate: restrictedOverview.currentStart,
      endDate: restrictedOverview.currentEnd,
      allowedAccountIds: [successfulId],
    });
    expect(exportRows.map((row) => row.accountId)).toEqual([successfulId]);
    const exportedTotals = exportRows.reduce((totals, row) => ({
      views: totals.views + row.views,
      likes: totals.likes + row.likes,
      comments: totals.comments + row.comments,
      shares: totals.shares + row.shares,
      watchTimeMinutes: totals.watchTimeMinutes + row.watchTimeMinutes,
      subscribersGained: totals.subscribersGained + row.subscribersGained,
      subscribersLost: totals.subscribersLost + row.subscribersLost,
    }), {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTimeMinutes: 0,
      subscribersGained: 0,
      subscribersLost: 0,
    });
    expect(exportedTotals).toEqual({
      views: 120,
      likes: 12,
      comments: 4,
      shares: 2,
      watchTimeMinutes: 360,
      subscribersGained: 8,
      subscribersLost: 1,
    });
    expect(exportedTotals).toEqual(expect.objectContaining({
      views: restrictedOverview.comparison.current.views,
      likes: restrictedOverview.comparison.current.likes,
      comments: restrictedOverview.comparison.current.comments,
      shares: restrictedOverview.comparison.current.shares,
      watchTimeMinutes: restrictedOverview.comparison.current.watchTimeMinutes,
      subscribersGained: restrictedOverview.comparison.current.subscribersGained,
      subscribersLost: restrictedOverview.comparison.current.subscribersLost,
    }));
    expect(exportRows[0]).toMatchObject({
      subscribersTotal: restrictedOverview.subscribersTotal,
      engagementRate: restrictedOverview.comparison.current.engagementRate,
    });
    const csv = encodeAnalyticsCsv(exportRows);
    const [headers, record] = csv.slice(1).trim().split("\r\n");
    expect(headers.split(",")).toEqual([
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
    expect(record.split(",")).toEqual([
      "2026-08-20",
      "account",
      "Channel account-success",
      "",
      "",
      "120",
      "12",
      "4",
      "2",
      "360",
      "45",
      "500",
      "8",
      "1",
      "15",
    ]);
    expect(csv).not.toContain("Channel account-reconnect");

    const snapshotCount = port.snapshots.size;
    // Current account: sync re-fetches the 4-day repair overlap (YouTube metrics
    // arrive late) and upserts — snapshot identity count stays the same.
    await expect(sync.syncAccount(successfulId)).resolves.toMatchObject({
      accountId: successfulId,
      status: "synced",
    });
    expect(await repository.getAnalyticsSyncedThrough(successfulId)).toEqual(CURRENT_END);
  });
});
