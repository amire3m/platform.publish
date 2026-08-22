import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { createProgramSchema } from "@/lib/workflow/validation";

export interface ProgramsRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<WorkflowRepository, "listPrograms" | "createProgram" | "getProgram" | "instantiateTemplate">;
}

const defaultDependencies: ProgramsRouteDependencies = {
  requirePermission,
  repository: workflowRepository,
};

function mapRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "INVALID_TRANSITION" || code === "REASON_REQUIRED" || code === "PRODUCTION_NOT_READY") {
    return jsonError(message, 409, code);
  }
  return null;
}

export async function handleProgramsRequest(
  request: Request,
  deps: ProgramsRouteDependencies = defaultDependencies,
): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const { user, response } = await deps.requirePermission("view_workflow");
    if (!user) return response!;
    try {
      const url = new URL(request.url);
      const search = url.searchParams.get("search") ?? url.searchParams.get("q") ?? undefined;
      const ownerUserId = url.searchParams.get("ownerUserId") ?? undefined;
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const programs = await deps.repository.listPrograms(
        { search: search ?? undefined, ownerUserId, includeArchived },
        { userId: (user as unknown as { id?: string }).id ?? null },
      );
      return jsonOk(programs);
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonError((error as Error).message ?? "خطای سرور", 500);
    }
  }

  if (method === "POST") {
    const { user, response } = await deps.requirePermission("manage_programs");
    if (!user) return response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    const parsed = createProgramSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    try {
      const data = parsed.data;
      const created = await deps.repository.createProgram({
        title: data.title,
        seriesName: data.seriesName ?? null,
        ownerUserId: data.ownerUserId ?? null,
        dueAt: data.dueAt ?? null,
        notes: data.notes ?? null,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      });

      // If templateId provided, instantiate template items as deliverables
      if (data.templateId) {
        try {
          // repository.instantiateTemplate may not be mocked in some tests; guard
          if (deps.repository.instantiateTemplate) {
            await deps.repository.instantiateTemplate({
              templateId: data.templateId,
              programId: created.id,
              actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
              baseDueAt: data.dueAt ?? null,
            });
          }
        } catch (e) {
          // If template not found, map to 404
          const mapped = mapRepositoryError(e);
          if (mapped) return mapped;
          throw e;
        }
      }

      return jsonOk(created, 201);
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonError((error as Error).message ?? "خطای سرور", 500);
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request): Promise<Response> {
  return handleProgramsRequest(request, defaultDependencies);
}

export async function POST(request: Request): Promise<Response> {
  return handleProgramsRequest(request, defaultDependencies);
}
