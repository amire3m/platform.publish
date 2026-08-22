import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { createTemplateSchema } from "@/lib/workflow/validation";

export interface TemplatesRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<WorkflowRepository, "createTemplate"> & {
    listTemplates?: () => Promise<unknown[]>;
    // fallback if not yet implemented
  };
  listTemplates?: () => Promise<unknown[]>;
}

const defaultDependencies: TemplatesRouteDependencies = {
  requirePermission,
  repository: workflowRepository as unknown as TemplatesRouteDependencies["repository"],
  listTemplates: async () => {
    // Access InMemory port templates directly if available, otherwise try DB
    const port = (workflowRepository as unknown as { port?: { templates?: unknown[] } }).port;
    if (port?.templates) return port.templates as unknown[];
    // Fallback via Drizzle: query workflowTemplates
    try {
      const { db } = await import("@/db");
      const { workflowTemplates } = await import("@/db/schema");
      const rows = await db.select().from(workflowTemplates).limit(200);
      return rows;
    } catch {
      return [];
    }
  },
};

function mapRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  return null;
}

export async function handleTemplatesRequest(
  request: Request,
  deps: TemplatesRouteDependencies = defaultDependencies,
): Promise<Response> {
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const { user, response } = await deps.requirePermission("view_workflow");
    if (!user) return response!;
    try {
      const lister = deps.listTemplates ?? (deps.repository as unknown as { listTemplates?: () => Promise<unknown[]> }).listTemplates;
      let templates: unknown[] = [];
      if (lister) {
        templates = await lister.call(deps.repository);
      } else if (deps.listTemplates) {
        templates = await deps.listTemplates();
      }
      return jsonOk(templates);
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonError((error as Error).message ?? "خطای سرور", 500);
    }
  }

  if (method === "POST") {
    const { user, response } = await deps.requirePermission("manage_workflow_templates");
    if (!user) return response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    try {
      const data = parsed.data;
      const created = await deps.repository.createTemplate({
        name: data.name,
        description: data.description ?? null,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
        items: data.items?.map((it) => ({
          name: it.name,
          kind: it.kind ?? null,
          sortOrder: it.sortOrder,
          destinations: it.destinations,
          dueOffsetMinutes: it.dueOffsetMinutes ?? null,
        })),
      });
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
  return handleTemplatesRequest(request, defaultDependencies);
}

export async function POST(request: Request): Promise<Response> {
  return handleTemplatesRequest(request, defaultDependencies);
}
