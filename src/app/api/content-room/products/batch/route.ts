import { NextResponse } from "next/server";
import { jsonError, jsonInternalError, requirePermission } from "@/lib/api-helpers";
import { batchCreateSchema } from "@/lib/content-room/validation";
import { contentRoomRepository, type ContentRoomRepository } from "@/lib/content-room/repository";

export interface BatchRouteDependencies {
  requirePermission: typeof requirePermission;
  repository: Pick<ContentRoomRepository, "createProductsBatch">;
}

const defaultDependencies: BatchRouteDependencies = {
  requirePermission,
  repository: contentRoomRepository,
};

function mapRepositoryError(error: unknown): Response | null {
  const code = (error as { code?: string }).code;
  const rowIndex = (error as { rowIndex?: number }).rowIndex;
  const message = (error as Error).message ?? "خطای سرور";
  if (typeof rowIndex === "number") {
    return NextResponse.json({ ok: false, error: message, code: code ?? "VALIDATION_ERROR", rowIndex }, { status: 400 });
  }
  if (code === "VERSION_CONFLICT") return jsonError(message, 409, "VERSION_CONFLICT");
  if (code === "NOT_FOUND") return jsonError(message, 404, "NOT_FOUND");
  if (code === "INVALID_TRANSITION") return jsonError(message, 422, "INVALID_TRANSITION");
  if (code === "REASON_REQUIRED") return jsonError(message, 422, "REASON_REQUIRED");
  return null;
}

export async function handleBatchRequest(
  request: Request,
  deps: BatchRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { user, response } = await deps.requirePermission("manage_content_room");
  if (!user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const parsed = batchCreateSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const rowIndexRaw = (first.path[1] as number | undefined);
    const hasRowIndex = first.path[0] === "products" && typeof rowIndexRaw === "number";
    const payload: Record<string, unknown> = { ok: false, error: first.message, code: "VALIDATION_ERROR" };
    if (hasRowIndex) payload.rowIndex = rowIndexRaw;
    return NextResponse.json(payload, { status: 400 });
  }

  try {
    const actorUserId = (user as unknown as { id?: string }).id ?? "unknown";
    const created = await deps.repository.createProductsBatch(
      parsed.data.products.map((p) => ({ ...p, actorUserId } as never)),
    );
    return NextResponse.json({ ok: true, products: created }, { status: 201 });
  } catch (error) {
    const mapped = mapRepositoryError(error);
    if (mapped) return mapped;
    // check for rowIndex even if code not mapped
    const rowIndex = (error as { rowIndex?: number }).rowIndex;
    if (typeof rowIndex === "number") {
      const msg = (error as Error).message ?? "خطای سرور";
      return NextResponse.json({ ok: false, error: msg, code: "VALIDATION_ERROR", rowIndex }, { status: 400 });
    }
    return jsonInternalError(error, "api/content-room/products/batch POST");
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleBatchRequest(request, defaultDependencies);
}
