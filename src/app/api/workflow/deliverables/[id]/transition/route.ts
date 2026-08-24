import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { hasPermission, type PermissionSubject } from "@/lib/permissions";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { transitionDeliverableSchema } from "@/lib/workflow/validation";
import { getCurrentUser } from "@/lib/auth";

export interface DeliverableTransitionDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<WorkflowRepository, "getDeliverable" | "transitionDeliverable">;
}

const defaultDeps: DeliverableTransitionDependencies = {
  getCurrentUser,
  repository: workflowRepository as unknown as DeliverableTransitionDependencies["repository"],
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

const MANAGER_ONLY_ACTIONS = new Set(["request_changes", "approve", "reopen", "cancel", "restore"]);
const REASON_REQUIRED_ACTIONS = new Set(["request_changes", "reopen", "cancel", "restore"]);

export async function handleDeliverableTransitionRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: DeliverableTransitionDependencies = defaultDeps,
): Promise<Response> {
  const { id } = await ctx.params;
  const method = request.method.toUpperCase();
  if (method !== "POST") return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");

  const user = await deps.getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = toSubject(user as unknown as { role: string; allowedActions?: string[]; allowedAccountIds?: string[] });


  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const parsed = transitionDeliverableSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
  }
  const { action, expectedVersion, reason } = parsed.data;

  // Reason required check before repository call (also enforced by state-machine, but we map to 422)
  if (REASON_REQUIRED_ACTIONS.has(action) && !reason?.trim()) {
    return jsonError("ارائه دلیل برای این اقدام الزامی است.", 422, "REASON_REQUIRED");
  }

  // Permission checks before repository call - need to fetch deliverable for assignment check
  const canManagePrograms = hasPermission(subject, "manage_programs");
  const canUpdateAssigned = hasPermission(subject, "update_assigned_deliverables");

  // manager-only actions require manage_programs
  if (MANAGER_ONLY_ACTIONS.has(action) && !canManagePrograms) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }

  try {
    const existing = await deps.repository.getDeliverable(id);
    if (!existing) return jsonError("خروجی یافت نشد.", 404, "NOT_FOUND");

    // For assignee actions (start, submit_review) need either manage_programs or assignment match
    if (!canManagePrograms) {
      if (!canUpdateAssigned) {
        return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
      }
      const assignee = (existing as { assigneeUserId?: string | null }).assigneeUserId ?? null;
      const userId = (user as unknown as { id?: string }).id ?? null;
      if (!assignee || assignee !== userId) {
        return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
      }
    }

    const actor = canManagePrograms ? "manager" as const : "assignee" as const;

    const result = await deps.repository.transitionDeliverable({
      id,
      expectedVersion,
      action: action as unknown as never,
      actor,
      reason: reason ?? undefined,
      actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
    });
    return jsonOk(result);
  } catch (e) {
    const mapped = mapError(e);
    if (mapped) return mapped;
    return jsonInternalError(e, "api/workflow/deliverables/[id]/transition");
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleDeliverableTransitionRequest(request, ctx, defaultDeps);
}
