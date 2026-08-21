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

export function createAnalyticsSyncService(deps: AnalyticsSyncDependencies): {
  syncAccount(accountId: string, options?: { now?: Date }): Promise<AccountSyncResult>;
  syncAccounts(accountIds: readonly string[], options?: { now?: Date }): Promise<AccountSyncResult[]>;
} {
  async function syncAccount(
    accountId: string,
    options?: { now?: Date },
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
      const start = syncedThrough
        ? DateTime.fromJSDate(syncedThrough, { zone: TIMEZONE }).startOf("day")
        : end.minus({ days: INITIAL_SYNC_DAYS });
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

      const fetchResults = await Promise.allSettled([
        fetchWithRetry(() => adapter.fetchAccountDaily(input), deps.sleep),
        fetchWithRetry(() => adapter.fetchContentDaily(input), deps.sleep),
      ]);
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

      const accountRows = (fetchResults[0] as PromiseFulfilledResult<Awaited<ReturnType<YouTubeAnalyticsAdapter["fetchAccountDaily"]>>>).value;
      const contentRows = (fetchResults[1] as PromiseFulfilledResult<Awaited<ReturnType<YouTubeAnalyticsAdapter["fetchContentDaily"]>>>).value;
      if (
        accountRows.some((row) => row.channelId !== account.externalAccountId)
        || contentRows.some((row) => row.channelId !== account.externalAccountId)
      ) {
        throw new Error("Analytics channel identity mismatch");
      }
      const snapshots = [
        ...accountRows.map((row) => mapAccountSnapshot(row, accountId, now)),
        ...contentRows.map((row) => mapContentSnapshot(row, accountId, now)),
      ];
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
  options?: { now?: Date },
): Promise<AccountSyncResult> {
  return defaultSyncService.syncAccount(accountId, options);
}

export async function syncYouTubeAccounts(
  accountIds: readonly string[],
  options?: { now?: Date },
): Promise<AccountSyncResult[]> {
  return defaultSyncService.syncAccounts(accountIds, options);
}
