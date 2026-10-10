import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { contentTypeFromPath, getTelegramConfig } from "@/lib/telegram/client";
import { cleanupUpload, sanitizeUploadFilename, saveUploadStream, sendFileViaCurl } from "@/lib/telegram/direct-upload";
import { BUNDLE_MAX_BYTES, BUNDLE_PART_BYTES } from "@/lib/media/bundles";
import { generateEntityId } from "@/lib/ids";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2GB — سقف Bot API با Local Server (یوتیوب تا 256GB است اما تلگرام 2GB)
const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/avi",
  "video/webm",
  "video/x-matroska",
  "video/mov",
  "video/mpeg",
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function isVideoMime(mime: string): boolean {
  if (ALLOWED_VIDEO_MIMES.has(mime)) return true;
  return mime.startsWith("video/");
}

function isImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIMES.has(mime) || mime === "image/jpeg" || mime === "image/png";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Permission check: update_assigned_content OR manage_content_room
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
    allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
  };
  const canManage = hasPermission(subject, "manage_content_room");
  const canUpdate = hasPermission(subject, "update_assigned_content");
  if (!canManage && !canUpdate) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }

  // Fetch part
  const [part] = await db.select().from(contentParts).where(eq(contentParts.id, id)).limit(1);
  if (!part) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");

  // Raw octet-stream body + metadata in query (streaming: never buffers the file in RAM)
  const url = new URL(req.url);
  const q = url.searchParams;
  const type = q.get("type") ?? "";
  const filename = sanitizeUploadFilename(q.get("filename") ?? "");
  const clientMime = q.get("mime") ?? "";
  const expectedVersionRaw = q.get("expectedVersion");
  const targetKindRaw = q.get("targetKind");
  const coverTarget =
    type === "cover" && ["youtube_full", "highlight", "reel"].includes(targetKindRaw ?? "")
      ? (targetKindRaw as "youtube_full" | "highlight" | "reel")
      : null;
  const targetAssetRaw = q.get("targetAssetId");
  const coverAssetId = type === "cover" && targetAssetRaw && targetAssetRaw.trim() !== "" ? targetAssetRaw.trim() : null;

  if (type !== "video" && type !== "cover" && type !== "highlight" && type !== "reel" && type !== "clean" && type !== "final" && type !== "report") {
    return jsonError("نوع فایل نامعتبر است.", 400, "INVALID_TYPE");
  }
  const isVideoType = type === "video" || type === "highlight" || type === "reel" || type === "clean" || type === "final";
  const maxBytes = isVideoType ? MAX_VIDEO_BYTES : MAX_COVER_BYTES;

  // Early size gate from Content-Length (browsers set it for Blob bodies)
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    return jsonError(
      isVideoType ? "حجم ویدئو نباید بیش از ۲ گیگابایت باشد. فایل‌های بزرگ‌تر را فشرده یا کوتاه کنید." : "حجم کاور/اسکرین‌شات نباید بیش از ۱۰ مگابایت باشد.",
      422,
      "FILE_TOO_LARGE",
    );
  }

  // Declared mime (authoritative re-check happens after save; extension fallback)
  const mime = clientMime || contentTypeFromPath(filename) || "application/octet-stream";
  if (isVideoType && !isVideoMime(mime)) {
    return jsonError(`فرمت ویدئو پشتیبانی نمی‌شود: ${mime || "نامشخص"}. فرمت‌های مجاز: mp4، mov، avi، webm و mkv.`, 422, "INVALID_MIME");
  }
  if (!isVideoType && !isImageMime(mime)) {
    return jsonError(`فرمت کاور/اسکرین‌شات پشتیبانی نمی‌شود: ${mime || "نامشخص"}. فرمت‌های مجاز: jpeg و png.`, 422, "INVALID_MIME");
  }

  // Optional version check
  let expectedVersion: number | null = null;
  if (expectedVersionRaw && expectedVersionRaw.trim() !== "") {
    const parsed = Number(expectedVersionRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return jsonError("نسخه ارسالی نامعتبر است. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.", 400, "INVALID_VERSION");
    }
    expectedVersion = parsed;
    const currentVersion = (part as unknown as { version?: number }).version ?? 1;
    if (currentVersion !== expectedVersion) {
      return jsonError("نسخه قدیمی است.", 409, "VERSION_CONFLICT");
    }
  }

  // Telegram config
  const tg = getTelegramConfig();
  if (!tg) {
    return jsonError(
      "اتصال تلگرام پیکربندی نشده است؛ آپلود فایل بدون مخزن تلگرام امکان‌پذیر نیست.",
      400,
      "TELEGRAM_NOT_CONFIGURED",
    );
  }
  const apiBase = process.env.TELEGRAM_BOT_API_SERVER_URL?.trim() || "https://api.telegram.org";

  // Copyright-report screenshots go to the dedicated "بررسی کپی‌رایت" topic
  // (configurable via REPORT_TOPIC_THREAD_ID, default 4).
  const reportThreadId = type === "report" ? Number(process.env.REPORT_TOPIC_THREAD_ID ?? 4) || 4 : undefined;
  const reportCaption = type === "report" ? `گزارش کپی‌رایت — قسمت ${(part as unknown as { partNumber?: number }).partNumber ?? ""}` : undefined;

  // Stream body → temp file (constant memory), then curl → Telegram (streams from disk).
  let tmp: { dir: string; path: string; bytes: number } | null = null;
  let fileId: string | null = null;
  let messageId: number | null = null;
  let bundle: { id: string; total: number } | null = null;
  let partUploads: Array<{ fileId: string; messageId: number | null; hash: string | null }> = [];
  try {
    try {
      tmp = await saveUploadStream(req.body);
    } catch {
      return jsonError("بدنه درخواست خوانده نشد.", 400, "INVALID_BODY");
    }
    if (!tmp) return jsonError("بدنه درخواست خوانده نشد.", 400, "INVALID_BODY");
    if (tmp.bytes === 0) return jsonError("فایل ارسال نشده است.", 400, "FILE_REQUIRED");
    // Videos may exceed the 2GB single-shot cap (multipart failover up to 8GB total)
    const totalCap = isVideoType ? BUNDLE_MAX_BYTES : maxBytes;
    if (tmp.bytes > totalCap) {
      return jsonError(
        isVideoType ? "حجم ویدئو از سقف مجاز (۸ گیگابایت) بیشتر است." : "حجم کاور/اسکرین‌شات نباید بیش از ۱۰ مگابایت باشد.",
        422,
        "FILE_TOO_LARGE",
      );
    }
    if (!isVideoType) {
      try {
        const { default: sharp } = await import("sharp");
        await sharp(tmp.path).metadata();
      } catch {
        return jsonError("فایل تصویری معتبر نیست.", 422, "INVALID_MIME");
      }
    }
    const sendOpts = {
      apiBase,
      token: tg.botToken,
      groupId: tg.groupId,
      filePath: tmp.path,
      filename,
      mime,
      threadId: reportThreadId,
      caption: reportCaption,
    };
    // Single upload first; multipart failover (500MB raw parts + manifest) only when
    // the file cannot go as one piece (>2GB Telegram cap) or the single shot fails.
    const singleShot = async (): Promise<void> => {
      if (isVideoType) {
        try {
          ({ fileId, messageId } = await sendFileViaCurl({ ...sendOpts, method: "sendVideo", field: "video" }));
        } catch {
          ({ fileId, messageId } = await sendFileViaCurl({ ...sendOpts, method: "sendDocument", field: "document" }));
        }
        if (!fileId) {
          ({ fileId, messageId } = await sendFileViaCurl({ ...sendOpts, method: "sendDocument", field: "document" }));
        }
      } else {
        try {
          ({ fileId, messageId } = await sendFileViaCurl({ ...sendOpts, method: "sendPhoto", field: "photo" }));
        } catch {
          ({ fileId, messageId } = await sendFileViaCurl({ ...sendOpts, method: "sendDocument", field: "document" }));
        }
      }
      if (!fileId) throw new Error("no file_id returned");
    };
    try {
      if (!isVideoType) {
        await singleShot();
      } else {
        if (tmp.bytes > BUNDLE_MAX_BYTES) {
          return jsonError("حجم ویدئو از سقف مجاز (۸ گیگابایت) بیشتر است.", 422, "FILE_TOO_LARGE");
        }
        const mustSplit = tmp.bytes > MAX_VIDEO_BYTES;
        let singleFailed = false;
        if (!mustSplit) {
          try {
            await singleShot();
          } catch {
            singleFailed = true;
          }
        }
        if (mustSplit || singleFailed) {
          if (tmp.bytes <= BUNDLE_PART_BYTES) {
            console.error("[content-room-upload] Telegram upload failed (single shot).");
            return jsonError("ارسال فایل به Telegram انجام نشد. دوباره تلاش کنید.", 502, "TELEGRAM_UPLOAD_FAILED");
          }
          const { splitFileToParts, sha256File, BUNDLE_PART_BYTES: PART_BYTES } = await import("@/lib/media/bundles");
          const bundleId = generateEntityId("BDL");
          const partPaths = await splitFileToParts(tmp.path, PART_BYTES, tmp.dir);
          let idx = 0;
          for (const pp of partPaths) {
            idx++;
            const hash = await sha256File(pp).catch(() => null);
            let pfid: string | null = null;
            let pmsg: number | null = null;
            try {
              ({ fileId: pfid, messageId: pmsg } = await sendFileViaCurl({
                ...sendOpts,
                method: "sendDocument",
                field: "document",
                filePath: pp,
                filename: `${filename}.part${String(idx).padStart(3, "0")}`,
                caption: `${filename} — بخش ${idx} از ${partPaths.length}`,
              }));
            } catch (err) {
              console.error(`[content-room-upload] bundle part ${idx}/${partPaths.length} failed:`, err);
              return jsonError(`ارسال بخش ${idx} از ${partPaths.length} ناموفق بود. دوباره تلاش کنید.`, 502, "TELEGRAM_UPLOAD_FAILED");
            }
            if (!pfid) {
              return jsonError(`ارسال بخش ${idx} از ${partPaths.length} ناموفق بود. دوباره تلاش کنید.`, 502, "TELEGRAM_UPLOAD_FAILED");
            }
            partUploads.push({ fileId: pfid, messageId: pmsg, hash });
          }
          bundle = { id: bundleId, total: partPaths.length };
          fileId = `bundle:${bundleId}`;
          messageId = partUploads[partUploads.length - 1]?.messageId ?? null;
        }
      }
    } catch (err) {
      console.error("[content-room-upload] Telegram upload failed:", err);
      return jsonError("ارسال فایل به Telegram انجام نشد. دوباره تلاش کنید.", 502, "TELEGRAM_UPLOAD_FAILED");
    }
  } finally {
    if (tmp) await cleanupUpload(tmp.dir);
  }

  if (!fileId) {
    // fallback to message id based ref
    fileId = messageId ? `tg_msg_${messageId}` : `tg_file_${Date.now()}`;
  }

  // For cover we store telegram file id, for video we store file_id; optionally prefix with type
  const storedRef = fileId;

  // Update DB with version bump — for highlight/reel/clean create multi-asset rows
  try {
    const now = new Date();
    const currentVersion = (part as unknown as { version?: number }).version ?? 1;
    const nextVersion = currentVersion + 1;

    if (type === "highlight" || type === "reel" || type === "clean" || type === "final" || type === "report" || (type === "cover" && (coverTarget || coverAssetId))) {
      const kind = type;
      if (type === "final") {
        const { eq: eqOrm, and: andOrm } = await import("drizzle-orm");
        const { contentPartAssets: assetsTbl } = await import("@/db/schema");
        await db.delete(assetsTbl).where(andOrm(eqOrm(assetsTbl.partId, id), eqOrm(assetsTbl.kind, "final")));
      }
      const { contentPartAssets } = await import("@/db/schema");
      if (coverAssetId) {
        const { eq } = await import("drizzle-orm");
        const [target] = await db
          .select({ id: contentPartAssets.id, partId: contentPartAssets.partId })
          .from(contentPartAssets)
          .where(eq(contentPartAssets.id, coverAssetId))
          .limit(1);
        if (!target || target.partId !== id) {
          return jsonError("برش/ریلز هدف در همین قسمت یافت نشد.", 422, "INVALID_TARGET_ASSET");
        }
      }
      const actorId = (user as unknown as { id?: string }).id ?? null;
      let asset: Record<string, unknown> | undefined;
      if (bundle) {
        // Multipart manifest: one row per part (bundled kinds resolve via bundle:<id>)
        let idx = 0;
        for (const pu of partUploads) {
          idx++;
          const [row] = await db
            .insert(contentPartAssets)
            .values({
              id: generateEntityId("CPP"),
              partId: id,
              kind,
              fileRef: pu.fileId,
              fileName: `${filename}.part${String(idx).padStart(3, "0")}`,
              targetKind: coverTarget,
              targetAssetId: coverAssetId,
              bundleId: bundle.id,
              partIndex: idx,
              partTotal: bundle.total,
              fileHash: pu.hash,
              createdBy: actorId,
              createdAt: now,
            } as never)
            .returning();
          if (!asset) asset = row as unknown as Record<string, unknown>;
        }
      } else {
        const assetId = generateEntityId("CPP");
        const [row] = await db
          .insert(contentPartAssets)
          .values({
            id: assetId,
            partId: id,
            kind,
            fileRef: storedRef,
            fileName: filename,
            targetKind: coverTarget,
            targetAssetId: coverAssetId,
            createdBy: actorId,
            createdAt: now,
          } as never)
          .returning();
        asset = row as unknown as Record<string, unknown>;
      }
      // bump part version for optimistic concurrency
      const [updated] =
        expectedVersion !== null
          ? await (async () => {
              const { and } = await import("drizzle-orm");
              const [u] = await db
                .update(contentParts)
                .set({ version: nextVersion, updatedAt: now } as never)
                .where(and(eq(contentParts.id, id), eq(contentParts.version, expectedVersion)) as never)
                .returning();
              if (!u) {
                const [exists] = await db.select({ id: contentParts.id }).from(contentParts).where(eq(contentParts.id, id)).limit(1);
                if (!exists) throw Object.assign(new Error("قسمت یافت نشد."), { code: "NOT_FOUND" });
                throw Object.assign(new Error("نسخه قدیمی است."), { code: "VERSION_CONFLICT" });
              }
              return [u];
            })()
          : await db.update(contentParts).set({ version: nextVersion, updatedAt: now } as never).where(eq(contentParts.id, id)).returning();
      try {
        const { workflowEvents } = await import("@/db/schema");
        await db.insert(workflowEvents).values({
          id: generateEntityId("WEV"),
          entityType: "content_part",
          entityId: id,
          action: "file_updated",
          before: { kind, file_ref: null } as unknown as Record<string, unknown>,
          after: { kind, fileRef: storedRef, assetId: (asset as { id?: string } | undefined)?.id ?? null, version: nextVersion } as unknown as Record<string, unknown>,
          actorUserId: (user as unknown as { id?: string }).id ?? null,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {}
      return jsonOk({ part: updated, asset, telegramFileId: fileId, telegramMessageId: messageId, type, targetKind: coverTarget, targetAssetId: coverAssetId, bundle: bundle ? { id: bundle.id, parts: bundle.total } : null });
    }

    const filePatch: Record<string, string> = type === "video" ? { fileRef: storedRef } : { coverFileRef: storedRef };
    if (bundle) {
      // Manifest rows for bundled single-column slots (kind video/cover)
      const { contentPartAssets: bundleTbl } = await import("@/db/schema");
      let bIdx = 0;
      for (const pu of partUploads) {
        bIdx++;
        await db.insert(bundleTbl).values({
          id: generateEntityId("CPP"),
          partId: id,
          kind: type,
          fileRef: pu.fileId,
          fileName: `${filename}.part${String(bIdx).padStart(3, "0")}`,
          bundleId: bundle.id,
          partIndex: bIdx,
          partTotal: bundle.total,
          fileHash: pu.hash,
          createdBy: (user as unknown as { id?: string }).id ?? null,
          createdAt: new Date(),
        } as never);
      }
    }

    if (expectedVersion !== null) {
      const { and } = await import("drizzle-orm");
      const [updated] = await db
        .update(contentParts)
        .set({
          ...filePatch,
          version: nextVersion,
          updatedAt: now,
        } as never)
        .where(and(eq(contentParts.id, id), eq(contentParts.version, expectedVersion)) as never)
        .returning();
      if (!updated) {
        const [exists] = await db.select({ id: contentParts.id }).from(contentParts).where(eq(contentParts.id, id)).limit(1);
        if (!exists) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
        return jsonError("نسخه قدیمی است.", 409, "VERSION_CONFLICT");
      }

      // Log event manually to workflow_events for audit (optional)
      try {
        const { workflowEvents } = await import("@/db/schema");
        await db.insert(workflowEvents).values({
          id: generateEntityId("WEV"),
          entityType: "content_part",
          entityId: id,
          action: "file_updated",
          before: { file_ref: (part as unknown as { fileRef: string | null }).fileRef, cover_file_ref: (part as unknown as { coverFileRef: string | null }).coverFileRef } as unknown as Record<string, unknown>,
          after: { ...filePatch, version: nextVersion } as unknown as Record<string, unknown>,
          actorUserId: (user as unknown as { id?: string }).id ?? null,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {
        // non-fatal
      }

      return jsonOk({ part: updated, telegramFileId: fileId, telegramMessageId: messageId, type, bundle: bundle ? { id: bundle.id, parts: bundle.total } : null });
    } else {
      // No version provided - optimistic without check
      const [updated] = await db
        .update(contentParts)
        .set({
          ...filePatch,
          version: nextVersion,
          updatedAt: now,
        } as never)
        .where(eq(contentParts.id, id))
        .returning();

      if (!updated) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");

      try {
        const { workflowEvents } = await import("@/db/schema");
        await db.insert(workflowEvents).values({
          id: generateEntityId("WEV"),
          entityType: "content_part",
          entityId: id,
          action: "file_updated",
          before: { file_ref: (part as unknown as { fileRef: string | null }).fileRef, cover_file_ref: (part as unknown as { coverFileRef: string | null }).coverFileRef } as unknown as Record<string, unknown>,
          after: { ...filePatch, version: nextVersion } as unknown as Record<string, unknown>,
          actorUserId: (user as unknown as { id?: string }).id ?? null,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {
        // non-fatal
      }

      return jsonOk({ part: updated, telegramFileId: fileId, telegramMessageId: messageId, type, bundle: bundle ? { id: bundle.id, parts: bundle.total } : null });
    }
  } catch (err) {
    const msg = (err as Error).message;
    if ((err as { code?: string }).code === "VERSION_CONFLICT") {
      return jsonError(msg, 409, "VERSION_CONFLICT");
    }
    return jsonInternalError(err, "api/content-room/parts/[id]/upload");
  }
}
