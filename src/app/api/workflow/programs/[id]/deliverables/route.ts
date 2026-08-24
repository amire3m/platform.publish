import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { createDeliverableSchema, reorderDeliverablesSchema } from "@/lib/workflow/validation";

export interface ProgramDeliverablesRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<WorkflowRepository, "createDeliverable" | "reorderDeliverables" | "getProgram"> & {
    listDeliverablesForProgram?: (programId: string) => Promise<unknown[]>;
  };
}

const defaultDeps: ProgramDeliverablesRouteDependencies = {
  requirePermission,
  repository: workflowRepository as unknown as ProgramDeliverablesRouteDependencies["repository"],
};

function mapError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "REASON_REQUIRED") return jsonError(message, 422, "REASON_REQUIRED");
  if (code === "INVALID_TRANSITION") return jsonError(message, 409, "INVALID_TRANSITION");
  if (code === "PRODUCTION_NOT_READY") return jsonError(message, 409, "PRODUCTION_NOT_READY");
  return null;
}

export async function handleProgramDeliverablesRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: ProgramDeliverablesRouteDependencies = defaultDeps,
): Promise<Response> {
  const { id: programId } = await ctx.params;
  const method = request.method.toUpperCase();

  if (method === "POST") {
    const { user, response } = await deps.requirePermission("manage_programs");
    if (!user) return response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }
    const parsed = createDeliverableSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
    }
    try {
      const data = parsed.data;
      const created = await deps.repository.createDeliverable({
        programId,
        name: data.name,
        kind: data.kind ?? null,
        assigneeUserId: data.assigneeUserId ?? null,
        dueAt: data.dueAt ?? null,
        notes: data.notes ?? null,
        sortOrder: data.sortOrder,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      });
      return jsonOk(created, 201);
    } catch (e) {
      const mapped = mapError(e);
      if (mapped) return mapped;
      return jsonInternalError(e, "api/workflow/programs/[id]/deliverables POST");
    }
  }

  if (method === "GET") {
    const { user, response } = await deps.requirePermission("view_workflow");
    if (!user) return response!;
    try {
      // Prefer repository.getProgram detail for enrichment, but fallback to listDeliverablesForProgram if exposed
      const repoAny = deps.repository as unknown as { listDeliverablesForProgram?: (id: string) => Promise<unknown[]>; getProgram?: (id: string) => Promise<unknown> };
      if (repoAny.listDeliverablesForProgram) {
        const items = await repoAny.listDeliverablesForProgram(programId);
        return jsonOk(items);
      }
      // fallback via getProgram which returns detail with deliverables
      if (repoAny.getProgram) {
        const detail = await (deps.repository as unknown as { getProgram: (id: string) => Promise<{ deliverables?: unknown[] }> }).getProgram(programId);
        if (!detail) return jsonError("برنامه یافت نشد.", 404, "NOT_FOUND");
        // detail.deliverables or detail itself
        const items = (detail as unknown as { deliverables: unknown[] }).deliverables ?? [];
        return jsonOk(items);
      }
      return jsonOk([]);
    } catch (e) {
      const mapped = mapError(e);
      if (mapped) return mapped;
      return jsonInternalError(e, "api/workflow/programs/[id]/deliverables GET");
    }
  }

  if (method === "PATCH") {
    const { user, response } = await deps.requirePermission("manage_programs");
    if (!user) return response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }
    const parsed = reorderDeliverablesSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
    }
    try {
      const orderedIds = parsed.data.orderedIds;
      const result = await deps.repository.reorderDeliverables({
        programId,
        orderedIds,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      });
      return jsonOk(result);
    } catch (e) {
      const mapped = mapError(e);
      if (mapped) return mapped;
      return jsonInternalError(e, "api/workflow/programs/[id]/deliverables PATCH");
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleProgramDeliverablesRequest(request, ctx, defaultDeps);
}
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleProgramDeliverablesRequest(request, ctx, defaultDeps);
}
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleProgramDeliverablesRequest(request, ctx, defaultDeps);
}
