import { DateTime } from "luxon";

import { executeAnalyticsSyncRequest } from "./analytics-controls";
import type { AccountSyncResult } from "./sync";

// --- Smart Auto-Sync Queue (Task 2) ---
export const AUTO_SYNC_DELAY_MS = 2 * 60 * 60 * 1000;
export const AUTO_SYNC_DAILY_CRON = "0 3 * * *";
export const AUTO_SYNC_TIMEZONE = "Asia/Tehran" as const;

export function shouldEnqueueForNewVideo(lastPublish: Date, accountId: string): boolean {
  if (!(lastPublish instanceof Date) || Number.isNaN(lastPublish.getTime())) return false;
  if (typeof accountId !== "string" || accountId.length === 0) return false;
  return Date.now() - lastPublish.getTime() < AUTO_SYNC_DELAY_MS;
}

export function getNextDailySyncTime(now: Date = new Date()): Date {
  const tehran = DateTime.fromJSDate(now, { zone: AUTO_SYNC_TIMEZONE });
  let next = tehran.set({ hour: 3, minute: 0, second: 0, millisecond: 0 });
  if (next <= tehran) next = next.plus({ days: 1 });
  return next.toJSDate();
}

export function getQuotaRetryAt(now: Date = new Date()): Date {
  // QUOTA_EXHAUSTED must set analytics_next_attempt_at to tomorrow 03:00 Asia/Tehran
  return getNextDailySyncTime(now);
}

export function enqueueAnalyticsSync(
  accountId: string,
  delayMs: number = AUTO_SYNC_DELAY_MS,
): ReturnType<typeof setTimeout> {
  const safeDelay = Math.max(0, Number.isFinite(delayMs) ? delayMs : AUTO_SYNC_DELAY_MS);
  return setTimeout(async () => {
    try {
      const { syncYouTubeAccount } = await import("./sync");
      await syncYouTubeAccount(accountId);
    } catch (err) {
      console.error(`[analytics auto-sync] enqueueAnalyticsSync failed for ${accountId}:`, (err as Error).message);
    }
  }, safeDelay);
}

export function enqueueForPublish(
  accountId: string,
  publishAt: Date = new Date(),
): ReturnType<typeof setTimeout> | null {
  if (!shouldEnqueueForNewVideo(publishAt, accountId)) return null;
  const elapsed = Date.now() - publishAt.getTime();
  const remaining = Math.max(0, AUTO_SYNC_DELAY_MS - elapsed);
  return enqueueAnalyticsSync(accountId, remaining);
}

let dailySyncTimeout: ReturnType<typeof setTimeout> | null = null;
let dailySyncInterval: ReturnType<typeof setInterval> | null = null;

export function scheduleDailySync(): void {
  if (dailySyncTimeout) clearTimeout(dailySyncTimeout);
  if (dailySyncInterval) clearInterval(dailySyncInterval);
  const now = new Date();
  const next = getNextDailySyncTime(now);
  const delay = Math.max(0, next.getTime() - now.getTime());
  dailySyncTimeout = setTimeout(async () => {
    try {
      const { syncYouTubeAccounts } = await import("./sync");
      const { analyticsRepository } = await import("./repository");
      const accounts = await analyticsRepository.listSyncableAccounts();
      if (accounts.length > 0) {
        await syncYouTubeAccounts(accounts.map((a) => a.id));
      }
    } catch (err) {
      console.error("[analytics auto-sync] daily sync failed:", (err as Error).message);
    }
    dailySyncInterval = setInterval(async () => {
      try {
        const { syncYouTubeAccounts } = await import("./sync");
        const { analyticsRepository } = await import("./repository");
        const accounts = await analyticsRepository.listSyncableAccounts();
        if (accounts.length > 0) {
          await syncYouTubeAccounts(accounts.map((a) => a.id));
        }
      } catch (err) {
        console.error("[analytics auto-sync] daily interval sync failed:", (err as Error).message);
      }
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

export function cancelDailySync(): void {
  if (dailySyncTimeout) {
    clearTimeout(dailySyncTimeout);
    dailySyncTimeout = null;
  }
  if (dailySyncInterval) {
    clearInterval(dailySyncInterval);
    dailySyncInterval = null;
  }
}

/**
 * Poll workflowEvents for publish_success within last 2h and enqueue per-channel sync.
 * Used by instrumentation worker to implement "2 hours after publish for same channel".
 */
export async function runAnalyticsAutoSyncTick(now: Date = new Date()): Promise<{ enqueued: string[] }> {
  const threshold = new Date(now.getTime() - AUTO_SYNC_DELAY_MS);
  try {
    const { db } = await import("@/db");
    const { workflowEvents } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const events = await db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.action, "publish_success") as never)
      .limit(50) as unknown as Array<{ after: unknown; createdAt: Date }>;
    const recent = events.filter((e) => e.createdAt && e.createdAt >= threshold);
    const accountIds = new Set<string>();
    for (const evt of recent) {
      const after = evt.after as Record<string, unknown> | null;
      if (!after) continue;
      // Try to extract accountIds from targets array or accountId field
      const targets = (after as { targets?: unknown }).targets as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(targets)) {
        for (const t of targets) {
          const acc = (t.account_id as string) ?? (t.accountId as string) ?? (t.socialAccountId as string);
          if (typeof acc === "string" && acc.length > 0) accountIds.add(acc);
        }
      }
      const single = (after as { accountId?: unknown; socialAccountId?: unknown }).accountId ?? (after as { socialAccountId?: unknown }).socialAccountId;
      if (typeof single === "string" && single.length > 0) accountIds.add(single);
    }
    const enqueued: string[] = [];
    for (const accountId of accountIds) {
      // Only enqueue if event is within 2h window
      const lastPublish = recent
        .filter((e) => {
          const after = e.after as Record<string, unknown>;
          const has = JSON.stringify(after).includes(accountId);
          return has;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt;
      if (lastPublish && shouldEnqueueForNewVideo(lastPublish, accountId)) {
        enqueueAnalyticsSync(accountId, AUTO_SYNC_DELAY_MS);
        enqueued.push(accountId);
      }
    }
    return { enqueued };
  } catch {
    return { enqueued: [] };
  }
}

interface SyncResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

interface SyncResponseBody {
  ok: boolean;
  data?: {
    results: AccountSyncResult[];
    succeeded: number;
    failed: number;
    skipped: number;
  };
  error?: string;
  code?: string;
}

interface RequestGenerationGuard {
  capture(): number;
  isCurrent(generation: number): boolean;
}

interface AnalyticsSyncControllerOptions {
  accountId: string;
  permissions: readonly string[];
  allowedAccountIds: readonly string[] | null | undefined;
  dimensions?: readonly string[] | null;
  requestFilterKey: string;
  generation: RequestGenerationGuard;
  getCurrentFilterKey(): string;
  fetchSync(body: string): Promise<SyncResponse>;
  setResults(results: AccountSyncResult[] | null): void;
  setError(error: string | null): void;
  setFeedbackFilterKey(filterKey: string | null): void;
  setSyncing(syncing: boolean): void;
  showToast(message: string, tone: "success" | "error"): void;
  revalidateOverview(): Promise<unknown>;
  revalidateAccounts(): Promise<unknown>;
}

class SyncRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
  }
}

function syncMessage(data: { succeeded: number; failed: number; skipped: number }): string {
  return `${data.succeeded.toLocaleString("fa-IR")} موفق، ${data.failed.toLocaleString("fa-IR")} ناموفق و ${data.skipped.toLocaleString("fa-IR")} ردشده`;
}

export async function runAnalyticsSync(options: AnalyticsSyncControllerOptions): Promise<void> {
  const requestGeneration = options.generation.capture();
  const completionIsCurrent = () =>
    options.generation.isCurrent(requestGeneration)
    && options.getCurrentFilterKey() === options.requestFilterKey;

  options.setResults(null);
  options.setError(null);
  options.setFeedbackFilterKey(null);
  options.setSyncing(true);

  try {
    const attempt = await executeAnalyticsSyncRequest(
      options.accountId,
      options.permissions,
      options.allowedAccountIds,
      options.fetchSync,
      options.dimensions,
    );
    if (!attempt.sent) {
      if (!completionIsCurrent()) return;
      options.setError(attempt.reason);
      options.setFeedbackFilterKey(options.requestFilterKey);
      return;
    }

    const response = attempt.response;
    const body = await response.json() as SyncResponseBody;
    if (!response.ok || !body.ok || !body.data) {
      throw new SyncRequestError(body.error ?? "همگام‌سازی ناموفق بود.", body.code, response.status);
    }
    if (!completionIsCurrent()) return;

    options.setResults(body.data.results);
    options.setFeedbackFilterKey(options.requestFilterKey);
    const reconnectRequired = body.data.results.some((result) => result.code === "RECONNECT_REQUIRED");
    options.showToast(
      reconnectRequired
        ? `همگام‌سازی کامل نشد: اتصال حساب یوتیوب را دوباره برقرار کنید. ${syncMessage(body.data)}`
        : `نتیجه همگام‌سازی: ${syncMessage(body.data)}`,
      body.data.failed > 0 ? "error" : "success",
    );
    await Promise.all([options.revalidateOverview(), options.revalidateAccounts()]);
  } catch (error) {
    if (!completionIsCurrent()) return;
    const message = error instanceof Error ? error.message : "همگام‌سازی ناموفق بود.";
    options.setError(message);
    options.setFeedbackFilterKey(options.requestFilterKey);
    options.showToast(message, "error");
  } finally {
    options.setSyncing(false);
  }
}
