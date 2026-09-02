import { z } from "zod";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { createContentRoomService, type ContentRoomService } from "@/lib/content-room/service";
import { createDrizzleContentRoomPort } from "@/lib/content-room/repository";
import { createDrizzleWorkflowPort } from "@/lib/workflow/repository";

/** Production service backed by real Drizzle ports (shared singleton per process). */
let drizzleService: ContentRoomService | null = null;
function getDefaultService(): ContentRoomService {
  if (!drizzleService) {
    drizzleService = createContentRoomService({
      contentPort: createDrizzleContentRoomPort(),
      workflowPort: createDrizzleWorkflowPort(),
    });
  }
  return drizzleService;
}

export interface SendRouteDependencies {
  requirePermission: typeof requirePermission;
  service: ContentRoomService;
}

const defaultDependencies: SendRouteDependencies = {
  requirePermission,
  service: getDefaultService(),
};

function mapServiceError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const message = (error as Error).message ?? "خطای سرور";
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "REASON_REQUIRED") return jsonError(message, 422, "REASON_REQUIRED");
  if (code === "INVALID_TRANSITION") {
    // No sendable parts case should be 400 per spec
    if (message.includes("قابل ارسال") || message.includes("قبلاً منتشر")) {
      return jsonError(message, 400, "INVALID_TRANSITION");
    }
    return jsonError(message, 409, "INVALID_TRANSITION");
  }
  return null;
}

const sendSchema = z.object({
  expectedVersion: z.number().int().positive(),
  /** Optional selective send: publish only these parts (each must be individually ready). */
  partIds: z.array(z.string().min(1)).max(500).optional(),
});

export async function handleSendRequest(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: SendRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { id } = await ctx.params;
  const { user, response } = await deps.requirePermission("manage_content_room");
  if (!user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");
  }

  try {
    const result = await deps.service.sendToPublication({
      productId: id,
      expectedVersion: parsed.data.expectedVersion,
      actorUserId: (user as unknown as { id?: string }).id ?? "unknown",
      partIds: parsed.data.partIds,
    });
    return jsonOk({
      programId: result.program.id,
      product: result.product,
      program: result.program,
      skippedPreviouslyPublished: (result as unknown as { skippedPreviouslyPublished?: number }).skippedPreviouslyPublished ?? 0,
      deliverables: result.deliverables,
      publications: result.publications,
    });
  } catch (error) {
    const mapped = mapServiceError(error);
    if (mapped) return mapped;
    return jsonInternalError(error, "api/content-room/products/[id]/send");
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleSendRequest(request, ctx, defaultDependencies);
}
