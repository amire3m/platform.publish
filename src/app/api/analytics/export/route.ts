import { encodeAnalyticsCsv } from "@/lib/analytics/csv";
import { AnalyticsAccessError, getAnalyticsExportRows } from "@/lib/analytics/queries";
import { buildAnalyticsPeriod, parseAnalyticsRange } from "@/lib/analytics/ranges";
import { jsonError, requirePermission } from "@/lib/api-helpers";
import { accountScopeForUser } from "@/lib/permissions";

interface ExportDependencies {
  requirePermission(permission: "view_analytics" | "export_data"): Promise<{
    user: { role: string; allowedAccountIds?: string[] | null } | null;
    response: Response | null;
  }>;
  getExportRows: typeof getAnalyticsExportRows;
  encodeCsv: typeof encodeAnalyticsCsv;
  now(): Date;
}

const defaultDependencies: ExportDependencies = {
  requirePermission,
  getExportRows: getAnalyticsExportRows,
  encodeCsv: encodeAnalyticsCsv,
  now: () => new Date(),
};

export async function handleAnalyticsExportRequest(
  request: Request,
  dependencies: ExportDependencies,
): Promise<Response> {
  const view = await dependencies.requirePermission("view_analytics");
  if (!view.user) return view.response!;
  const exportPermission = await dependencies.requirePermission("export_data");
  if (!exportPermission.user) return exportPermission.response!;
  const url = new URL(request.url);
  const range = parseAnalyticsRange(url.searchParams.get("range") ?? "90");
  if (!range) return jsonError("بازه آمار نامعتبر است.", 422, "INVALID_RANGE");
  const scope = url.searchParams.get("scope") ?? "account";
  if (scope !== "account" && scope !== "content") {
    return jsonError("محدوده خروجی نامعتبر است.", 422, "INVALID_SCOPE");
  }
  const now = dependencies.now();
  const period = buildAnalyticsPeriod(range, now, "Asia/Tehran");
  try {
    const rows = await dependencies.getExportRows({
      scope,
      range,
      accountId: url.searchParams.get("accountId") || null,
      contentId: url.searchParams.get("contentId") || null,
      startDate: period.currentStart,
      endDate: period.currentEnd,
      allowedAccountIds: accountScopeForUser(view.user),
    });
    const date = now.toISOString().slice(0, 10);
    return new Response(dependencies.encodeCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="youtube-analytics-${range}d-${date}.csv"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AnalyticsAccessError) {
      return jsonError("شما به این حساب دسترسی ندارید.", 403, "FORBIDDEN");
    }
    throw error;
  }
}

export function GET(request: Request) {
  return handleAnalyticsExportRequest(request, defaultDependencies);
}
