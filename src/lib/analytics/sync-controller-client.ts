// Client-safe re-export: browser bundle must never import @/db (pg) — that is
// why the build previously failed with "Can't resolve 'dns'/'net'/'fs'".
// runAnalyticsSync and its types are pure fetch wrappers; the server-only
// auto-sync queue helpers (enqueueAnalyticsSync, scheduleDailySync,
// runAnalyticsAutoSyncTick) stay in ./sync-controller and run exclusively in
// instrumentation (Node runtime).
import type { AccountSyncResult } from "./sync";

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
    const { executeAnalyticsSyncRequest } = await import("./analytics-controls");
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
