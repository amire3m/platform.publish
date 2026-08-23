import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { contentRoomRepository, type ContentRoomRepository } from "@/lib/content-room/repository";

export interface ArchiveRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<ContentRoomRepository, "archiveProduct" | "unarchiveProduct" | "getProduct">;
}

const defaultDependencies: ArchiveRouteDependencies = {
  requirePermission,
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

export async function handleArchiveRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: ArchiveRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { id } = await ctx.params;
  const method = request.method.toUpperCase();

  if (method !== "POST") return jsonError("روش پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");

  const { user, response } = await deps.requirePermission("manage_content_room");
  if (!user) return response!;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // ignore parse error, treat as archive
  }

  const action = (body as { action?: string })?.action ?? "archive";
  const actorUserId = (user as unknown as { id?: string }).id ?? "unknown";

  try {
    if (action === "unarchive") {
      const result = await deps.repository.unarchiveProduct({ id, actorUserId });
      return jsonOk(result);
    }
    // default archive; also support restore param for convenience
    const result = await deps.repository.archiveProduct({ id, actorUserId });
    return jsonOk(result);
  } catch (error) {
    const mapped = mapRepositoryError(error);
    if (mapped) return mapped;
    return jsonError((error as Error).message ?? "خطای سرور", 500);
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleArchiveRequest(request, ctx, defaultDependencies);
}
