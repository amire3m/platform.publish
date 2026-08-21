import { AnalyticsAccessError, getAnalyticsExportRows, getContentAnalytics } from "@/lib/analytics/queries";
import { buildAnalyticsPeriod, parseAnalyticsRange } from "@/lib/analytics/ranges";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { accountScopeForUser } from "@/lib/permissions";

interface DetailDependencies {
  requirePermission(permission: "view_analytics"): Promise<{
    user: { role: string; allowedAccountIds?: string[] | null } | null;
    response: Response | null;
  }>;
  getContent: typeof getContentAnalytics;
  getExportRows: typeof getAnalyticsExportRows;
  now(): Date;
}

const defaultDependencies: DetailDependencies = {
  requirePermission,
  getContent: getContentAnalytics,
  getExportRows: getAnalyticsExportRows,
  now: () => new Date(),
};

export async function handleAnalyticsDetailRequest(
  request: Request,
  params: { scope: string; id: string },
  dependencies: DetailDependencies,
): Promise<Response> {
  const { user, response } = await dependencies.requirePermission("view_analytics");
  if (!user) return response!;
  if (params.scope !== "account" && params.scope !== "content") {
    return jsonError("scope نامعتبر است.", 422, "INVALID_SCOPE");
  }
  const range = parseAnalyticsRange(new URL(request.url).searchParams.get("range") ?? "90");
  if (!range) return jsonError("بازه آمار نامعتبر است.", 422, "INVALID_RANGE");
  const allowedAccountIds = accountScopeForUser(user);
  try {
    if (params.scope === "content") {
      const result = await dependencies.getContent({
        externalVideoId: params.id,
        range,
        allowedAccountIds,
      });
      return result ? jsonOk(result) : jsonError("محتوا یافت نشد.", 404, "NOT_FOUND");
    }
    const period = buildAnalyticsPeriod(range, dependencies.now(), "Asia/Tehran");
    const rows = await dependencies.getExportRows({
      scope: "account",
      range,
      accountId: params.id,
      contentId: null,
      startDate: period.currentStart,
      endDate: period.currentEnd,
      allowedAccountIds,
    });
    return jsonOk(rows);
  } catch (error) {
    if (error instanceof AnalyticsAccessError) {
      return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
    }
    throw error;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ scope: string; id: string }> },
) {
  return handleAnalyticsDetailRequest(request, await context.params, defaultDependencies);
}
