import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import type { AnalyticsSnapshotInput } from "@/lib/analytics/types";
import {
  ANALYTICS_SNAPSHOT_CONFLICT_TARGET,
  buildAcquireLeaseCondition,
  buildReleaseLeaseCondition,
  buildSnapshotFilterCondition,
  createAnalyticsRepository,
  type AnalyticsAccountCandidate,
  type AnalyticsSnapshotDatabaseRow,
  type AnalyticsDatabasePort,
  type AnalyticsSnapshotFilter,
  type AnalyticsSnapshotPersistenceRow,
} from "@/lib/analytics/repository";

const baseDate = new Date("2026-08-20T20:30:00.000Z");
const fetchedAt = new Date("2026-08-21T12:00:00.000Z");

function accountSnapshot(
  overrides: Partial<Extract<AnalyticsSnapshotInput, { scopeType: "account" }>> = {},
): Extract<AnalyticsSnapshotInput, { scopeType: "account" }> {
  return {
    platform: "youtube",
    accountId: "account-1",
    scopeType: "account",
    scopeId: "account-1",
    date: baseDate,
    fetchedAt,
    metrics: {
      metricType: "account",
      views: 100,
      likes: 10,
      comments: 3,
      shares: 2,
      watchTimeMinutes: 240,
      averageViewDurationSeconds: 42,
      subscribersTotal: 500,
      subscribersGained: 8,
      subscribersLost: 2,
    },
    metadata: {
      metadataType: "account",
      channelId: "channel-1",
      channelTitle: "Channel One",
    },
    ...overrides,
  };
}

function contentSnapshot(
  overrides: Partial<Extract<AnalyticsSnapshotInput, { scopeType: "content" }>> = {},
): Extract<AnalyticsSnapshotInput, { scopeType: "content" }> {
  return {
    platform: "youtube",
    accountId: "account-1",
    scopeType: "content",
    scopeId: "video-youtube-1",
    date: baseDate,
    fetchedAt,
    metrics: {
      metricType: "content",
      views: 80,
      likes: 9,
      comments: 2,
      shares: 1,
      watchTimeMinutes: 120,
      averageViewDurationSeconds: 35,
    },
    metadata: {
      metadataType: "content",
      contentId: null,
      videoId: "video-youtube-1",
      title: "A video",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: new Date("2026-08-01T10:00:00.000Z"),
      channelId: "channel-1",
      channelTitle: "Channel One",
    },
    ...overrides,
  };
}

function snapshotKey(row: AnalyticsSnapshotPersistenceRow): string {
  return [row.platform, row.accountId, row.scopeType, row.scopeId, row.dateUtc.toISOString()].join("|");
}

class StatefulAnalyticsPort implements AnalyticsDatabasePort {
  readonly snapshots = new Map<string, AnalyticsSnapshotPersistenceRow>();
  readonly chunkSizes: number[] = [];
  readonly accounts: AnalyticsAccountCandidate[];
  readonly leases = new Map<string, { lockId: string; lockedAt: Date }>();
  readonly syncStates = new Map<string, {
    lastSyncAt: Date | null;
    lastError: string | null;
    lastErrorCode: string | null;
    nextAttemptAt: Date | null;
    syncedThrough: Date | null;
  }>();
  readRows: AnalyticsSnapshotDatabaseRow[] | null = null;
  failCommitChunkAt: number | null = null;
  failCommitStateUpdate = false;

  constructor(accounts: AnalyticsAccountCandidate[] = []) {
    this.accounts = accounts;
  }

  async acquireLease(
    accountId: string,
    lockId: string,
    now: Date,
    staleBefore: Date,
  ): Promise<boolean> {
    const lease = this.leases.get(accountId);
    if (lease && lease.lockedAt >= staleBefore) return false;
    this.leases.set(accountId, { lockId, lockedAt: now });
    return true;
  }

  async releaseLease(accountId: string, lockId: string): Promise<void> {
    if (this.leases.get(accountId)?.lockId === lockId) this.leases.delete(accountId);
  }

  async upsertSnapshotChunk(rows: readonly AnalyticsSnapshotPersistenceRow[]): Promise<number> {
    this.chunkSizes.push(rows.length);
    for (const row of rows) {
      const key = snapshotKey(row);
      const existing = this.snapshots.get(key);
      this.snapshots.set(key, existing ? { ...row, id: existing.id } : row);
    }
    return rows.length;
  }

  async commitSync(
    accountId: string,
    lockId: string,
    syncedAt: Date,
    syncedThrough: Date,
    chunks: readonly (readonly AnalyticsSnapshotPersistenceRow[])[],
  ): Promise<number> {
    if (this.leases.get(accountId)?.lockId !== lockId) throw new Error("Analytics lease lost");
    const stagedSnapshots = new Map(this.snapshots);
    let processed = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      if (this.failCommitChunkAt === index) throw new Error("commit chunk failed");
      this.chunkSizes.push(chunks[index].length);
      for (const row of chunks[index]) {
        const key = snapshotKey(row);
        const existing = stagedSnapshots.get(key);
        stagedSnapshots.set(key, existing ? { ...row, id: existing.id } : row);
      }
      processed += chunks[index].length;
    }
    if (this.failCommitStateUpdate) throw new Error("sync state update failed");

    this.snapshots.clear();
    for (const [key, row] of stagedSnapshots) this.snapshots.set(key, row);
    this.syncStates.set(accountId, {
      lastSyncAt: syncedAt,
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough,
    });
    return processed;
  }

  async getAnalyticsSyncedThrough(accountId: string): Promise<Date | null> {
    return this.syncStates.get(accountId)?.syncedThrough ?? null;
  }

  async listAccountCandidates(_accountIds?: readonly string[]): Promise<AnalyticsAccountCandidate[]> {
    return this.accounts;
  }

  async markSyncSuccess(accountId: string, syncedAt: Date): Promise<void> {
    const current = this.syncStates.get(accountId);
    this.syncStates.set(accountId, {
      lastSyncAt: syncedAt,
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough: current?.syncedThrough ?? null,
    });
  }

  async markSyncFailure(
    accountId: string,
    lockId: string | null,
    error: string,
    code: string,
    nextAttemptAt: Date | null,
  ): Promise<void> {
    if (lockId && this.leases.get(accountId)?.lockId !== lockId) return;
    const current = this.syncStates.get(accountId);
    this.syncStates.set(accountId, {
      lastSyncAt: current?.lastSyncAt ?? null,
      lastError: error,
      lastErrorCode: code,
      nextAttemptAt,
      syncedThrough: current?.syncedThrough ?? null,
    });
  }

  async readAccountStatuses(accountIds?: readonly string[]) {
    return [...this.syncStates.entries()]
      .filter(([accountId]) => !accountIds || accountIds.includes(accountId))
      .map(([accountId, status]) => ({
        accountId,
        lastSyncAt: status.lastSyncAt,
        lastError: status.lastError,
        lastErrorCode: status.lastErrorCode,
        nextAttemptAt: status.nextAttemptAt,
      }));
  }

  async readSnapshots(filter: AnalyticsSnapshotFilter): Promise<AnalyticsSnapshotDatabaseRow[]> {
    const rows: AnalyticsSnapshotDatabaseRow[] = this.readRows ?? [...this.snapshots.values()].map((row) => ({
      ...row,
      createdAt: typeof row.rawMetrics.fetchedAt === "string" ? new Date(row.rawMetrics.fetchedAt) : row.dateUtc,
      accountExternalId: typeof row.rawMetrics.channelId === "string" ? row.rawMetrics.channelId : null,
      accountDisplayName: typeof row.rawMetrics.channelTitle === "string" ? row.rawMetrics.channelTitle : null,
    }));
    return rows.filter((row) =>
      (!filter.accountIds || filter.accountIds.includes(row.accountId)) &&
      (!filter.scopeType || row.scopeType === filter.scopeType) &&
      (!filter.scopeId || row.scopeId === filter.scopeId) &&
      (!filter.startDateInclusive || row.dateUtc >= filter.startDateInclusive) &&
      (!filter.endDateExclusive || row.dateUtc < filter.endDateExclusive)
    );
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
}

describe("analytics repository", () => {
  it("renders lease acquisition with account ownership and a strict stale-or-null condition", () => {
    const staleBefore = new Date("2026-08-21T11:30:00.000Z");
    const query = new PgDialect().sqlToQuery(
      buildAcquireLeaseCondition("account-1", staleBefore),
    );

    expect(query.sql).toBe(
      '("social_accounts"."id" = $1 and ("social_accounts"."analytics_sync_locked_at" is null or "social_accounts"."analytics_sync_locked_at" < $2))',
    );
    expect(query.params).toEqual(["account-1", "2026-08-21T11:30:00.000Z"]);
  });

  it("renders lease release ownership with both account and lock IDs", () => {
    const query = new PgDialect().sqlToQuery(
      buildReleaseLeaseCondition("account-1", "worker-1"),
    );

    expect(query.sql).toBe(
      '("social_accounts"."id" = $1 and "social_accounts"."analytics_sync_lock_id" = $2)',
    );
    expect(query.params).toEqual(["account-1", "worker-1"]);
  });

  it("uses exactly the five daily-scope columns as the conflict target", () => {
    expect(ANALYTICS_SNAPSHOT_CONFLICT_TARGET.map((column) => column.name)).toEqual([
      "platform",
      "account_id",
      "scope_type",
      "scope_id",
      "date_utc",
    ]);
  });

  it("reads typed account freshness status through the repository boundary", async () => {
    const port = new StatefulAnalyticsPort();
    port.syncStates.set("account-1", {
      lastSyncAt: new Date("2026-08-21T08:00:00.000Z"),
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough: new Date("2026-08-20T20:30:00.000Z"),
    });
    port.syncStates.set("account-2", {
      lastSyncAt: null,
      lastError: "failed",
      lastErrorCode: "SYNC_FAILED",
      nextAttemptAt: null,
      syncedThrough: null,
    });
    const repository = createAnalyticsRepository(port);

    await expect(repository.readAccountStatuses?.(["account-2"])).resolves.toEqual([
      {
        accountId: "account-2",
        lastSyncAt: null,
        lastError: "failed",
        lastErrorCode: "SYNC_FAILED",
        nextAttemptAt: null,
      },
    ]);
  });

  it("renders snapshot date filtering as an inclusive start and exclusive end", () => {
    const start = new Date("2026-08-21T20:30:00.000Z");
    const end = new Date("2026-08-22T20:30:00.000Z");
    const query = new PgDialect().sqlToQuery(buildSnapshotFilterCondition({
      accountIds: ["account-1"],
      scopeType: "content",
      scopeId: "video-1",
      startDateInclusive: start,
      endDateExclusive: end,
    }));

    expect(query.sql).toBe(
      '("analytics_snapshots"."platform" = $1 and "analytics_snapshots"."account_id" in ($2) and "analytics_snapshots"."scope_type" = $3 and "analytics_snapshots"."scope_id" = $4 and "analytics_snapshots"."date_utc" >= $5 and "analytics_snapshots"."date_utc" < $6)',
    );
    expect(query.params).toEqual([
      "youtube",
      "account-1",
      "content",
      "video-1",
      "2026-08-21T20:30:00.000Z",
      "2026-08-22T20:30:00.000Z",
    ]);
  });

  it("keeps one daily row and its ID when a repeated key updates metrics", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);

    expect(await repository.upsertSnapshots([accountSnapshot()])).toBe(1);
    const original = [...port.snapshots.values()][0];
    expect(original?.id).toMatch(/^ANS-\d{4}-[0-9A-Za-z]{16,}$/);

    expect(await repository.upsertSnapshots([
      accountSnapshot({ metrics: { ...accountSnapshot().metrics, views: 275 } }),
    ])).toBe(1);

    expect(port.snapshots).toHaveLength(1);
    expect([...port.snapshots.values()][0]).toMatchObject({ id: original?.id, views: 275 });
  });

  it("writes at most 500 rows in each upsert chunk", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const rows = Array.from({ length: 501 }, (_, index) =>
      accountSnapshot({ accountId: `account-${index}`, scopeId: `account-${index}` }),
    );

    expect(await repository.upsertSnapshots(rows)).toBe(501);
    expect(port.chunkSizes).toEqual([500, 1]);
  });

  it("commits deduplicated snapshot chunks and sync state atomically", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const syncedAt = new Date("2026-08-21T12:00:00.000Z");
    const syncedThrough = new Date("2026-08-20T20:30:00.000Z");
    const rows = Array.from({ length: 501 }, (_, index) =>
      accountSnapshot({
        date: new Date(Date.UTC(2024, 0, index + 1, 12)),
        metrics: { ...accountSnapshot().metrics, views: index },
      })
    );

    await repository.acquireLease("account-1", "worker-1", syncedAt);
    expect(await repository.commitSync("account-1", "worker-1", syncedAt, syncedThrough, rows)).toBe(501);

    expect(port.chunkSizes).toEqual([500, 1]);
    expect(port.snapshots).toHaveLength(501);
    expect(port.syncStates.get("account-1")).toEqual({
      lastSyncAt: syncedAt,
      lastError: null,
      lastErrorCode: null,
      nextAttemptAt: null,
      syncedThrough,
    });
  });

  it.each([
    ["a later snapshot chunk", { failCommitChunkAt: 1 }],
    ["the sync-state update", { failCommitStateUpdate: true }],
  ] as const)("rolls back snapshots and cursor when %s fails", async (_name, failure) => {
    const port = new StatefulAnalyticsPort();
    Object.assign(port, failure);
    const repository = createAnalyticsRepository(port);
    const rows = Array.from({ length: 501 }, (_, index) =>
      accountSnapshot({ date: new Date(Date.UTC(2024, 0, index + 1, 12)) })
    );

    await repository.acquireLease("account-1", "worker-1", fetchedAt);
    await expect(repository.commitSync(
      "account-1",
      "worker-1",
      fetchedAt,
      new Date("2026-08-20T20:30:00.000Z"),
      rows,
    )).rejects.toThrow();
    await repository.markSyncFailure("account-1", "worker-1", "همگام‌سازی آمار ناموفق بود.", "SYNC_FAILED", null);

    expect(port.snapshots).toHaveLength(0);
    expect(await repository.getAnalyticsSyncedThrough("account-1")).toBeNull();
    expect(port.syncStates.get("account-1")).toEqual({
      lastSyncAt: null,
      lastError: "همگام‌سازی آمار ناموفق بود.",
      lastErrorCode: "SYNC_FAILED",
      nextAttemptAt: null,
      syncedThrough: null,
    });
  });

  it("normalizes timestamps from one Tehran day to one logical snapshot key", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);

    expect(await repository.upsertSnapshots([
      accountSnapshot({ date: new Date("2026-08-20T21:15:00.000Z") }),
      accountSnapshot({
        date: new Date("2026-08-21T18:00:00.000Z"),
        metrics: { ...accountSnapshot().metrics, views: 999 },
      }),
    ])).toBe(1);

    expect(port.chunkSizes).toEqual([1]);
    expect(port.snapshots).toHaveLength(1);
    expect([...port.snapshots.values()][0]).toMatchObject({
      dateUtc: new Date("2026-08-20T20:30:00.000Z"),
      dateJalali: "1405/05/30",
      views: 999,
    });
  });

  it("rejects account snapshots whose scope ID is not the account ID", async () => {
    const repository = createAnalyticsRepository(new StatefulAnalyticsPort());

    await expect(repository.upsertSnapshots([
      accountSnapshot({ scopeId: "channel-1" }),
    ])).rejects.toThrow("Account snapshot scopeId must match accountId");
  });

  it("blocks a fresh lease, replaces a stale lease, and ignores release by a different owner", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const now = new Date("2026-08-21T12:00:00.000Z");

    expect(await repository.acquireLease("account-1", "worker-1", now)).toBe(true);
    expect(await repository.acquireLease("account-1", "worker-2", new Date(now.getTime() + 29 * 60_000))).toBe(false);
    expect(await repository.acquireLease("account-1", "worker-2", new Date(now.getTime() + 30 * 60_000))).toBe(false);
    expect(await repository.acquireLease("account-1", "worker-2", new Date(now.getTime() + 31 * 60_000))).toBe(true);

    await repository.releaseLease("account-1", "worker-1");
    expect(port.leases.get("account-1")?.lockId).toBe("worker-2");
    await repository.releaseLease("account-1", "worker-2");
    expect(port.leases.has("account-1")).toBe(false);
  });

  it("finds the latest account day while ignoring content rows and other accounts", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const expected = new Date("2026-08-20T20:30:00.000Z");

    await repository.upsertSnapshots([
      accountSnapshot({ date: new Date("2026-08-19T20:30:00.000Z") }),
      accountSnapshot({ date: expected }),
      contentSnapshot({ date: new Date("2026-08-21T20:30:00.000Z") }),
      contentSnapshot({ date: new Date("2026-08-22T20:30:00.000Z") }),
      accountSnapshot({ accountId: "account-2", scopeId: "account-2", date: new Date("2026-08-22T20:30:00.000Z") }),
    ]);

    await repository.acquireLease("account-1", "worker-1", fetchedAt);
    await repository.commitSync("account-1", "worker-1", fetchedAt, expected, []);
    expect(await repository.getAnalyticsSyncedThrough("account-1")).toEqual(expected);
    expect(await repository.getAnalyticsSyncedThrough("missing")).toBeNull();
  });

  it("lists only connected active YouTube accounts with matching credentials and applies ID filters", async () => {
    const valid = {
      id: "valid",
      platform: "youtube",
      externalAccountId: "channel-valid",
      displayName: "Valid Channel",
      active: true,
      connectionStatus: "connected",
      credentialRef: "credential-valid",
      credentialProvider: "youtube",
      encryptedCredential: "encrypted-valid",
      lastSyncAt: null,
    } satisfies AnalyticsAccountCandidate;
    const candidates: AnalyticsAccountCandidate[] = [
      valid,
      { ...valid, id: "inactive", active: false },
      { ...valid, id: "mock", connectionStatus: "mock" },
      { ...valid, id: "disconnected", connectionStatus: "disconnected" },
      { ...valid, id: "instagram", platform: "instagram" },
      { ...valid, id: "missing-credential", credentialRef: null, credentialProvider: null, encryptedCredential: null },
      { ...valid, id: "wrong-provider", credentialProvider: "instagram" },
    ];
    const repository = createAnalyticsRepository(new StatefulAnalyticsPort(candidates));

    await expect(repository.listSyncableAccounts()).resolves.toEqual([
      {
        id: "valid",
        externalAccountId: "channel-valid",
        displayName: "Valid Channel",
        encryptedCredential: "encrypted-valid",
        lastSyncAt: null,
      },
    ]);
    await expect(repository.listSyncableAccounts(["valid", "inactive"])).resolves.toHaveLength(1);
    await expect(repository.listSyncableAccounts(["inactive"])).resolves.toEqual([]);
    await expect(repository.listSyncableAccounts([])).resolves.toEqual([]);
  });

  it("marks sync success and failure without advancing success time on failure", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const syncedAt = new Date("2026-08-21T12:00:00.000Z");

    await repository.markSyncSuccess("account-1", syncedAt);
    expect(port.syncStates.get("account-1")).toMatchObject({ lastSyncAt: syncedAt, lastError: null });

    await repository.markSyncFailure("account-1", null, "quota exceeded", "QUOTA_EXHAUSTED", fetchedAt);
    expect(port.syncStates.get("account-1")).toMatchObject({
      lastSyncAt: syncedAt,
      lastError: "quota exceeded",
      lastErrorCode: "QUOTA_EXHAUSTED",
      nextAttemptAt: fetchedAt,
    });
  });

  it("commits an empty successful range cursor while fenced by the current lock", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const through = new Date("2026-08-20T20:30:00.000Z");
    await repository.acquireLease("account-1", "worker-1", fetchedAt);

    await expect(repository.commitSync("account-1", "worker-1", fetchedAt, through, [])).resolves.toBe(0);

    expect(await repository.getAnalyticsSyncedThrough("account-1")).toEqual(through);
    expect(port.snapshots).toHaveLength(0);
  });

  it("rejects a stale worker commit and does not let it overwrite the new owner's status", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.acquireLease("account-1", "old", new Date("2026-08-21T10:00:00.000Z"));
    await repository.acquireLease("account-1", "new", fetchedAt);

    await expect(repository.commitSync(
      "account-1",
      "old",
      fetchedAt,
      new Date("2026-08-20T20:30:00.000Z"),
      [accountSnapshot()],
    )).rejects.toThrow("Analytics lease lost");
    await repository.markSyncFailure("account-1", "old", "old failure", "SYNC_FAILED", null);

    expect(port.snapshots).toHaveLength(0);
    expect(port.syncStates.has("account-1")).toBe(false);
  });

  it("reads safe legacy account and content rows from typed columns and joined account metadata", async () => {
    const port = new StatefulAnalyticsPort();
    port.readRows = [
      {
        id: "legacy-account",
        platform: "youtube",
        accountId: "account-1",
        scopeType: "account",
        scopeId: "account-1",
        dateJalali: "1405/05/30",
        dateUtc: baseDate,
        createdAt: fetchedAt,
        accountExternalId: "channel-1",
        accountDisplayName: "Channel One",
        contentTitle: null,
        thumbnailUrl: null,
        publishedAt: null,
        followersOrSubscribers: 500,
        subscribersGained: 8,
        subscribersLost: 2,
        views: 100,
        likes: 10,
        comments: 3,
        shares: 2,
        watchTime: 240,
        averageViewDuration: "42",
        rawMetrics: {},
      },
      {
        id: "legacy-content",
        platform: "youtube",
        accountId: "account-1",
        scopeType: "content",
        scopeId: "video-legacy",
        dateJalali: "1405/05/30",
        dateUtc: baseDate,
        createdAt: fetchedAt,
        accountExternalId: "channel-1",
        accountDisplayName: "Channel One",
        contentTitle: null,
        thumbnailUrl: null,
        publishedAt: null,
        followersOrSubscribers: null,
        subscribersGained: 0,
        subscribersLost: 0,
        views: 12,
        likes: 1,
        comments: 0,
        shares: 0,
        watchTime: 15,
        averageViewDuration: "30",
        rawMetrics: {},
      },
    ] as AnalyticsSnapshotDatabaseRow[];

    await expect(createAnalyticsRepository(port).readSnapshots({})).resolves.toMatchObject([
      { scopeType: "account", channelId: "channel-1", channelTitle: "Channel One", views: 100, fetchedAt },
      { scopeType: "content", videoId: "video-legacy", contentId: null, title: "", channelId: "channel-1", views: 12, fetchedAt },
    ]);
  });

  it("reads snapshots by account, scope, and a half-open date range", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([
      contentSnapshot({ date: new Date("2026-08-20T20:30:00.000Z") }),
      contentSnapshot({ date: new Date("2026-08-21T20:30:00.000Z") }),
      contentSnapshot({ scopeId: "video-2", date: new Date("2026-08-21T20:30:00.000Z") }),
      contentSnapshot({ accountId: "account-2", date: new Date("2026-08-21T20:30:00.000Z") }),
      accountSnapshot({ date: new Date("2026-08-21T20:30:00.000Z") }),
    ]);

    const rows = await repository.readSnapshots({
      accountIds: ["account-1"],
      scopeType: "content",
      scopeId: "video-youtube-1",
      startDateInclusive: new Date("2026-08-21T20:30:00.000Z"),
      endDateExclusive: new Date("2026-08-22T20:30:00.000Z"),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountId: "account-1",
      scopeType: "content",
      scopeId: "video-youtube-1",
      dateUtc: new Date("2026-08-21T20:30:00.000Z"),
    });
    await expect(repository.readSnapshots({ accountIds: [] })).resolves.toEqual([]);
  });

  it("parses persistence rows into typed account and content snapshot branches", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([accountSnapshot(), contentSnapshot()]);

    const rows = await repository.readSnapshots({ accountIds: ["account-1"] });
    const account = rows.find((row) => row.scopeType === "account");
    const content = rows.find((row) => row.scopeType === "content");

    expect(account).toMatchObject({
      scopeType: "account",
      fetchedAt,
      channelId: "channel-1",
      channelTitle: "Channel One",
      subscribersTotal: 500,
      subscribersGained: 8,
      subscribersLost: 2,
      watchTimeMinutes: 240,
      averageViewDurationSeconds: 42,
    });
    expect(content).toMatchObject({
      scopeType: "content",
      fetchedAt,
      contentId: null,
      videoId: "video-youtube-1",
      title: "A video",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: new Date("2026-08-01T10:00:00.000Z"),
      channelId: "channel-1",
      channelTitle: "Channel One",
      watchTimeMinutes: 120,
      averageViewDurationSeconds: 35,
    });
  });

  it("rejects malformed persistence metrics without including raw values in the error", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([accountSnapshot()]);
    const row = [...port.snapshots.values()][0];
    if (!row) throw new Error("Expected test snapshot");
    row.rawMetrics = { ...row.rawMetrics, fetchedAt: "secret-malformed-value" };

    await expect(repository.readSnapshots({})).rejects.toThrow(
      "Invalid analytics snapshot record at index 0",
    );
    try {
      await repository.readSnapshots({});
    } catch (error) {
      expect(String(error)).not.toContain("secret-malformed-value");
    }
  });

  it("rejects an explicit unknown raw discriminator instead of treating it as legacy", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([accountSnapshot()]);
    const row = [...port.snapshots.values()][0];
    if (!row) throw new Error("Expected test snapshot");
    row.rawMetrics = { ...row.rawMetrics, metricType: "secret-unknown-format" };

    await expect(repository.readSnapshots({})).rejects.toThrow(
      "Invalid analytics snapshot record at index 0",
    );
    await expect(repository.readSnapshots({})).rejects.not.toThrow("secret-unknown-format");
  });

  it("rejects an invalid database platform without masking or exposing it", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([accountSnapshot()]);
    const row = [...port.snapshots.values()][0];
    if (!row) throw new Error("Expected test snapshot");
    port.readRows = [{ ...row, platform: "secret-invalid-platform" } as unknown as AnalyticsSnapshotDatabaseRow];

    await expect(repository.readSnapshots({})).rejects.toThrow(
      "Invalid analytics snapshot record at index 0",
    );
    try {
      await repository.readSnapshots({});
    } catch (error) {
      expect(String(error)).not.toContain("secret-invalid-platform");
    }
  });

  it("rejects an invalid database scope type without casting or exposing it", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    await repository.upsertSnapshots([contentSnapshot()]);
    const row = [...port.snapshots.values()][0];
    if (!row) throw new Error("Expected test snapshot");
    port.readRows = [{ ...row, scopeType: "secret-invalid-scope" } as unknown as AnalyticsSnapshotDatabaseRow];

    await expect(repository.readSnapshots({})).rejects.toThrow(
      "Invalid analytics snapshot record at index 0",
    );
    try {
      await repository.readSnapshots({});
    } catch (error) {
      expect(String(error)).not.toContain("secret-invalid-scope");
    }
  });

  it("maps nullable subscribers and external content IDs without persisting credentials", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);

    await repository.upsertSnapshots([
      accountSnapshot({
        metrics: { ...accountSnapshot().metrics, subscribersTotal: null },
      }),
      contentSnapshot(),
    ]);

    const [accountRow, contentRow] = [...port.snapshots.values()];
    expect(accountRow).toMatchObject({
      dateJalali: "1405/05/30",
      followersOrSubscribers: null,
      watchTime: 240,
      averageViewDuration: "42",
    });
    expect(contentRow).toMatchObject({
      scopeId: "video-youtube-1",
      contentTitle: "A video",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: new Date("2026-08-01T10:00:00.000Z"),
      rawMetrics: {
        metricType: "content",
        metadataType: "content",
        contentId: null,
        videoId: "video-youtube-1",
      },
    });
    expect(JSON.stringify([accountRow, contentRow])).not.toContain("credential");
  });

  it("persists only allowlisted raw metric fields from runtime inputs", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const base = contentSnapshot();
    const unsafeInput = {
      ...base,
      metrics: { ...base.metrics, accessToken: "metric-secret" },
      metadata: { ...base.metadata, refreshToken: "metadata-secret" },
    } as AnalyticsSnapshotInput;

    await repository.upsertSnapshots([unsafeInput]);

    const serialized = JSON.stringify([...port.snapshots.values()][0]?.rawMetrics);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("metric-secret");
    expect(serialized).not.toContain("metadata-secret");
  });

  it("maps geo snapshot to persistence row with country and ctr", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const geoSnapshot = {
      platform: "youtube",
      accountId: "account-1",
      scopeType: "geo",
      scopeId: "IR",
      date: baseDate,
      fetchedAt,
      metrics: {
        metricType: "geo",
        views: 100,
        likes: 5,
        comments: 2,
        shares: 1,
        watchTimeMinutes: 50,
        averageViewDurationSeconds: 30,
        impressions: 1000,
        ctr: 0.1,
        estimatedRevenue: 12.5,
        cpm: 2.3,
      },
      metadata: {
        metadataType: "geo",
        channelId: "channel-1",
        channelTitle: "Channel One",
        country: "IR",
      },
    } as unknown as AnalyticsSnapshotInput;

    await repository.upsertSnapshots([geoSnapshot]);

    const persisted = [...port.snapshots.values()][0];
    expect(persisted).toMatchObject({
      scopeType: "geo",
      scopeId: "IR",
      impressions: 1000,
      ctr: 0.1,
      estimatedRevenue: "12.5",
      cpm: "2.3",
    });
    expect(persisted?.rawMetrics).toMatchObject({
      metricType: "geo",
      metadataType: "geo",
      country: "IR",
      views: 100,
      impressions: 1000,
      ctr: 0.1,
    });

    const rows = await repository.readSnapshots({ accountIds: ["account-1"], scopeType: "geo" as unknown as AnalyticsSnapshotFilter["scopeType"] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      scopeType: "geo",
      scopeId: "IR",
      country: "IR",
      views: 100,
      impressions: 1000,
      ctr: 0.1,
    });
  });

  it("maps retention snapshot with videoId and averageViewPercentage", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const retentionSnapshot = {
      platform: "youtube",
      accountId: "account-1",
      scopeType: "retention",
      scopeId: "video-youtube-9",
      date: baseDate,
      fetchedAt,
      metrics: {
        metricType: "retention",
        views: 500,
        likes: 20,
        comments: 5,
        shares: 3,
        watchTimeMinutes: 300,
        averageViewDurationSeconds: 60,
        averageViewPercentage: 42.5,
        impressions: 800,
      },
      metadata: {
        metadataType: "retention",
        channelId: "channel-1",
        channelTitle: "Channel One",
        videoId: "video-youtube-9",
        title: "Retention Video",
      },
    } as unknown as AnalyticsSnapshotInput;

    await repository.upsertSnapshots([retentionSnapshot]);

    const persisted = [...port.snapshots.values()][0];
    expect(persisted).toMatchObject({
      scopeType: "retention",
      scopeId: "video-youtube-9",
      rawMetrics: expect.objectContaining({
        metricType: "retention",
        averageViewPercentage: 42.5,
        videoId: "video-youtube-9",
      }),
    });

    const rows = await repository.readSnapshots({ accountIds: ["account-1"], scopeType: "retention" as unknown as AnalyticsSnapshotFilter["scopeType"] });
    expect(rows[0]).toMatchObject({
      scopeType: "retention",
      scopeId: "video-youtube-9",
      videoId: "video-youtube-9",
      averageViewPercentage: 42.5,
    });
  });

  it("persists search snapshot with keyword containing colons safely", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const keyword = "how to: cook: rice";
    const searchSnapshot = {
      platform: "youtube",
      accountId: "account-1",
      scopeType: "search",
      scopeId: keyword,
      date: baseDate,
      fetchedAt,
      metrics: {
        metricType: "search",
        views: 250,
        likes: 10,
        comments: 1,
        shares: 0,
        watchTimeMinutes: 80,
        averageViewDurationSeconds: 25,
        impressions: 2000,
      },
      metadata: {
        metadataType: "search",
        channelId: "channel-1",
        channelTitle: "Channel One",
        keyword,
      },
    } as unknown as AnalyticsSnapshotInput;

    await repository.upsertSnapshots([searchSnapshot]);

    const persisted = [...port.snapshots.values()][0];
    expect(persisted?.scopeId).toBe(keyword);
    expect(persisted?.rawMetrics).toMatchObject({ keyword });

    const rows = await repository.readSnapshots({ accountIds: ["account-1"], scopeType: "search" as unknown as AnalyticsSnapshotFilter["scopeType"] });
    expect(rows[0]).toMatchObject({
      scopeType: "search",
      keyword,
      scopeId: keyword,
    });
  });

  it("derives ctr as views/impressions when ctr not provided", async () => {
    const port = new StatefulAnalyticsPort();
    const repository = createAnalyticsRepository(port);
    const geoSnapshot = {
      platform: "youtube",
      accountId: "account-1",
      scopeType: "geo",
      scopeId: "US",
      date: baseDate,
      fetchedAt,
      metrics: {
        metricType: "geo",
        views: 50,
        likes: 0,
        comments: 0,
        shares: 0,
        watchTimeMinutes: 10,
        averageViewDurationSeconds: 20,
        impressions: 200,
      },
      metadata: {
        metadataType: "geo",
        channelId: "channel-1",
        channelTitle: "Channel One",
        country: "US",
      },
    } as unknown as AnalyticsSnapshotInput;

    await repository.upsertSnapshots([geoSnapshot]);
    const persisted = [...port.snapshots.values()][0];
    expect(persisted?.ctr).toBeCloseTo(0.25);
    expect(persisted?.rawMetrics).toMatchObject({ ctr: 0.25 });
  });
});
