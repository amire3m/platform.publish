import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { hasPermission, type PermissionSubject } from "@/lib/permissions";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { updateDeliverableSchema } from "@/lib/workflow/validation";
import { getCurrentUser } from "@/lib/auth";

export interface DeliverableRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<WorkflowRepository, "getDeliverable" | "updateDeliverable" | "getPublication"> & {
    listPublicationsForDeliverable?: (id: string) => Promise<unknown[]>;
  };
}

const defaultDeps: DeliverableRouteDependencies = {
  getCurrentUser,
  repository: workflowRepository as unknown as DeliverableRouteDependencies["repository"],
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

function toSubject(user: { role: string; allowedActions?: string[] | null; allowedAccountIds?: string[] | null }): PermissionSubject {
  return { role: user.role, allowedActions: user.allowedActions ?? [], allowedAccountIds: user.allowedAccountIds ?? [] };
}

export async function handleDeliverableRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: DeliverableRouteDependencies = defaultDeps,
): Promise<Response> {
  const { id } = await ctx.params;
  const method = request.method.toUpperCase();

  const user = await deps.getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = toSubject(user as unknown as { role: string; allowedActions?: string[]; allowedAccountIds?: string[] });

  if (method === "GET") {
    if (!hasPermission(subject, "view_workflow")) {
      return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
    }
    try {
      const deliverable = await deps.repository.getDeliverable(id);
      if (!deliverable) return jsonError("خروجی یافت نشد.", 404, "NOT_FOUND");
      return jsonOk(deliverable);
    } catch (e) {
      const m = mapError(e);
      if (m) return m;
      return jsonInternalError(e, "api/workflow/deliverables/[id] GET");
    }
  }

  if (method === "PATCH") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }
    const parsed = updateDeliverableSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
    }

    // Permission: manage_programs OR (update_assigned_deliverables + assignment match)
    const canManagePrograms = hasPermission(subject, "manage_programs");
    const canUpdateAssigned = hasPermission(subject, "update_assigned_deliverables");

    if (!canManagePrograms && !canUpdateAssigned) {
      return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
    }

    try {
      const existing = await deps.repository.getDeliverable(id);
      if (!existing) return jsonError("خروجی یافت نشد.", 404, "NOT_FOUND");

      if (!canManagePrograms) {
        // must be assignee
        const assignee = (existing as { assigneeUserId?: string | null }).assigneeUserId ?? null;
        const userId = (user as unknown as { id?: string }).id ?? null;
        if (!assignee || assignee !== userId) {
          return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
        }
      }

      const data = parsed.data;
      const updated = await deps.repository.updateDeliverable({
        id,
        expectedVersion: data.expectedVersion,
        name: data.name,
        kind: data.kind,
        assigneeUserId: data.assigneeUserId,
        dueAt: data.dueAt as string | null | undefined,
        notes: data.notes,
        sortOrder: data.sortOrder,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      });
      return jsonOk(updated);
    } catch (e) {
      const m = mapError(e);
      if (m) return m;
      return jsonInternalError(e, "api/workflow/deliverables/[id] PATCH");
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleDeliverableRequest(request, ctx, defaultDeps);
}
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleDeliverableRequest(request, ctx, defaultDeps);
}
