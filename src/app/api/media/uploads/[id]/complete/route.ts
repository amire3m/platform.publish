import { desc, eq } from "drizzle-orm";
import { stat } from "node:fs/promises";
import { db } from "@/db";
import { mediaAssets, mediaRevisions, mediaStorageObjects, mediaUploadSessions } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { generateEntityId } from "@/lib/ids";
import { sha256File } from "@/lib/media/bundles";
import { nextMissingChunk } from "@/lib/media/upload-sessions";
import { stagingPath } from "../chunks/route";

export const runtime = "nodejs";

export interface CompleteResult {
  assetId: string;
  revisionId: string;
  version: number;
  size: number;
  sha256: string;
}

export interface CompleteStore {
  completeSession(sessionId: string, actorId: string | null): Promise<CompleteResult>;
}

export interface CompleteRouteDependencies {
  requirePermission: typeof requirePermission;
  store: CompleteStore;
}

const dbCompleteStore: CompleteStore = {
  async completeSession(sessionId, actorId) {
    const [session] = await db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, sessionId)).limit(1);
    if (!session) {
      throw Object.assign(new Error("نشست آپلود یافت نشد."), { code: "NOT_FOUND" });
    }
    if (session.status !== "open") {
      throw Object.assign(new Error("نشست آپلود بسته شده است."), { code: "SESSION_CLOSED" });
    }
    const received = (session.receivedChunks ?? []) as number[];
    const missing = nextMissingChunk(received, session.totalChunks);
    if (missing !== null) {
      throw Object.assign(new Error(`چانک ${missing} هنوز دریافت نشده است.`), { code: "INCOMPLETE" });
    }
    const path = stagingPath(sessionId);
    const st = await stat(path).catch(() => null);
    if (!st) throw Object.assign(new Error("فایل staging یافت نشد."), { code: "INCOMPLETE" });
    if (st.size !== Number(session.totalBytes)) {
      throw Object.assign(new Error("اندازه فایل با مقدار اعلام‌شده مطابقت ندارد."), { code: "SIZE_MISMATCH" });
    }
    const sha = await sha256File(path);

    let assetId = session.assetId as string | null;
    let version = 1;
    if (!assetId) {
      assetId = generateEntityId("MAS");
      await db.insert(mediaAssets).values({
        id: assetId,
        title: (session.fileName as string) || "",
        kind: "final",
        status: "ready",
        createdBy: actorId,
      } as never);
    } else {
      const [latest] = await db
        .select({ version: mediaRevisions.version })
        .from(mediaRevisions)
        .where(eq(mediaRevisions.assetId, assetId))
        .orderBy(desc(mediaRevisions.version))
        .limit(1);
      version = (latest?.version ?? 0) + 1;
    }

    const objectId = generateEntityId("MSO");
    await db.insert(mediaStorageObjects).values({
      id: objectId,
      backend: "staging",
      byteSize: st.size,
      partCount: 1,
      manifest: [{ path, sha256: sha }],
    } as never);

    const revisionId = generateEntityId("MRV");
    await db.insert(mediaRevisions).values({
      id: revisionId,
      assetId,
      version,
      fileName: session.fileName as string,
      mime: session.mime as string,
      sizeBytes: st.size,
      sha256: sha,
      storageObjectId: objectId,
      status: "ready",
      createdBy: actorId,
    } as never);
    await db
      .update(mediaAssets)
      .set({ currentRevisionId: revisionId, status: "ready", updatedAt: new Date() } as never)
      .where(eq(mediaAssets.id, assetId));
    await db
      .update(mediaUploadSessions)
      .set({ status: "complete", updatedAt: new Date() } as never)
      .where(eq(mediaUploadSessions.id, sessionId));

    return { assetId, revisionId, version, size: st.size, sha256: sha };
  },
};

const defaultDependencies: CompleteRouteDependencies = {
  requirePermission,
  store: dbCompleteStore,
};

export async function handleMediaCompleteRequest(
  request: Request,
  sessionId: string,
  deps: CompleteRouteDependencies = defaultDependencies,
): Promise<Response> {
  void request;
  const { user, response } = await deps.requirePermission("upload_content");
  if (!user) return response!;

  try {
    const out = await deps.store.completeSession(sessionId, (user as unknown as { id?: string }).id ?? null);
    return jsonOk(out);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "NOT_FOUND") return jsonError((error as Error).message, 404, "NOT_FOUND");
    if (code === "INCOMPLETE" || code === "SIZE_MISMATCH") return jsonError((error as Error).message, 409, code);
    if (code === "SESSION_CLOSED") return jsonError((error as Error).message, 409, "SESSION_CLOSED");
    return jsonInternalError(error, "api/media/uploads/[id]/complete POST");
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return handleMediaCompleteRequest(request, id);
}
