import { and, desc, eq, sql } from "drizzle-orm";
import { rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { db } from "@/db";
import {
  contentPartAssets,
  contentParts,
  mediaAssets,
  mediaRevisions,
  mediaStorageObjects,
  mediaUploadSessions,
  workflowEvents,
} from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { generateEntityId } from "@/lib/ids";
import { bundleIdOf, isBundleRef, sha256File } from "@/lib/media/bundles";
import { partLinkageFor } from "@/lib/media/part-linkage";
import { materializeStagingToTelegram, type MaterializedPart } from "@/lib/media/telegram-materialize";
import { nextMissingChunk } from "@/lib/media/upload-sessions";
import { getTelegramConfig } from "@/lib/telegram/client";
import { stagingPath } from "../chunks/route";

export const runtime = "nodejs";

export interface CompleteResult {
  assetId: string;
  revisionId: string;
  version: number;
  size: number;
  sha256: string;
  telegramFileRef: string;
  linked: { partId: string; kind: string } | null;
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

    // Validate the bound part BEFORE touching Telegram so a bad partId
    // never leaves an orphaned upload. Session stays open on failure.
    const partId = (session.partId as string | null) ?? null;
    const kind = ((session.kind as string | null) ?? "final") as string;
    if (partId) {
      const [part] = await db.select({ id: contentParts.id }).from(contentParts).where(eq(contentParts.id, partId)).limit(1);
      if (!part) {
        throw Object.assign(new Error("قسمت یافت نشد."), { code: "NOT_FOUND" });
      }
    }

    // Telegram is the phase-1 byte backend: materialize staging → Telegram
    // BEFORE creating the revision. Failures keep the session open for retry.
    const tg = getTelegramConfig();
    if (!tg) {
      throw Object.assign(new Error("اتصال تلگرام پیکربندی نشده است؛ تکمیل آپلود بدون مخزن تلگرام امکان‌پذیر نیست."), {
        code: "TELEGRAM_NOT_CONFIGURED",
      });
    }
    const apiBase = process.env.TELEGRAM_BOT_API_SERVER_URL?.trim() || "https://api.telegram.org";
    let materialized: { fileRef: string; manifest: unknown[]; partCount: number };
    try {
      materialized = await materializeStagingToTelegram({
        stagingPath: path,
        filename: (session.fileName as string) || "upload.bin",
        mime: (session.mime as string) || "application/octet-stream",
        sizeBytes: st.size,
        apiBase,
        botToken: tg.botToken,
        groupId: tg.groupId,
      });
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        code: (error as { code?: string }).code ?? "TELEGRAM_UPLOAD_FAILED",
      });
    }

    let assetId = session.assetId as string | null;
    let version = 1;
    if (!assetId) {
      assetId = generateEntityId("MAS");
      await db.insert(mediaAssets).values({
        id: assetId,
        title: (session.fileName as string) || "",
        channel: (session.channel as string | null) ?? null,
        productId: (session.productId as string | null) ?? null,
        partId: (session.partId as string | null) ?? null,
        kind: ((session.kind as string | null) ?? "final") as never,
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
      backend: "telegram",
      byteSize: st.size,
      partCount: materialized.partCount,
      manifest: materialized.manifest,
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
      telegramFileRef: materialized.fileRef,
      status: "ready",
      createdBy: actorId,
    } as never);
    await db
      .update(mediaAssets)
      .set({ currentRevisionId: revisionId, status: "ready", updatedAt: new Date() } as never)
      .where(eq(mediaAssets.id, assetId));
    // Link the revision into the part's playable surface so library
    // listings, playback, and mirrors pick it up like any other upload.
    let linked: { partId: string; kind: string } | null = null;
    if (partId) {
      const fileName = (session.fileName as string) || "upload.bin";
      const now = new Date();
      const bundled = isBundleRef(materialized.fileRef);
      const writeBundleManifest = async (rowKind: string) => {
        const bundleId = bundleIdOf(materialized.fileRef);
        let idx = 0;
        for (const m of materialized.manifest as MaterializedPart[]) {
          idx++;
          await db.insert(contentPartAssets).values({
            id: generateEntityId("CPP"),
            partId,
            kind: rowKind,
            fileRef: m.fileId,
            fileName: `${fileName}.part${String(m.partIndex ?? idx).padStart(3, "0")}`,
            bundleId,
            partIndex: m.partIndex ?? idx,
            partTotal: m.partTotal ?? materialized.partCount,
            fileHash: m.hash,
            createdBy: actorId,
            createdAt: now,
          } as never);
        }
      };
      const target = partLinkageFor(kind);
      if (target === "part-asset") {
        if (kind === "final") {
          await db.delete(contentPartAssets).where(and(eq(contentPartAssets.partId, partId), eq(contentPartAssets.kind, "final")));
        }
        if (bundled) {
          await writeBundleManifest(kind);
        } else {
          await db.insert(contentPartAssets).values({
            id: generateEntityId("CPP"),
            partId,
            kind,
            fileRef: materialized.fileRef,
            fileName,
            createdBy: actorId,
            createdAt: now,
          } as never);
        }
      } else {
        if (bundled) {
          await writeBundleManifest(kind);
        }
        const slot = target === "part-file" ? { fileRef: materialized.fileRef } : { coverFileRef: materialized.fileRef };
        await db
          .update(contentParts)
          .set({ ...slot, version: sql`${contentParts.version} + 1`, updatedAt: now } as never)
          .where(eq(contentParts.id, partId));
      }
      try {
        await db.insert(workflowEvents).values({
          id: generateEntityId("WEV"),
          entityType: "content_part",
          entityId: partId,
          action: "file_updated",
          before: { kind, file_ref: null } as unknown as Record<string, unknown>,
          after: { kind, fileRef: materialized.fileRef, revisionId, version } as unknown as Record<string, unknown>,
          actorUserId: actorId,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {}
      if (!bundled) {
        const { maybeMirrorAfterLink } = await import("@/lib/mirrors/job");
        void maybeMirrorAfterLink({ partId, kind, fileId: materialized.fileRef });
      }
      linked = { partId, kind };
    }

    await db
      .update(mediaUploadSessions)
      .set({ status: "complete", updatedAt: new Date() } as never)
      .where(eq(mediaUploadSessions.id, sessionId));

    // Staging served its purpose — Telegram is canonical now. Best-effort
    // cleanup; the retention sweep reaps anything left behind.
    await rm(dirname(path), { recursive: true, force: true }).catch(() => {});

    return { assetId, revisionId, version, size: st.size, sha256: sha, telegramFileRef: materialized.fileRef, linked };
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
    if (code === "TELEGRAM_NOT_CONFIGURED") return jsonError((error as Error).message, 400, "TELEGRAM_NOT_CONFIGURED");
    if (code === "TELEGRAM_UPLOAD_FAILED") {
      return jsonError("ارسال فایل به Telegram انجام نشد. نشست باز است؛ تکمیل را دوباره تلاش کنید.", 502, "TELEGRAM_UPLOAD_FAILED");
    }
    if (code === "FILE_TOO_LARGE") return jsonError((error as Error).message, 422, "FILE_TOO_LARGE");
    return jsonInternalError(error, "api/media/uploads/[id]/complete POST");
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return handleMediaCompleteRequest(request, id);
}
