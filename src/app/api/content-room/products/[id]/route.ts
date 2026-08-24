import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { contentRoomRepository, type ContentRoomRepository } from "@/lib/content-room/repository";
import { requiresReasonForTransition, updateStatusSchema } from "@/lib/content-room/validation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildTelegramMediaUrl } from "@/lib/media/telegram-url";

export interface ProductRouteDependencies {
  requirePermission: typeof requirePermission;
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<ContentRoomRepository, "getProduct" | "updateProductStatus">;
}

const defaultDependencies: ProductRouteDependencies = {
  requirePermission,
  getCurrentUser,
  repository: contentRoomRepository,
};

function mapRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "INVALID_TRANSITION") return jsonError(message, 422, "INVALID_TRANSITION");
  if (code === "REASON_REQUIRED") return jsonError(message, 422, "REASON_REQUIRED");
  return null;
}

export async function handleProductRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: ProductRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { id } = await ctx.params;
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const { user, response } = await deps.requirePermission("view_content_room");
    if (!user) return response!;
    try {
      const product = await deps.repository.getProduct(id);
      if (!product) return jsonError("محصول یافت نشد.", 404, "NOT_FOUND");
      return jsonOk({
        ...product,
        parts: (product.parts ?? []).map((part) => ({
          ...part,
          playbackUrl: buildTelegramMediaUrl(part.fileRef),
          coverUrl: buildTelegramMediaUrl(part.coverFileRef),
        })),
      });
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonInternalError(error, "api/content-room/products/[id] GET");
    }
  }

  if (method === "PATCH") {
    // Require update_assigned_content OR manage_content_room
    const user = await deps.getCurrentUser();
    if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
    const subject = {
      role: (user as unknown as { role: string }).role,
      allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
      allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
    };
    const canManage = hasPermission(subject, "manage_content_room");
    const canUpdateAssigned = hasPermission(subject, "update_assigned_content");
    if (!canManage && !canUpdateAssigned) {
      return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
    }

    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
    }

    try {
      const existing = await deps.repository.getProduct(id);
      if (!existing) return jsonError("محصول یافت نشد.", 404, "NOT_FOUND");

      // Enforce reason required for backward/skip before calling repository
      const { status, expectedVersion, reason } = parsed.data;
      if (requiresReasonForTransition(existing.status, status)) {
        const trimmed = reason?.trim();
        if (!trimmed) {
          return jsonError("برای این تغییر وضعیت دلیل لازم است.", 422, "REASON_REQUIRED");
        }
      }

      const updated = await deps.repository.updateProductStatus({
        id,
        status: parsed.data.status,
        expectedVersion: parsed.data.expectedVersion,
        actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
        reason: parsed.data.reason ?? null,
      });
      return jsonOk(updated);
    } catch (error) {
      const mapped = mapRepositoryError(error);
      if (mapped) return mapped;
      return jsonInternalError(error, "api/content-room/products/[id] PATCH");
    }
  }

  return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleProductRequest(request, ctx, defaultDependencies);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleProductRequest(request, ctx, defaultDependencies);
}
