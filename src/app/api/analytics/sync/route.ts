import { analyticsRepository } from "@/lib/analytics/repository";
import { syncYouTubeAccounts, type AccountSyncResult } from "@/lib/analytics/sync";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { accountScopeForUser } from "@/lib/permissions";
import { restrictAccountScopeToOrganization } from "@/lib/accounts/organization";
import { listMainReportAccountIds } from "@/lib/accounts/organization-server";

interface SyncDependencies {
  requirePermission(permission: "view_analytics" | "manage_accounts"): Promise<{
    user: { role: string; allowedAccountIds?: string[] | null } | null;
    response: Response | null;
  }>;
  listSyncableAccounts(accountIds?: readonly string[]): Promise<readonly { id: string }[]>;
  listReportingAccountIds(): Promise<string[]>;
  syncAccounts(accountIds: readonly string[], options?: { dimensions?: string[] }): Promise<AccountSyncResult[]>;
}

const defaultDependencies: SyncDependencies = {
  requirePermission,
  listSyncableAccounts: (accountIds) => analyticsRepository.listSyncableAccounts(accountIds),
  listReportingAccountIds: () => listMainReportAccountIds("youtube"),
  syncAccounts: syncYouTubeAccounts,
};

const ALLOWED_SYNC_DIMENSIONS = new Set([
  "geo",
  "audience",
  "age_gender",
  "age-gender",
  "device",
  "traffic",
  "search",
  "retention",
  "revenue",
]);

function normalizeSyncDimension(dim: string): string {
  return dim.toLowerCase().trim().replace(/-/g, "_");
}

function parseSyncDimensions(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const parsed: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return undefined;
    const normalized = normalizeSyncDimension(item);
    if (!ALLOWED_SYNC_DIMENSIONS.has(item.toLowerCase().trim()) && !ALLOWED_SYNC_DIMENSIONS.has(normalized)) {
      return undefined;
    }
    parsed.push(normalized);
  }
  return parsed;
}

interface SyncPayload {
  accountId: string | null | undefined;
  dimensions?: string[];
}

async function readSyncPayload(request: Request): Promise<SyncPayload | undefined> {
  const text = await request.text();
  if (!text) return { accountId: null };
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
    const accountIdRaw = (body as { accountId?: unknown }).accountId;
    let accountId: string | null | undefined;
    if (accountIdRaw === undefined) accountId = null;
    else if (typeof accountIdRaw === "string" && accountIdRaw.length > 0) accountId = accountIdRaw;
    else return undefined;

    const dimensionsRaw = (body as { dimensions?: unknown }).dimensions;
    let dimensions: string[] | undefined;
    if (dimensionsRaw !== undefined) {
      const parsed = parseSyncDimensions(dimensionsRaw);
      if (parsed === undefined) return undefined;
      dimensions = parsed;
    }

    return { accountId, dimensions };
  } catch {
    return undefined;
  }
}

async function readRequestedAccount(request: Request): Promise<string | null | undefined> {
  const payload = await readSyncPayload(request);
  if (payload === undefined) return undefined;
  return payload.accountId;
}

export async function handleAnalyticsSyncRequest(
  request: Request,
  dependencies: SyncDependencies,
): Promise<Response> {
  const view = await dependencies.requirePermission("view_analytics");
  if (!view.user) return view.response!;
  const payload = await readSyncPayload(request);
  if (payload === undefined) {
    return jsonError("درخواست همگام‌سازی نامعتبر است.", 422, "INVALID_REQUEST");
  }
  const requestedAccountId = payload.accountId;
  const requestedDimensions = payload.dimensions;
  if (requestedAccountId === undefined) {
    return jsonError("درخواست همگام‌سازی نامعتبر است.", 422, "INVALID_REQUEST");
  }
  const userAccountScope = accountScopeForUser(view.user);
  const allowedAccountIds = restrictAccountScopeToOrganization(
    userAccountScope,
    await dependencies.listReportingAccountIds(),
  );
  let accountIds: readonly string[];
  if (requestedAccountId) {
    if (!allowedAccountIds.includes(requestedAccountId)) {
      return jsonError("این حساب در گزارش اصلی Emro YT قرار ندارد.", 403, "FORBIDDEN");
    }
    accountIds = [requestedAccountId];
  } else {
    if (userAccountScope === null) {
      const management = await dependencies.requirePermission("manage_accounts");
      if (!management.user) return management.response!;
    }
    accountIds = (await dependencies.listSyncableAccounts(allowedAccountIds)).map((account) => account.id);
  }
  const results = requestedDimensions
    ? await dependencies.syncAccounts(accountIds, { dimensions: requestedDimensions })
    : await dependencies.syncAccounts(accountIds);
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
