import { jsonError, jsonOk } from "@/lib/api-helpers";
import { hasPermission, canAccessAccount, type PermissionSubject } from "@/lib/permissions";
import { workflowRepository, type WorkflowRepository } from "@/lib/workflow/repository";
import { transitionPublicationSchema } from "@/lib/workflow/validation";
import { getCurrentUser } from "@/lib/auth";

export interface PublicationTransitionDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<WorkflowRepository, "getPublication" | "getDeliverable" | "transitionPublication">;
}

const defaultDeps: PublicationTransitionDependencies = {
  getCurrentUser,
  repository: workflowRepository as unknown as PublicationTransitionDependencies["repository"],
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

const MANAGER_ONLY_PUB_ACTIONS = new Set(["restore_suppressed", "override_terminal_status"]);
const REASON_REQUIRED_PUB_ACTIONS = new Set(["suppress", "restore_suppressed", "manual_publish", "override_terminal_status"]);

export async function handlePublicationTransitionRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: PublicationTransitionDependencies = defaultDeps,
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
  const parsed = transitionPublicationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "ورودی نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const { action, expectedVersion, reason, publishedAt, overrideTo, automaticTargetReady } = parsed.data;

  if (REASON_REQUIRED_PUB_ACTIONS.has(action) && !reason?.trim()) {
    return jsonError("ارائه دلیل برای این اقدام الزامی است.", 422, "REASON_REQUIRED");
  }

  // For manual_publish, publishedAt is required by state-machine; validate early for 422?
  // Let repository/state-machine handle invalid transition as 409, but reason missing already handled.

  try {
    const publication = await deps.repository.getPublication(id);
    if (!publication) return jsonError("انتشار یافت نشد.", 404, "NOT_FOUND");

    // Account scope check
    const socialAccountId = (publication as { socialAccountId?: string | null }).socialAccountId ?? null;
    const canManagePubs = hasPermission(subject, "manage_publications");
    const canManagePrograms = hasPermission(subject, "manage_programs");

    // Determine required permission for this action
    const requiresManagePrograms = MANAGER_ONLY_PUB_ACTIONS.has(action);
    if (requiresManagePrograms) {
      if (!canManagePrograms) return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
    } else {
      // All other publication actions require manage_publications (or manager also qualifies)
      if (!canManagePubs && !canManagePrograms) {
        return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
      }
    }

    // Account scope enforcement: if publication has account, check allowedAccountIds
    if (socialAccountId) {
      if (!canAccessAccount(subject, socialAccountId)) {
        return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
      }
    } else {
      // accountless Telegram still requires manage_publications or manage_programs, already checked
    }

    // Actor mapping
    let actor: "publisher" | "manager" | "worker" = "publisher";
    if (canManagePrograms && (action === "restore_suppressed" || action === "override_terminal_status")) actor = "manager";
    else if (canManagePrograms && !canManagePubs) actor = "manager";
    else if (canManagePubs) actor = "publisher";
    else actor = "manager";

    // For worker-only actions (prepare, claim_publish etc.), but they are not exposed to publisher/manager via API; allow manager/publisher to invoke? Map to publisher/manager anyway and let state-machine reject if actor invalid => 409
    // To keep API aligned, if actor is publisher/manager but state-machine expects worker, it will throw INVALID_TRANSITION. That's fine.

    const result = await deps.repository.transitionPublication({
      id,
      expectedVersion,
      action: action as unknown as never,
      actor,
      reason: reason ?? undefined,
      actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      publishedAt: publishedAt ?? undefined,
      overrideTo: overrideTo as unknown as never,
      automaticTargetReady: automaticTargetReady ?? true,
    });
    return jsonOk(result);
  } catch (e) {
    const mapped = mapError(e);
    if (mapped) return mapped;
    return jsonError((e as Error).message ?? "خطای سرور", 500);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handlePublicationTransitionRequest(request, ctx, defaultDeps);
}
