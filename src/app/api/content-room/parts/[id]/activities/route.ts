import { NextResponse } from "next/server";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { toggleActivitySchema } from "@/lib/content-room/validation";
import { contentRoomRepository, type ContentRoomRepository } from "@/lib/content-room/repository";

export interface ActivitiesRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  repository: Pick<ContentRoomRepository, "togglePartActivity" | "getPart" | "getProduct">;
}

const defaultDependencies: ActivitiesRouteDependencies = {
  getCurrentUser,
  repository: contentRoomRepository as unknown as Pick<ContentRoomRepository, "togglePartActivity" | "getPart" | "getProduct">,
};

function mapRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "INVALID_TRANSITION") return jsonError(message, 400, "INVALID_TRANSITION");
  if (code === "REASON_REQUIRED") return jsonError(message, 422, "REASON_REQUIRED");
  return null;
}

export async function handleActivitiesRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: ActivitiesRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { id: partId } = await ctx.params;

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

  // body expected { activity, isDone, expectedProductVersion }
  const raw = body as Record<string, unknown>;
  const toValidate = {
    partId,
    activity: raw.activity,
    isDone: raw.isDone,
    expectedProductVersion: raw.expectedProductVersion,
  };

  const parsed = toggleActivitySchema.safeParse(toValidate);
  if (!parsed.success) {
    return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
  }

  try {
    const updated = await deps.repository.togglePartActivity({
      partId: parsed.data.partId,
      activity: parsed.data.activity,
      isDone: parsed.data.isDone,
      expectedProductVersion: parsed.data.expectedProductVersion,
      actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
    });
    return jsonOk(updated);
  } catch (error) {
    const mapped = mapRepositoryError(error);
    if (mapped) return mapped;
    return jsonInternalError(error, "api/content-room/parts/[id]/activities PATCH");
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleActivitiesRequest(request, ctx, defaultDependencies);
}
