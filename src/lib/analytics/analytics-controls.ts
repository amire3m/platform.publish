import type { AnalyticsRange } from "./types";

export interface AnalyticsFilterState {
  accountId: string;
  range: AnalyticsRange;
  scope: "account" | "content";
}

export function buildAnalyticsSyncRequest(
  accountId: string,
  permissions: readonly string[],
  allowedAccountIds: readonly string[] | null | undefined,
): { allowed: boolean; body: string | null; reason: string | null } {
  if (accountId) {
    return { allowed: true, body: JSON.stringify({ accountId }), reason: null };
  }
  if (permissions.includes("manage_accounts") || (allowedAccountIds?.length ?? 0) > 0) {
    return { allowed: true, body: "", reason: null };
  }
  return {
    allowed: false,
    body: null,
    reason: "برای همگام‌سازی یک کانال انتخاب کنید",
  };
}

export async function executeAnalyticsSyncRequest<T>(
  accountId: string,
  permissions: readonly string[],
  allowedAccountIds: readonly string[] | null | undefined,
  send: (body: string) => Promise<T>,
): Promise<{ sent: false; reason: string } | { sent: true; response: T }> {
  const request = buildAnalyticsSyncRequest(accountId, permissions, allowedAccountIds);
  if (!request.allowed || request.body === null) {
    return { sent: false, reason: request.reason! };
  }
  return { sent: true, response: await send(request.body) };
}

export function analyticsFilterKey(filters: AnalyticsFilterState): string {
  return `${filters.accountId}\u0000${filters.range}\u0000${filters.scope}`;
}

export function createRequestGenerationGuard(initialGeneration = 0): {
  capture(): number;
  invalidate(): number;
  isCurrent(generation: number): boolean;
} {
  let generation = initialGeneration;
  return {
    capture: () => generation,
    invalidate: () => ++generation,
    isCurrent: (candidate) => candidate === generation,
  };
}

export function analyticsFiltersChanged(
  current: AnalyticsFilterState,
  next: AnalyticsFilterState,
): boolean {
  return current.accountId !== next.accountId || current.range !== next.range || current.scope !== next.scope;
}
