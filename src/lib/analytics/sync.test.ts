import { describe, expect, it, vi } from "vitest";

import type { AnalyticsRepository, SyncableAccount } from "@/lib/analytics/repository";
import type { AnalyticsSnapshotInput } from "@/lib/analytics/types";
import {
  YouTubeAnalyticsApiError,
  type YouTubeAnalyticsAdapter,
} from "@/lib/analytics/youtube-adapter";
import {
  accountSyncHttpStatus,
  createAnalyticsSyncService,
  type AnalyticsSyncDependencies,
} from "@/lib/analytics/sync";

const NOW = new Date("2026-08-21T12:00:00.000Z");
const SECRET = "access-token-that-must-never-escape";

function syncableAccount(id = "account-1"): SyncableAccount {
  return {
    id,
    externalAccountId: "youtube-channel-1",
    displayName: `Channel ${id}`,
    encryptedCredential: `encrypted-${id}`,
    lastSyncAt: null,
  };
}

function createRepository(account = syncableAccount()) {
  const snapshots: AnalyticsSnapshotInput[][] = [];
  const repository: AnalyticsRepository = {
    acquireLease: vi.fn(async () => true),
    releaseLease: vi.fn(async () => undefined),
    upsertSnapshots: vi.fn(async (rows) => {
      snapshots.push([...rows]);
      return rows.length;
    }),
    commitSync: vi.fn(async (_accountId, _lockId, _syncedAt, _syncedThrough, rows) => {
      snapshots.push([...rows]);
      return rows.length;
    }),
    getAnalyticsSyncedThrough: vi.fn(async () => null),
    listSyncableAccounts: vi.fn(async (ids) =>
      !ids || ids.includes(account.id) ? [account] : []
    ),
    markSyncSuccess: vi.fn(async () => undefined),
    markSyncFailure: vi.fn(async () => undefined),
    readSnapshots: vi.fn(async () => []),
    aggregateContentByAccount: vi.fn(async () => ({
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      watchTimeMinutes: 0,
      averageViewDurationSeconds: 0,
      videoCount: 0,
    })),
  };
  return { repository, snapshots };
}

function createAdapter(): YouTubeAnalyticsAdapter {
  return {
    fetchAccountDaily: vi.fn(async (input) => [{
      accountId: input.accountId,
      channelId: "youtube-channel-1",
      channelTitle: "A channel",
      date: new Date("2026-08-20T00:00:00.000Z"),
      views: 100,
      likes: 10,
      comments: 4,
      shares: 2,
      watchTimeMinutes: 300,
      averageViewDurationSeconds: 45,
      subscribersTotal: 900,
      subscribersGained: 8,
      subscribersLost: 1,
    }]),
    fetchContentDaily: vi.fn(async (input) => [{
      accountId: input.accountId,
      channelId: "youtube-channel-1",
      channelTitle: "A channel",
      contentId: "content-1",
      videoId: "video-1",
      title: "Video one",
      thumbnailUrl: "https://example.com/video-1.jpg",
      publishedAt: new Date("2026-08-01T10:00:00.000Z"),
      date: new Date("2026-08-20T00:00:00.000Z"),
      views: 80,
      likes: 9,
      comments: 3,
      shares: 1,
      watchTimeMinutes: 200,
      averageViewDurationSeconds: 40,
    }]),
  };
}

function createHarness(overrides: Partial<AnalyticsSyncDependencies> = {}) {
  const { repository, snapshots } = createRepository();
  const adapter = createAdapter();
  const sleep = vi.fn(async (_ms: number) => undefined);
  const dependencies: AnalyticsSyncDependencies = {
    repository,
    createAdapter: vi.fn(() => adapter),
    decrypt: vi.fn(() => JSON.stringify({ access_token: SECRET })),
    sleep,
    now: () => NOW,
    createLockId: () => "lock-1",
    ...overrides,
  };
  return {
    service: createAnalyticsSyncService(dependencies),
    repository: dependencies.repository,
    adapter,
    snapshots,
    sleep,
  };
}

describe("analytics account synchronization", () => {
  it("syncs exactly the previous 90 completed Tehran calendar days on first sync", async () => {
    const harness = createHarness();

    const result = await harness.service.syncAccount("account-1");

    expect(result).toEqual({
      accountId: "account-1",
      status: "synced",
      snapshotCount: 2,
      range: {
        start: "2026-05-22T20:30:00.000Z",
        end: "2026-08-20T20:30:00.000Z",
      },
    });
    expect(harness.adapter.fetchAccountDaily).toHaveBeenCalledWith({
      accountId: "account-1",
      startDate: new Date("2026-05-22T20:30:00.000Z"),
      endDate: new Date("2026-08-20T20:30:00.000Z"),
      timezone: "Asia/Tehran",
    });
    expect(harness.adapter.fetchContentDaily).toHaveBeenCalledWith({
      accountId: "account-1",
      startDate: new Date("2026-05-22T20:30:00.000Z"),
      endDate: new Date("2026-08-20T20:30:00.000Z"),
      timezone: "Asia/Tehran",
    });
  });

  it("starts incremental sync one Tehran day after the latest successful day", async () => {
    const harness = createHarness();
    vi.mocked(harness.repository.getAnalyticsSyncedThrough)
      .mockResolvedValue(new Date("2026-08-18T20:30:00.000Z"));

    const result = await harness.service.syncAccount("account-1");

    expect(result.range).toEqual({
      start: "2026-08-18T20:30:00.000Z",
      end: "2026-08-20T20:30:00.000Z",
    });
  });

  it("skips an account already current without decrypting or changing sync state", async () => {
    const decrypt = vi.fn(() => JSON.stringify({ access_token: SECRET }));
    const harness = createHarness({ decrypt });
    vi.mocked(harness.repository.getAnalyticsSyncedThrough)
      .mockResolvedValue(new Date("2026-08-20T20:30:00.000Z"));

    const result = await harness.service.syncAccount("account-1");

    expect(result).toEqual({
      accountId: "account-1",
      status: "skipped",
      snapshotCount: 0,
      range: {
        start: "2026-08-20T20:30:00.000Z",
        end: "2026-08-20T20:30:00.000Z",
      },
    });
    expect(decrypt).not.toHaveBeenCalled();
    expect(harness.repository.markSyncSuccess).not.toHaveBeenCalled();
    expect(harness.repository.markSyncFailure).not.toHaveBeenCalled();
    expect(harness.repository.releaseLease).toHaveBeenCalledWith("account-1", "lock-1");
  });

  it("maps adapter rows to discriminated snapshots with the internal account scope", async () => {
    const harness = createHarness();

    await harness.service.syncAccount("account-1");

    expect(harness.snapshots[0]).toEqual([
      {
        platform: "youtube",
        accountId: "account-1",
        scopeType: "account",
        scopeId: "account-1",
        date: new Date("2026-08-20T00:00:00.000Z"),
        fetchedAt: NOW,
        metrics: {
          metricType: "account",
          views: 100,
          likes: 10,
          comments: 4,
          shares: 2,
          watchTimeMinutes: 300,
          averageViewDurationSeconds: 45,
          subscribersTotal: 900,
          subscribersGained: 8,
          subscribersLost: 1,
        },
        metadata: {
          metadataType: "account",
          channelId: "youtube-channel-1",
          channelTitle: "A channel",
        },
      },
      {
        platform: "youtube",
        accountId: "account-1",
        scopeType: "content",
        scopeId: "video-1",
        date: new Date("2026-08-20T00:00:00.000Z"),
        fetchedAt: NOW,
        metrics: {
          metricType: "content",
          views: 80,
          likes: 9,
          comments: 3,
          shares: 1,
          watchTimeMinutes: 200,
          averageViewDurationSeconds: 40,
        },
        metadata: {
          metadataType: "content",
          contentId: "content-1",
          videoId: "video-1",
          title: "Video one",
          thumbnailUrl: "https://example.com/video-1.jpg",
          publishedAt: new Date("2026-08-01T10:00:00.000Z"),
          channelId: "youtube-channel-1",
          channelTitle: "A channel",
        },
      },
    ]);
    expect(JSON.stringify(harness.snapshots)).not.toContain(SECRET);
    expect(harness.repository.commitSync).toHaveBeenCalledWith(
      "account-1",
      "lock-1",
      NOW,
      new Date("2026-08-20T20:30:00.000Z"),
      harness.snapshots[0],
    );
    expect(harness.repository.upsertSnapshots).not.toHaveBeenCalled();
    expect(harness.repository.markSyncSuccess).not.toHaveBeenCalled();
    expect(harness.repository.markSyncFailure).not.toHaveBeenCalled();
  });

  it("retries retryable fetches up to the third attempt with fixed delays", async () => {
    const adapter = createAdapter();
    vi.mocked(adapter.fetchAccountDaily)
      .mockRejectedValueOnce(new YouTubeAnalyticsApiError("retryable"))
      .mockRejectedValueOnce(new YouTubeAnalyticsApiError("retryable"));
    const sleep = vi.fn(async (_ms: number) => undefined);
    const harness = createHarness({ createAdapter: () => adapter, sleep });

    const result = await harness.service.syncAccount("account-1");

    expect(result.status).toBe("synced");
    expect(adapter.fetchAccountDaily).toHaveBeenCalledTimes(3);
    expect(adapter.fetchContentDaily).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([500, 1500]);
  });

  it("preserves a reconnect failure when its sibling exhausts retryable attempts", async () => {
    const adapter = createAdapter();
    vi.mocked(adapter.fetchAccountDaily)
      .mockRejectedValue(new YouTubeAnalyticsApiError("retryable"));
    vi.mocked(adapter.fetchContentDaily)
      .mockRejectedValue(new YouTubeAnalyticsApiError("reconnect_required"));
    const harness = createHarness({ createAdapter: () => adapter });

    const result = await harness.service.syncAccount("account-1");

    expect(result).toMatchObject({ status: "failed", code: "RECONNECT_REQUIRED" });
    expect(adapter.fetchAccountDaily).toHaveBeenCalledTimes(3);
    expect(adapter.fetchContentDaily).toHaveBeenCalledTimes(1);
    expect(harness.sleep.mock.calls.map(([delay]) => delay)).toEqual([500, 1500]);
  });

  it("preserves an API-disabled failure when the other fetch exhausts retries", async () => {
    const adapter = createAdapter();
    vi.mocked(adapter.fetchAccountDaily)
      .mockRejectedValue(new YouTubeAnalyticsApiError("api_not_enabled"));
    vi.mocked(adapter.fetchContentDaily)
      .mockRejectedValue(new YouTubeAnalyticsApiError("retryable"));
    const harness = createHarness({ createAdapter: () => adapter });

    const result = await harness.service.syncAccount("account-1");

    expect(result).toMatchObject({ status: "failed", code: "API_NOT_ENABLED" });
    expect(adapter.fetchAccountDaily).toHaveBeenCalledTimes(1);
    expect(adapter.fetchContentDaily).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["reconnect_required", "RECONNECT_REQUIRED"],
    ["api_not_enabled", "API_NOT_ENABLED"],
    ["quota_exhausted", "QUOTA_EXHAUSTED"],
    ["permanent", "SYNC_FAILED"],
  ] as const)("maps %s failures without retrying or exposing provider details", async (classification, code) => {
    const providerError = new YouTubeAnalyticsApiError(classification);
    const adapter = createAdapter();
    vi.mocked(adapter.fetchAccountDaily).mockRejectedValue(providerError);
    const harness = createHarness({ createAdapter: () => adapter });

    const result = await harness.service.syncAccount("account-1");

    expect(result.status).toBe("failed");
    expect(result.code).toBe(code);
    expect(result.snapshotCount).toBe(0);
    expect(adapter.fetchAccountDaily).toHaveBeenCalledTimes(1);
    expect(harness.sleep).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(providerError.message);
    expect(harness.repository.markSyncFailure).toHaveBeenCalledOnce();
    expect(vi.mocked(harness.repository.markSyncFailure).mock.calls[0][2]).not.toContain(providerError.message);
  });

  it.each(["decrypt", "fetch", "commit"] as const)("releases its lease after a %s failure", async (stage) => {
    const adapter = createAdapter();
    const { repository } = createRepository();
    const decrypt = stage === "decrypt"
      ? vi.fn(() => { throw new Error(`bad credential ${SECRET}`); })
      : vi.fn(() => JSON.stringify({ access_token: SECRET }));
    if (stage === "fetch") {
      vi.mocked(adapter.fetchAccountDaily).mockRejectedValue(new Error(`fetch ${SECRET}`));
    }
    if (stage === "commit") {
      vi.mocked(repository.commitSync).mockRejectedValue(new Error(`commit ${SECRET}`));
    }
    const service = createAnalyticsSyncService({
      repository,
      createAdapter: () => adapter,
      decrypt,
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => "lock-1",
    });

    const result = await service.syncAccount("account-1");

    expect(result).toMatchObject({
      accountId: "account-1",
      status: "failed",
      code: "SYNC_FAILED",
      snapshotCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(repository.markSyncSuccess).not.toHaveBeenCalled();
    expect(repository.markSyncFailure).toHaveBeenCalledOnce();
    expect(vi.mocked(repository.markSyncFailure).mock.calls[0][2]).not.toContain(SECRET);
    expect(repository.releaseLease).toHaveBeenCalledWith("account-1", "lock-1");
  });

  it("records a failed atomic commit and retries the same range on the next run", async () => {
    const { repository } = createRepository();
    vi.mocked(repository.commitSync)
      .mockRejectedValueOnce(new Error("second chunk failed"))
      .mockResolvedValueOnce(2);
    const service = createAnalyticsSyncService({
      repository,
      createAdapter: () => createAdapter(),
      decrypt: () => JSON.stringify({ access_token: SECRET }),
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => "lock-1",
    });

    const first = await service.syncAccount("account-1");
    const second = await service.syncAccount("account-1");

    expect(first).toMatchObject({ status: "failed", code: "SYNC_FAILED" });
    expect(repository.markSyncFailure).toHaveBeenCalledWith(
      "account-1",
      "lock-1",
      "همگام‌سازی آمار ناموفق بود.",
      "SYNC_FAILED",
      null,
    );
    expect(repository.getAnalyticsSyncedThrough).toHaveBeenNthCalledWith(2, "account-1");
    expect(second).toMatchObject({
      status: "synced",
      range: {
        start: "2026-05-22T20:30:00.000Z",
        end: "2026-08-20T20:30:00.000Z",
      },
    });
  });

  it("does not acquire a lease for an unsyncable account and reports a blocked lease", async () => {
    const missing = createHarness();
    vi.mocked(missing.repository.listSyncableAccounts).mockResolvedValue([]);

    await expect(missing.service.syncAccount("missing")).resolves.toMatchObject({
      accountId: "missing",
      status: "failed",
      code: "ACCOUNT_NOT_SYNCABLE",
      snapshotCount: 0,
    });
    expect(missing.repository.acquireLease).not.toHaveBeenCalled();
    expect(missing.repository.markSyncFailure).toHaveBeenCalledWith(
      "missing",
      null,
      "این حساب برای همگام‌سازی آمار آماده نیست.",
      "ACCOUNT_NOT_SYNCABLE",
      null,
    );

    const blocked = createHarness();
    vi.mocked(blocked.repository.acquireLease).mockResolvedValue(false);
    await expect(blocked.service.syncAccount("account-1")).resolves.toMatchObject({
      status: "skipped",
      code: "SYNC_IN_PROGRESS",
      snapshotCount: 0,
    });
    expect(blocked.repository.releaseLease).not.toHaveBeenCalled();
  });

  it("isolates account failures and preserves input order", async () => {
    const { repository } = createRepository();
    vi.mocked(repository.listSyncableAccounts).mockImplementation(async (ids) =>
      ids?.[0] === "missing" ? [] : [syncableAccount(ids?.[0])]
    );
    const service = createAnalyticsSyncService({
      repository,
      createAdapter: () => createAdapter(),
      decrypt: () => JSON.stringify({ access_token: SECRET }),
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => "lock-1",
    });

    const results = await service.syncAccounts(["account-1", "missing", "account-2"]);

    expect(results.map(({ accountId, status }) => ({ accountId, status }))).toEqual([
      { accountId: "account-1", status: "synced" },
      { accountId: "missing", status: "failed" },
      { accountId: "account-2", status: "synced" },
    ]);
  });

  it("starts the second account before the first finishes while preserving result order", async () => {
    const { repository } = createRepository();
    vi.mocked(repository.listSyncableAccounts).mockImplementation(async (ids) => [
      { ...syncableAccount(ids?.[0]), encryptedCredential: ids?.[0] ?? "missing" },
    ]);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let markSecondStarted!: () => void;
    const secondStarted = new Promise<void>((resolve) => { markSecondStarted = resolve; });
    let firstFinished = false;
    let secondStartedBeforeFirstFinished = false;
    const service = createAnalyticsSyncService({
      repository,
      createAdapter(tokens) {
        const adapter = createAdapter();
        if (tokens.access_token === "first") {
          const fetchAccountDaily = adapter.fetchAccountDaily;
          adapter.fetchAccountDaily = vi.fn(async (input) => {
            await firstGate;
            firstFinished = true;
            return fetchAccountDaily(input);
          });
        } else {
          const fetchAccountDaily = adapter.fetchAccountDaily;
          adapter.fetchAccountDaily = vi.fn(async (input) => {
            secondStartedBeforeFirstFinished = !firstFinished;
            markSecondStarted();
            return fetchAccountDaily(input);
          });
        }
        return adapter;
      },
      decrypt: (payload) => JSON.stringify({ access_token: payload.replace(/^encrypted-/, "") }),
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => "lock-1",
    });

    const syncPromise = service.syncAccounts(["first", "second"]);
    const beganInParallel = await Promise.race([
      secondStarted.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 25)),
    ]);
    releaseFirst();
    const results = await syncPromise;

    expect(beganInParallel).toBe(true);
    expect(secondStartedBeforeFirstFinished).toBe(true);
    expect(results.map(({ accountId, status }) => ({ accountId, status }))).toEqual([
      { accountId: "first", status: "synced" },
      { accountId: "second", status: "synced" },
    ]);
  });

  it.each(["account", "content"] as const)(
    "fails secret-safely without committing when a %s row belongs to another channel",
    async (scope) => {
      const harness = createHarness();
      const method = scope === "account" ? harness.adapter.fetchAccountDaily : harness.adapter.fetchContentDaily;
      vi.mocked(method).mockImplementation(async (input) => {
        const rows = scope === "account"
          ? await createAdapter().fetchAccountDaily(input)
          : await createAdapter().fetchContentDaily(input);
        return rows.map((row) => ({ ...row, channelId: "other-channel" })) as never;
      });

      const result = await harness.service.syncAccount("account-1");

      expect(result).toMatchObject({ status: "failed", code: "SYNC_FAILED", snapshotCount: 0 });
      expect(harness.repository.commitSync).not.toHaveBeenCalled();
      expect(harness.repository.markSyncFailure).toHaveBeenCalledWith(
        "account-1",
        "lock-1",
        "همگام‌سازی آمار ناموفق بود.",
        "SYNC_FAILED",
        null,
      );
      expect(JSON.stringify(result)).not.toContain("other-channel");
    },
  );

  it("commits the exclusive cursor when both reports are empty so first sync is not repeated", async () => {
    const harness = createHarness();
    vi.mocked(harness.adapter.fetchAccountDaily).mockResolvedValue([]);
    vi.mocked(harness.adapter.fetchContentDaily).mockResolvedValue([]);

    await expect(harness.service.syncAccount("account-1")).resolves.toMatchObject({
      status: "synced",
      snapshotCount: 0,
    });
    expect(harness.repository.commitSync).toHaveBeenCalledWith(
      "account-1",
      "lock-1",
      NOW,
      new Date("2026-08-20T20:30:00.000Z"),
      [],
    );
  });

  it("limits bulk work to three accounts and preserves input-order results", async () => {
    const { repository } = createRepository();
    vi.mocked(repository.listSyncableAccounts).mockImplementation(async (ids) => [syncableAccount(ids?.[0])]);
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const service = createAnalyticsSyncService({
      repository,
      createAdapter() {
        const adapter = createAdapter();
        adapter.fetchAccountDaily = vi.fn(async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise<void>((resolve) => releases.push(resolve));
          active -= 1;
          return [];
        });
        adapter.fetchContentDaily = vi.fn(async () => []);
        return adapter;
      },
      decrypt: () => "{}",
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => "lock-1",
    });

    const promise = service.syncAccounts(["a", "b", "c", "d", "e"]);
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    expect(maximum).toBe(3);
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());

    expect((await promise).map((result) => result.accountId)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not launch queued accounts after quota exhaustion and fills their slots deterministically", async () => {
    const { repository } = createRepository();
    vi.mocked(repository.listSyncableAccounts).mockImplementation(async (ids) => [syncableAccount(ids?.[0])]);
    const launched: string[] = [];
    const service = createAnalyticsSyncService({
      repository,
      createAdapter(tokens) {
        const adapter = createAdapter();
        adapter.fetchAccountDaily = vi.fn(async () => {
          launched.push(tokens.access_token ?? "");
          if (tokens.access_token === "a") throw new YouTubeAnalyticsApiError("quota_exhausted");
          return [];
        });
        adapter.fetchContentDaily = vi.fn(async () => []);
        return adapter;
      },
      decrypt: (payload) => JSON.stringify({ access_token: payload.replace(/^encrypted-/, "") }),
      sleep: async () => undefined,
      now: () => NOW,
      createLockId: () => "lock-1",
      concurrency: 1,
    });

    const results = await service.syncAccounts(["a", "b", "c"]);

    expect(launched).toEqual(["a"]);
    expect(results).toMatchObject([
      { accountId: "a", status: "failed", code: "QUOTA_EXHAUSTED", nextAttemptAt: "2026-08-21T20:30:00.000Z" },
      { accountId: "b", status: "skipped", code: "QUOTA_EXHAUSTED", nextAttemptAt: "2026-08-21T20:30:00.000Z" },
      { accountId: "c", status: "skipped", code: "QUOTA_EXHAUSTED", nextAttemptAt: "2026-08-21T20:30:00.000Z" },
    ]);
  });
});

describe("account sync HTTP mapping", () => {
  it.each([
    ["SYNC_IN_PROGRESS", 409],
    ["ACCOUNT_NOT_SYNCABLE", 422],
    ["RECONNECT_REQUIRED", 502],
    ["API_NOT_ENABLED", 502],
    ["QUOTA_EXHAUSTED", 502],
    ["SYNC_FAILED", 502],
    [undefined, 200],
  ] as const)("maps %s to HTTP %i", (code, status) => {
    expect(accountSyncHttpStatus({
      accountId: "account-1",
      status: code ? (code === "SYNC_IN_PROGRESS" ? "skipped" : "failed") : "synced",
      code,
      snapshotCount: 0,
    })).toBe(status);
  });
});
