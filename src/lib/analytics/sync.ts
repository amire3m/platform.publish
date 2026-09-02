import { randomUUID } from "node:crypto";
import type { Credentials } from "google-auth-library";
import { DateTime } from "luxon";

import { analyticsRepository, type AnalyticsRepository } from "@/lib/analytics/repository";
import type { AnalyticsSnapshotInput } from "@/lib/analytics/types";
import {
  createYouTubeAnalyticsAdapter,
  YouTubeAnalyticsApiError,
  type YouTubeAnalyticsAdapter,
} from "@/lib/analytics/youtube-adapter";
import { decryptSecret } from "@/lib/crypto";

const TIMEZONE = "Asia/Tehran";
const INITIAL_SYNC_DAYS = 90;
const RETRY_DELAYS_MS = [500, 1500] as const;
/**
 * YouTube Analytics publishes day metrics with a 24-72h lag. Each incremental
 * sync previously fetched exactly ONE day (yesterday) and zero-filled whatever
 * the API hadn't published yet — permanently storing zeros. Re-fetching the
 * last few days on every sync lets the upsert in commitSync repair those days
 * with real data as soon as YouTube publishes it.
 */
const REPAIR_OVERLAP_DAYS = 4;

const FAILURE_MESSAGES = {
  RECONNECT_REQUIRED: "اتصال حساب منقضی شده است؛ حساب را دوباره متصل کنید.",
  API_NOT_ENABLED: "سرویس YouTube Analytics برای این حساب فعال نیست.",
  QUOTA_EXHAUSTED: "سهمیه سرویس YouTube Analytics به پایان رسیده است.",
  SYNC_FAILED: "همگام‌سازی آمار ناموفق بود.",
} as const;

export interface AccountSyncResult {
  accountId: string;
  status: "synced" | "skipped" | "failed";
  code?: "ACCOUNT_NOT_SYNCABLE" | "SYNC_IN_PROGRESS" | "RECONNECT_REQUIRED" | "API_NOT_ENABLED" | "QUOTA_EXHAUSTED" | "SYNC_FAILED";
  snapshotCount: number;
  range?: { start: string; end: string };
  message?: string;
  nextAttemptAt?: string;
}

export interface AnalyticsSyncDependencies {
  repository: AnalyticsRepository;
  createAdapter(tokens: Credentials): YouTubeAnalyticsAdapter;
  decrypt(payload: string): string;
  sleep(ms: number): Promise<void>;
  now(): Date;
  createLockId(): string;
  concurrency?: number;
}

type FailureCode = keyof typeof FAILURE_MESSAGES;

function failureCode(error: unknown): FailureCode {
  if (!(error instanceof YouTubeAnalyticsApiError)) return "SYNC_FAILED";
  switch (error.classification) {
    case "reconnect_required":
      return "RECONNECT_REQUIRED";
    case "api_not_enabled":
      return "API_NOT_ENABLED";
    case "quota_exhausted":
      return "QUOTA_EXHAUSTED";
    default:
      return "SYNC_FAILED";
  }
}

function parseCredentials(value: string): Credentials {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid credential payload");
  }
  return parsed as Credentials;
}

async function fetchWithRetry<T>(
  fetch: () => Promise<T>,
  sleep: AnalyticsSyncDependencies["sleep"],
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch();
    } catch (error) {
      const retryable = error instanceof YouTubeAnalyticsApiError
        && error.classification === "retryable";
      if (!retryable || attempt === RETRY_DELAYS_MS.length) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function mapAccountSnapshot(
  row: Awaited<ReturnType<YouTubeAnalyticsAdapter["fetchAccountDaily"]>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "account",
    scopeId: accountId,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "account",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      subscribersTotal: row.subscribersTotal,
      subscribersGained: row.subscribersGained,
      subscribersLost: row.subscribersLost,
    },
    metadata: {
      metadataType: "account",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
    },
  };
}

function mapContentSnapshot(
  row: Awaited<ReturnType<YouTubeAnalyticsAdapter["fetchContentDaily"]>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "content",
    scopeId: row.videoId,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "content",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
    },
    metadata: {
      metadataType: "content",
      contentId: row.contentId,
      videoId: row.videoId,
      title: row.title,
      thumbnailUrl: row.thumbnailUrl,
      publishedAt: row.publishedAt,
      channelId: row.channelId,
      channelTitle: row.channelTitle,
    },
  };
}

function mapGeoSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchGeoDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "geo",
    scopeId: row.country,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "geo",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "geo",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      country: row.country,
    },
  };
}

function mapAgeGenderSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchAgeGenderDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "age_gender",
    scopeId: `${row.ageGroup}:${row.gender}`,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "age_gender",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "age_gender",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      ageGroup: row.ageGroup,
      gender: row.gender,
    },
  };
}

function mapDeviceSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchDeviceDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "device",
    scopeId: row.deviceType,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "device",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "device",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      deviceType: row.deviceType,
    },
  };
}

function mapTrafficSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchTrafficDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "traffic",
    scopeId: row.trafficSource,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "traffic",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "traffic",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      trafficSource: row.trafficSource,
    },
  };
}

function mapSearchSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchSearchDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "search",
    scopeId: row.keyword,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "search",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "search",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      keyword: row.keyword,
    },
  };
}

function mapRetentionSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchRetentionDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  return {
    platform: "youtube",
    accountId,
    scopeType: "retention",
    scopeId: row.videoId,
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "retention",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "retention",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      videoId: row.videoId,
    },
  };
}

function mapRevenueSnapshot(
  row: Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchRevenueDaily"]>>>[number],
  accountId: string,
  fetchedAt: Date,
): AnalyticsSnapshotInput {
  // Revenue is daily aggregate; store as retention with synthetic videoId to avoid clobbering account snapshot key.
  return {
    platform: "youtube",
    accountId,
    scopeType: "retention",
    scopeId: "revenue",
    date: row.date,
    fetchedAt,
    metrics: {
      metricType: "retention",
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      watchTimeMinutes: row.watchTimeMinutes,
      averageViewDurationSeconds: row.averageViewDurationSeconds,
      impressions: row.impressions,
      estimatedRevenue: row.estimatedRevenue,
      cpm: row.cpm,
      averageViewPercentage: row.averageViewPercentage,
    },
    metadata: {
      metadataType: "retention",
      channelId: row.channelId,
      channelTitle: row.channelTitle,
      videoId: "revenue",
    },
  };
}

const DIMENSION_FETCHER_MAP: Record<string, keyof YouTubeAnalyticsAdapter> = {
  geo: "fetchGeoDaily",
  audience: "fetchAgeGenderDaily",
  age_gender: "fetchAgeGenderDaily",
  "age-gender": "fetchAgeGenderDaily",
  device: "fetchDeviceDaily",
  traffic: "fetchTrafficDaily",
  search: "fetchSearchDaily",
  retention: "fetchRetentionDaily",
  revenue: "fetchRevenueDaily",
};

function normalizeDimension(dim: string): string {
  return dim.toLowerCase().trim().replace(/-/g, "_");
}

export function createAnalyticsSyncService(deps: AnalyticsSyncDependencies): {
  syncAccount(accountId: string, options?: { now?: Date; dimensions?: string[] }): Promise<AccountSyncResult>;
  syncAccounts(accountIds: readonly string[], options?: { now?: Date; dimensions?: string[] }): Promise<AccountSyncResult[]>;
} {
  async function syncAccount(
    accountId: string,
    options?: { now?: Date; dimensions?: string[] },
  ): Promise<AccountSyncResult> {
    const now = options?.now ?? deps.now();
    const lockId = deps.createLockId();
    let leaseAcquired = false;
    let range: AccountSyncResult["range"];

    try {
      const [account] = await deps.repository.listSyncableAccounts([accountId]);
      if (!account) {
        const message = "این حساب برای همگام‌سازی آمار آماده نیست.";
        try {
          await deps.repository.markSyncFailure(
            accountId,
            null,
            message,
            "ACCOUNT_NOT_SYNCABLE",
            null,
          );
        } catch {
          // The result remains deterministic even if the account no longer exists.
        }
        return {
          accountId,
          status: "failed",
          code: "ACCOUNT_NOT_SYNCABLE",
          snapshotCount: 0,
          message,
        };
      }

      leaseAcquired = await deps.repository.acquireLease(accountId, lockId, now);
      if (!leaseAcquired) {
        return {
          accountId,
          status: "skipped",
          code: "SYNC_IN_PROGRESS",
          snapshotCount: 0,
          message: "همگام‌سازی این حساب در حال اجرا است.",
        };
      }

      const end = DateTime.fromJSDate(now, { zone: TIMEZONE }).startOf("day");
      const syncedThrough = await deps.repository.getAnalyticsSyncedThrough(accountId);
      const firstUnsynced = syncedThrough
        ? DateTime.fromJSDate(syncedThrough, { zone: TIMEZONE }).startOf("day")
        : end.minus({ days: INITIAL_SYNC_DAYS });
      // Overlap the last few already-synced days so late-arriving YouTube
      // metrics overwrite the zero-fill from previous runs (upsert in commitSync).
      const start = syncedThrough
        ? firstUnsynced.minus({ days: REPAIR_OVERLAP_DAYS })
        : firstUnsynced;
      range = {
        start: start.toJSDate().toISOString(),
        end: end.toJSDate().toISOString(),
      };

      if (start >= end) {
        return { accountId, status: "skipped", snapshotCount: 0, range };
      }

      const credentials = parseCredentials(deps.decrypt(account.encryptedCredential));
      const adapter = deps.createAdapter(credentials);
      const input = {
        accountId,
        startDate: start.toJSDate(),
        endDate: end.toJSDate(),
        timezone: TIMEZONE,
      };

      // Core fetches always, dimension fetches lazily per requested tabs
      const requestedDimensions = options?.dimensions ?? [];
      const seenFetchers = new Set<string>();
      const dimensionSnapshotTasks: Array<Promise<AnalyticsSnapshotInput[]>> = [];
      for (const raw of requestedDimensions) {
        if (typeof raw !== "string") continue;
        const normalized = normalizeDimension(raw);
        const fetcherKey = DIMENSION_FETCHER_MAP[normalized];
        if (!fetcherKey) continue;
        if (seenFetchers.has(fetcherKey)) continue;
        const fetcher = (adapter as unknown as Record<string, unknown>)[fetcherKey] as
          | ((inp: typeof input) => Promise<unknown[]>)
          | undefined;
        if (typeof fetcher !== "function") continue;
        seenFetchers.add(fetcherKey);
        const task: Promise<AnalyticsSnapshotInput[]> = fetchWithRetry(
          () => (fetcher as (inp: typeof input) => Promise<unknown[]>).call(adapter, input),
          deps.sleep,
        ).then((rows) => {
          const typedRows = rows as unknown[];
          switch (fetcherKey) {
            case "fetchGeoDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchGeoDaily"]>>>).map((row) =>
                mapGeoSnapshot(row, accountId, now),
              );
            case "fetchAgeGenderDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchAgeGenderDaily"]>>>).map((row) =>
                mapAgeGenderSnapshot(row, accountId, now),
              );
            case "fetchDeviceDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchDeviceDaily"]>>>).map((row) =>
                mapDeviceSnapshot(row, accountId, now),
              );
            case "fetchTrafficDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchTrafficDaily"]>>>).map((row) =>
                mapTrafficSnapshot(row, accountId, now),
              );
            case "fetchSearchDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchSearchDaily"]>>>).map((row) =>
                mapSearchSnapshot(row, accountId, now),
              );
            case "fetchRetentionDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchRetentionDaily"]>>>).map((row) =>
                mapRetentionSnapshot(row, accountId, now),
              );
            case "fetchRevenueDaily":
              return (typedRows as Awaited<ReturnType<NonNullable<YouTubeAnalyticsAdapter["fetchRevenueDaily"]>>>).map((row) =>
                mapRevenueSnapshot(row, accountId, now),
              );
            default:
              return [];
          }
        });
        dimensionSnapshotTasks.push(task);
      }

      const coreSnapshotTasks: Array<Promise<AnalyticsSnapshotInput[]>> = [
        fetchWithRetry(() => adapter.fetchAccountDaily(input), deps.sleep).then((rows) =>
          (rows as Awaited<ReturnType<YouTubeAnalyticsAdapter["fetchAccountDaily"]>>).map((row) =>
            mapAccountSnapshot(row, accountId, now),
          ),
        ),
        fetchWithRetry(() => adapter.fetchContentDaily(input), deps.sleep)
          .then((rows) =>
            (rows as Awaited<ReturnType<YouTubeAnalyticsAdapter["fetchContentDaily"]>>).map((row) =>
              mapContentSnapshot(row, accountId, now),
            ),
          )
          .catch((error: unknown) => {
            if (error instanceof YouTubeAnalyticsApiError && error.classification === "unsupported_query") {
              return [] as AnalyticsSnapshotInput[];
            }
            throw error;
          }),
      ];

      const allTasks = [...coreSnapshotTasks, ...dimensionSnapshotTasks];
      const fetchResults = await Promise.allSettled(allTasks);
      const errors = fetchResults
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason as unknown);
      if (errors.length > 0) {
        const nonRetryable = errors.find((error) =>
          !(error instanceof YouTubeAnalyticsApiError)
          || error.classification !== "retryable"
        );
        throw nonRetryable ?? errors[0];
      }

      const snapshots = (fetchResults as PromiseFulfilledResult<AnalyticsSnapshotInput[]>[]).flatMap((r) => r.value);

      // Channel identity guard for all snapshots that carry channelId
      const mismatched = snapshots.some((s) => {
        const md = (s.metadata as unknown as { channelId?: string });
        return md.channelId && md.channelId !== account.externalAccountId;
      });
      if (mismatched) {
        throw new Error("Analytics channel identity mismatch");
      }

      const snapshotCount = await deps.repository.commitSync(
        accountId,
        lockId,
        now,
        end.toJSDate(),
        snapshots,
      );
      return { accountId, status: "synced", snapshotCount, range };
    } catch (error) {
      const code = failureCode(error);
      const message = FAILURE_MESSAGES[code];
      const nextAttemptAt = code === "QUOTA_EXHAUSTED"
        ? DateTime.fromJSDate(now, { zone: TIMEZONE }).startOf("day").plus({ days: 1 }).toJSDate()
        : null;
      try {
        await deps.repository.markSyncFailure(
          accountId,
          leaseAcquired ? lockId : null,
          message,
          code,
          nextAttemptAt,
        );
      } catch {
        // Preserve the original secret-safe result if recording the failure also fails.
      }
      return {
        accountId,
        status: "failed",
        code,
        snapshotCount: 0,
        range,
        message,
        ...(nextAttemptAt ? { nextAttemptAt: nextAttemptAt.toISOString() } : {}),
      };
    } finally {
      if (leaseAcquired) {
        try {
          await deps.repository.releaseLease(accountId, lockId);
        } catch {
          // The lock is time-bounded by the repository lease.
        }
      }
    }
  }

  return {
    syncAccount,
    async syncAccounts(accountIds, options) {
      const configured = deps.concurrency ?? 3;
      const concurrency = Math.min(10, Math.max(1, Number.isFinite(configured) ? Math.floor(configured) : 3));
      const results: Array<AccountSyncResult | undefined> = new Array(accountIds.length);
      let nextIndex = 0;
      let quotaResult: AccountSyncResult | null = null;

      const worker = async () => {
        while (!quotaResult) {
          const index = nextIndex;
          if (index >= accountIds.length) return;
          nextIndex += 1;
          const accountId = accountIds[index];
          try {
            results[index] = await syncAccount(accountId, options);
          } catch {
            results[index] = {
              accountId,
              status: "failed",
              code: "SYNC_FAILED",
              snapshotCount: 0,
              message: FAILURE_MESSAGES.SYNC_FAILED,
            };
          }
          if (results[index]?.code === "QUOTA_EXHAUSTED") quotaResult = results[index]!;
        }
      };

      await Promise.all(Array.from(
        { length: Math.min(concurrency, accountIds.length) },
        () => worker(),
      ));
      if (quotaResult) {
        for (let index = 0; index < results.length; index += 1) {
          if (results[index]) continue;
          results[index] = {
            accountId: accountIds[index],
            status: "skipped",
            code: "QUOTA_EXHAUSTED",
            snapshotCount: 0,
            message: FAILURE_MESSAGES.QUOTA_EXHAUSTED,
            ...((quotaResult as AccountSyncResult).nextAttemptAt
              ? { nextAttemptAt: (quotaResult as AccountSyncResult).nextAttemptAt }
              : {}),
          };
        }
      }
      return results as AccountSyncResult[];
    },
  };
}

export function accountSyncHttpStatus(result: AccountSyncResult): number {
  if (result.code === "SYNC_IN_PROGRESS") return 409;
  if (result.code === "ACCOUNT_NOT_SYNCABLE") return 422;
  if (result.status === "failed") return 502;
  return 200;
}

const defaultSyncService = createAnalyticsSyncService({
  repository: analyticsRepository,
  createAdapter: createYouTubeAnalyticsAdapter,
  decrypt: decryptSecret,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  createLockId: randomUUID,
});

export async function syncYouTubeAccount(
  accountId: string,
  options?: { now?: Date; dimensions?: string[] },
): Promise<AccountSyncResult> {
  return defaultSyncService.syncAccount(accountId, options);
}

export async function syncYouTubeAccounts(
  accountIds: readonly string[],
  options?: { now?: Date; dimensions?: string[] },
): Promise<AccountSyncResult[]> {
  return defaultSyncService.syncAccounts(accountIds, options);
}
