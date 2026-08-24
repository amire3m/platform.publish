import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { historyQuerySchema } from "@/lib/workflow/validation";

export interface HistoryRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<WorkflowRepository, "listHistory">;
}

const defaultDeps: HistoryRouteDependencies = {
  requirePermission,
  repository: workflowRepository as unknown as HistoryRouteDependencies["repository"],
};

function mapError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  return null;
}

export async function handleHistoryRequest(request: Request, deps: HistoryRouteDependencies = defaultDeps): Promise<Response> {
  const { user, response } = await deps.requirePermission("view_workflow");
  if (!user) return response!;

  const url = new URL(request.url);
  const raw = {
    entityType: url.searchParams.get("entityType") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    actorUserId: url.searchParams.get("actorUserId") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? undefined,
  };

  const parsed = historyQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
  }

  try {
    const { entityType, entityId, actorUserId, page, pageSize } = parsed.data;
    const result = await deps.repository.listHistory({ entityType, entityId, actorUserId, page, pageSize });
    return jsonOk({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: Math.ceil(result.total / result.pageSize) || 1,
    });
  } catch (e) {
    const m = mapError(e);
    if (m) return m;
    return jsonInternalError(e, "api/workflow/history");
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleHistoryRequest(request, defaultDeps);
}
