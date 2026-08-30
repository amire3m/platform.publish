import { AnalyticsAccessError, getAnalyticsOverview } from "@/lib/analytics/queries";
import { parseAnalyticsRange } from "@/lib/analytics/ranges";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { accountScopeForUser, canAccessAccount } from "@/lib/permissions";
import { restrictAccountScopeToOrganization } from "@/lib/accounts/organization";
import { listMainReportAccountIds } from "@/lib/accounts/organization-server";

interface AnalyticsUser {
  role: string;
  allowedAccountIds?: string[] | null;
}

interface CompatibilityAccount {
  id: string;
  platform: string;
}

interface CompatibilityContent {
  status: string;
  scheduledAtUtc: Date | null;
  platformTargets: Record<string, unknown>[];
  [key: string]: unknown;
}

interface LegacyDashboardFields {
  syncStatus: unknown;
  totals: {
    channels: number;
    pages: number;
    followers: number;
    views: number;
    engagement: number;
  };
  statusCounts: Record<string, number>;
  failedContents: CompatibilityContent[];
  pendingApproval: CompatibilityContent[];
  upcoming: CompatibilityContent[];
  hasAnalyticsData: boolean;
}

interface OverviewDependencies {
  requirePermission(permission: "view_analytics"): Promise<{
    user: AnalyticsUser | null;
    response: Response | null;
  }>;
  getOverview: typeof getAnalyticsOverview;
  listReportingAccountIds(): Promise<string[]>;
  getLegacyDashboardFields(
    user: AnalyticsUser,
    requestedAccountId?: string,
    reportingAccountIds?: readonly string[],
  ): Promise<LegacyDashboardFields>;
}

function sanitizeAccountRecord(record: Record<string, unknown>): Record<string, unknown> | null {
  const hasSnakeAlias = Object.prototype.hasOwnProperty.call(record, "account_id");
  const hasCamelAlias = Object.prototype.hasOwnProperty.call(record, "accountId");
  if (hasSnakeAlias && hasCamelAlias && record.account_id !== record.accountId) return null;
  const accountId = hasSnakeAlias ? record.account_id : record.accountId;
  if (typeof accountId !== "string") return null;
  const { account_id: _snakeAlias, accountId: _camelAlias, ...metadata } = record;
  return { ...metadata, account_id: accountId };
}

export function buildLegacyDashboardFields(input: {
  user: AnalyticsUser;
  requestedAccountId?: string;
  syncStatus: unknown;
  accounts: readonly CompatibilityAccount[];
  contents: readonly CompatibilityContent[];
  reportingAccountIds?: readonly string[];
}): LegacyDashboardFields {
  const accountScope = accountScopeForUser(input.user);
  const accountMatches = (accountId: string) =>
    canAccessAccount(input.user, accountId)
    && (!input.reportingAccountIds || input.reportingAccountIds.includes(accountId))
    && (!input.requestedAccountId || accountId === input.requestedAccountId);
  const accounts = input.accounts.filter((account) => accountMatches(account.id));
  const contents = input.contents.flatMap((item) => {
    const platformTargets = item.platformTargets.flatMap((target) => {
      const sanitized = sanitizeAccountRecord(target);
      return sanitized && accountMatches(sanitized.account_id as string) ? [sanitized] : [];
    });
    if ((accountScope !== null || input.requestedAccountId) && platformTargets.length === 0) {
      return [];
    }
    const targetIds = new Set(platformTargets.map((target) => target.account_id as string));
    const publishResults = Array.isArray(item.publishResults)
      ? item.publishResults.flatMap((result) => {
          if (typeof result !== "object" || result === null || Array.isArray(result)) return [];
          const sanitized = sanitizeAccountRecord(result as Record<string, unknown>);
          return sanitized && targetIds.has(sanitized.account_id as string) ? [sanitized] : [];
        })
      : [];
    return [{ ...item, platformTargets, publishResults }];
  });
  const youtubeAccounts = accounts.filter((account) => account.platform === "youtube");
  const instagramAccounts = accounts.filter((account) => account.platform === "instagram");
  const statusCounts = contents.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    syncStatus: input.syncStatus,
    totals: {
      channels: youtubeAccounts.length,
      pages: instagramAccounts.length,
      followers: 0,
      views: 0,
      engagement: 0,
    },
    statusCounts,
    failedContents: contents.filter((item) => item.status === "failed").slice(0, 10),
    pendingApproval: contents.filter((item) => item.status === "in_review").slice(0, 10),
    upcoming: contents
      .filter((item) => item.status === "scheduled")
      .sort((a, b) => (a.scheduledAtUtc?.getTime() ?? 0) - (b.scheduledAtUtc?.getTime() ?? 0))
      .slice(0, 10),
    hasAnalyticsData: false,
  };
}

async function getLegacyDashboardFields(
  user: AnalyticsUser,
  requestedAccountId?: string,
  reportingAccountIds?: readonly string[],
): Promise<LegacyDashboardFields> {
  const [{ db }, { content, socialAccounts }, { getSyncStatus }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("@/lib/telegram/tgdb"),
  ]);
  const [allAccounts, contents] = await Promise.all([
    db.select().from(socialAccounts),
    db.select().from(content),
  ]);
  return buildLegacyDashboardFields({
    user,
    requestedAccountId,
    syncStatus: await getSyncStatus(),
    accounts: allAccounts,
    contents,
    reportingAccountIds,
  });
}

const defaultDependencies: OverviewDependencies = {
  requirePermission,
  getOverview: getAnalyticsOverview,
  listReportingAccountIds: () => listMainReportAccountIds(),
  getLegacyDashboardFields,
};

const ALLOWED_OVERVIEW_DIMENSIONS = new Set([
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

function normalizeOverviewDimension(dim: string): string {
  return dim.toLowerCase().trim().replace(/-/g, "_");
}

export async function handleAnalyticsOverviewRequest(
  request: Request,
  dependencies: OverviewDependencies,
): Promise<Response> {
  const { user, response } = await dependencies.requirePermission("view_analytics");
  if (!user) return response!;
  const url = new URL(request.url);
  const range = parseAnalyticsRange(url.searchParams.get("range") ?? "90");
  if (!range) return jsonError("بازه آمار نامعتبر است.", 422, "INVALID_RANGE");
  const dimensionRaw = url.searchParams.get("dimension");
  let dimension: string | undefined;
  if (dimensionRaw !== null) {
    const normalized = normalizeOverviewDimension(dimensionRaw);
    if (!ALLOWED_OVERVIEW_DIMENSIONS.has(dimensionRaw.toLowerCase().trim()) && !ALLOWED_OVERVIEW_DIMENSIONS.has(normalized)) {
      return jsonError("بعد آماری نامعتبر است.", 422, "INVALID_DIMENSION");
    }
    dimension = normalized;
  }
  const accountId = url.searchParams.get("accountId") || undefined;
  const reportingAccountIds = await dependencies.listReportingAccountIds();
  const allowedAccountIds = restrictAccountScopeToOrganization(accountScopeForUser(user), reportingAccountIds);
  if (accountId && !allowedAccountIds.includes(accountId)) {
    return jsonError("این حساب در گزارش اصلی Emro YT قرار ندارد.", 403, "FORBIDDEN");
  }
  try {
    const analytics = await dependencies.getOverview({ range, accountId, allowedAccountIds, dimension } as never);
    const legacy = await dependencies.getLegacyDashboardFields(user, accountId, allowedAccountIds);
    const current = analytics.comparison.current;
    return jsonOk({
      ...analytics,
      ...legacy,
      totals: {
        ...legacy.totals,
        followers: analytics.subscribersTotal ?? 0,
        views: current.views,
        engagement: current.likes + current.comments + current.shares,
      },
      hasAnalyticsData: analytics.hasSnapshotData,
    });
  } catch (error) {
    if (error instanceof AnalyticsAccessError) {
      return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
    }
    throw error;
  }
}

export function GET(request: Request) {
  return handleAnalyticsOverviewRequest(request, defaultDependencies);
}
