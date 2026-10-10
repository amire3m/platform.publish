import { eq } from "drizzle-orm";
import { mkdir, open } from "node:fs/promises";
import { db } from "@/db";
import { mediaUploadSessions } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { stagingDir, stagingPath } from "@/lib/media/upload-sessions";

export const runtime = "nodejs";

export { stagingDir, stagingPath };

export interface ChunkSession {
  id: string;
  totalChunks: number;
  chunkBytes: number;
  receivedChunks: number[];
  status: string;
}

export interface ChunkStore {
  getSession(id: string): Promise<ChunkSession | null>;
  appendChunk(id: string, index: number, bytes: Uint8Array, chunkBytes: number): Promise<{ received: number[] }>;
}

export interface ChunkRouteDependencies {
  requirePermission: typeof requirePermission;
  store: ChunkStore;
}

const dbChunkStore: ChunkStore = {
  async getSession(id) {
    const [row] = await db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, id)).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      totalChunks: row.totalChunks,
      chunkBytes: row.chunkBytes,
      receivedChunks: (row.receivedChunks ?? []) as number[],
      status: row.status,
    };
  },
  async appendChunk(id, index, bytes, chunkBytes) {
    const dir = stagingDir(id);
    await mkdir(dir, { recursive: true });
    const path = stagingPath(id);
    const fh = await open(path, "a+");
    try {
      await fh.write(bytes, 0, bytes.length, index * chunkBytes);
    } finally {
      await fh.close();
    }
    const [row] = await db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, id)).limit(1);
    const prev = new Set<number>((row?.receivedChunks ?? []) as number[]);
    prev.add(index);
    const received = [...prev].sort((a, b) => a - b);
    await db
      .update(mediaUploadSessions)
      .set({ receivedChunks: received, updatedAt: new Date() } as never)
      .where(eq(mediaUploadSessions.id, id));
    return { received };
  },
};

const defaultDependencies: ChunkRouteDependencies = {
  requirePermission,
  store: dbChunkStore,
};

export async function handleMediaChunkRequest(
  request: Request,
  sessionId: string,
  deps: ChunkRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { user, response } = await deps.requirePermission("upload_content");
  if (!user) return response!;

  const url = new URL(request.url);
  const index = Number(url.searchParams.get("index") ?? "NaN");
  if (!Number.isInteger(index) || index < 0) {
    return jsonError("شماره چانک نامعتبر است.", 422, "VALIDATION_ERROR");
  }

  const session = await deps.store.getSession(sessionId);
  if (!session) return jsonError("نشست آپلود یافت نشد.", 404, "NOT_FOUND");
  if (session.status !== "open") return jsonError("نشست آپلود بسته شده است.", 409, "SESSION_CLOSED");
  if (index >= session.totalChunks) {
    return jsonError("شماره چانک خارج از بازه است.", 422, "VALIDATION_ERROR");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return jsonError("بدنه چانک خوانده نشد.", 400, "INVALID_BODY");
  }
  if (bytes.length === 0) return jsonError("چانک خالی است.", 400, "FILE_REQUIRED");

  try {
    const out = await deps.store.appendChunk(sessionId, index, bytes, session.chunkBytes);
    return jsonOk({ received: out.received, totalChunks: session.totalChunks });
  } catch (error) {
    return jsonInternalError(error, "api/media/uploads/[id]/chunks PUT");
  }
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return handleMediaChunkRequest(request, id);
}
