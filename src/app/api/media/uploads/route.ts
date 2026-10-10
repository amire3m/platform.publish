import { db } from "@/db";
import { mediaUploadSessions } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { sanitizeUploadFilename } from "@/lib/telegram/direct-upload";
import { UPLOAD_CHUNK_BYTES, UPLOAD_MAX_BYTES, chunkPlan, createUploadSessionId } from "@/lib/media/upload-sessions";

export const runtime = "nodejs";

export interface CreateSessionInput {
  fileName: string;
  mime: string;
  totalBytes: number;
  assetId?: string | null;
  partId?: string | null;
  productId?: string | null;
  channel?: string | null;
  kind?: string | null;
}

export interface MediaUploadStore {
  createSession(input: {
    id: string;
    fileName: string;
    mime: string;
    totalBytes: number;
    chunkBytes: number;
    totalChunks: number;
    assetId: string | null;
    partId: string | null;
    productId: string | null;
    channel: string | null;
    kind: string;
    createdBy: string | null;
  }): Promise<{ id: string; totalChunks: number; chunkBytes: number }>;
}

export interface MediaUploadsRouteDependencies {
  requirePermission: typeof requirePermission;
  store: MediaUploadStore;
}

const dbStore: MediaUploadStore = {
  async createSession(input) {
    await db.insert(mediaUploadSessions).values({
      id: input.id,
      assetId: input.assetId,
      partId: input.partId,
      productId: input.productId,
      channel: input.channel,
      kind: input.kind,
      fileName: input.fileName,
      mime: input.mime,
      totalBytes: input.totalBytes,
      chunkBytes: input.chunkBytes,
      totalChunks: input.totalChunks,
      receivedChunks: [],
      status: "open",
      createdBy: input.createdBy,
    } as never);
    return { id: input.id, totalChunks: input.totalChunks, chunkBytes: input.chunkBytes };
  },
};

const defaultDependencies: MediaUploadsRouteDependencies = {
  requirePermission,
  store: dbStore,
};

export async function handleMediaUploadsRequest(
  request: Request,
  deps: MediaUploadsRouteDependencies = defaultDependencies,
): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") {
    return jsonError("متد پشتیبانی نمی‌شود.", 405, "METHOD_NOT_ALLOWED");
  }
  const { user, response } = await deps.requirePermission("upload_content");
  if (!user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const b = body as Partial<CreateSessionInput>;
  const fileName = sanitizeUploadFilename(String(b.fileName ?? ""));
  const mime = String(b.mime ?? "application/octet-stream").slice(0, 120) || "application/octet-stream";
  const totalBytes = Number(b.totalBytes ?? 0);

  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    return jsonError("حجم فایل نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  if (totalBytes > UPLOAD_MAX_BYTES) {
    return jsonError("حجم فایل از سقف مجاز (۸ گیگابایت) بیشتر است.", 422, "FILE_TOO_LARGE");
  }

  const chunkBytes = UPLOAD_CHUNK_BYTES;
  const totalChunks = chunkPlan(totalBytes, chunkBytes).length;
  const id = createUploadSessionId();
  const createdBy = (user as unknown as { id?: string }).id ?? null;
  const opt = (v: unknown, cap: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" ? null : t.slice(0, cap);
  };
  const assetId = opt(b.assetId, 64);
  const partId = opt(b.partId, 64);
  const productId = opt(b.productId, 64);
  const channel = opt(b.channel, 64);
  const kind = opt(b.kind, 32) ?? "final";

  try {
    const created = await deps.store.createSession({
      id,
      fileName,
      mime,
      totalBytes,
      chunkBytes,
      totalChunks,
      assetId,
      partId,
      productId,
      channel,
      kind,
      createdBy,
    });
    return jsonOk(
      { sessionId: created.id, chunkBytes: created.chunkBytes, totalChunks: created.totalChunks },
      201,
    );
  } catch (error) {
    return jsonInternalError(error, "api/media/uploads POST");
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMediaUploadsRequest(request);
}
