import { analyticsRepository } from "@/lib/analytics/repository";
import { syncYouTubeAccounts, type AccountSyncResult } from "@/lib/analytics/sync";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { accountScopeForUser } from "@/lib/permissions";

interface SyncDependencies {
  requirePermission(permission: "view_analytics" | "manage_accounts"): Promise<{
    user: { role: string; allowedAccountIds?: string[] | null } | null;
    response: Response | null;
  }>;
  listSyncableAccounts(accountIds?: readonly string[]): Promise<readonly { id: string }[]>;
  syncAccounts(accountIds: readonly string[]): Promise<AccountSyncResult[]>;
}

const defaultDependencies: SyncDependencies = {
  requirePermission,
  listSyncableAccounts: (accountIds) => analyticsRepository.listSyncableAccounts(accountIds),
  syncAccounts: syncYouTubeAccounts,
};

async function readRequestedAccount(request: Request): Promise<string | null | undefined> {
  const text = await request.text();
  if (!text) return null;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
    const accountId = (body as { accountId?: unknown }).accountId;
    if (accountId === undefined) return null;
    return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
  } catch {
    return undefined;
  }
}

export async function handleAnalyticsSyncRequest(
  request: Request,
  dependencies: SyncDependencies,
): Promise<Response> {
  const view = await dependencies.requirePermission("view_analytics");
  if (!view.user) return view.response!;
  const requestedAccountId = await readRequestedAccount(request);
  if (requestedAccountId === undefined) {
    return jsonError("درخواست همگام‌سازی نامعتبر است.", 422, "INVALID_REQUEST");
  }
  const allowedAccountIds = accountScopeForUser(view.user);
  let accountIds: readonly string[];
  if (requestedAccountId) {
    if (allowedAccountIds !== null && !allowedAccountIds.includes(requestedAccountId)) {
      return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
    }
    accountIds = [requestedAccountId];
  } else if (allowedAccountIds !== null) {
    accountIds = (await dependencies.listSyncableAccounts(allowedAccountIds))
      .map((account) => account.id);
  } else {
    const management = await dependencies.requirePermission("manage_accounts");
    if (!management.user) return management.response!;
    accountIds = (await dependencies.listSyncableAccounts()).map((account) => account.id);
  }
  const results = await dependencies.syncAccounts(accountIds);
  return jsonOk({
    results,
    succeeded: results.filter((result) => result.status === "synced").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  });
}

export function POST(request: Request) {
  return handleAnalyticsSyncRequest(request, defaultDependencies);
}
