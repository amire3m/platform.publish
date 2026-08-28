import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { TelegramClient, TelegramNotConfiguredError } from "@/lib/telegram/client";
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("فرم نامعتبر است.", 400, "INVALID_FORM");
  }

  const file = form.get("file");
  const typeRaw = form.get("type");
  const expectedVersionRaw = form.get("expectedVersion");

  if (!(file instanceof File)) return jsonError("فایل ارسال نشده است.", 400, "FILE_REQUIRED");
  const type = typeof typeRaw === "string" ? typeRaw : "";
  if (type !== "video" && type !== "cover" && type !== "highlight" && type !== "reel") {
    return jsonError("نوع فایل نامعتبر است.", 400, "INVALID_TYPE");
  }

  // Validate size and mime
  const mime = file.type || "";
  const size = file.size;
  const isVideoType = type === "video" || type === "highlight" || type === "reel";

  if (isVideoType) {
    if (size > MAX_VIDEO_BYTES) {
      return jsonError("حجم ویدئو نباید بیش از ۲ گیگابایت باشد. فایل‌های بزرگ‌تر را فشرده یا کوتاه کنید.", 422, "FILE_TOO_LARGE");
    }
    if (!isVideoMime(mime)) {
      return jsonError(`فرمت ویدئو پشتیبانی نمی‌شود: ${mime || "نامشخص"}. فرمت‌های مجاز: mp4، mov، avi، webm و mkv.`, 422, "INVALID_MIME");
    }
  } else {
    if (size > MAX_COVER_BYTES) {
      return jsonError("حجم کاور نباید بیش از ۱۰ مگابایت باشد.", 422, "FILE_TOO_LARGE");
    }
    if (!isImageMime(mime)) {
      return jsonError(`فرمت کاور پشتیبانی نمی‌شود: ${mime || "نامشخص"}. فرمت‌های مجاز: jpeg و png.`, 422, "INVALID_MIME");
    }
  }

  // Optional version check
  let expectedVersion: number | null = null;
  if (typeof expectedVersionRaw === "string" && expectedVersionRaw.trim() !== "") {
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

  // Telegram client
  let client: TelegramClient;
  try {
    client = TelegramClient.fromEnv();
  } catch (err) {
    if (err instanceof TelegramNotConfiguredError) {
      return jsonError(
        "اتصال تلگرام پیکربندی نشده است؛ آپلود فایل بدون مخزن تلگرام امکان‌پذیر نیست.",
        400,
        "TELEGRAM_NOT_CONFIGURED",
      );
    }
    throw err;
  }

  // برای فایل 2GB کل محتوا را در RAM کپی نکن — File خود Blob است
  const uploadBlob: Blob = file;

  // Use existing telegram storage pattern: sendDocument to preserve raw bytes
  let fileId: string | null = null;
  let messageId: number | null = null;
  try {
    if (isVideoType) {
      // Try sendVideo first, fall back to sendDocument (video/highlight/reel are all video)
      try {
        const sent = await client.sendVideo(uploadBlob, file.name);
        fileId = sent.video?.file_id ?? null;
        messageId = sent.message_id;
      } catch {
        const sent = await client.sendDocument(uploadBlob, file.name);
        fileId =
          sent.document?.file_id ??
          sent.video?.file_id ??
          sent.audio?.file_id ??
          sent.photo?.[0]?.file_id ??
          null;
        messageId = sent.message_id;
      }
      if (!fileId) {
        // fallback to document
        const sent = await client.sendDocument(uploadBlob, file.name);
        fileId =
          sent.document?.file_id ??
          sent.video?.file_id ??
          sent.audio?.file_id ??
          sent.photo?.[0]?.file_id ??
          null;
        messageId = sent.message_id;
      }
    } else {
      // cover: sendPhoto or sendDocument
      try {
        const sent = await client.sendPhoto(uploadBlob, file.name);
        fileId = sent.photo?.[0]?.file_id ?? String(sent.message_id);
        messageId = sent.message_id;
      } catch {
        const sent = await client.sendDocument(uploadBlob, file.name);
        fileId =
          sent.document?.file_id ??
          sent.photo?.[0]?.file_id ??
          String(sent.message_id);
        messageId = sent.message_id;
      }
    }
  } catch (err) {
    console.error("[content-room-upload] Telegram upload failed:", err);
    return jsonError("ارسال فایل به Telegram انجام نشد. دوباره تلاش کنید.", 502, "TELEGRAM_UPLOAD_FAILED");
  }

  if (!fileId) {
    // fallback to message id based ref
    fileId = messageId ? `tg_msg_${messageId}` : `tg_file_${Date.now()}`;
  }

  // For cover we store telegram file id, for video we store file_id; optionally prefix with type
  const storedRef = fileId;

  // Update DB with version bump
  try {
    const now = new Date();
    const currentVersion = (part as unknown as { version?: number }).version ?? 1;
    const nextVersion = currentVersion + 1;

    const filePatch: Record<string, string> =
      type === "video" ? { fileRef: storedRef } : type === "cover" ? { coverFileRef: storedRef } : type === "highlight" ? { highlightFileRef: storedRef } : { reelFileRef: storedRef };

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
          before: { file_ref: (part as unknown as { fileRef: string | null }).fileRef, cover_file_ref: (part as unknown as { coverFileRef: string | null }).coverFileRef, highlight_file_ref: (part as unknown as { highlightFileRef: string | null }).highlightFileRef, reel_file_ref: (part as unknown as { reelFileRef: string | null }).reelFileRef } as unknown as Record<string, unknown>,
          after: { ...filePatch, version: nextVersion } as unknown as Record<string, unknown>,
          actorUserId: (user as unknown as { id?: string }).id ?? null,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {
        // non-fatal
      }

      return jsonOk({ part: updated, telegramFileId: fileId, telegramMessageId: messageId, type });
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
          before: { file_ref: (part as unknown as { fileRef: string | null }).fileRef, cover_file_ref: (part as unknown as { coverFileRef: string | null }).coverFileRef, highlight_file_ref: (part as unknown as { highlightFileRef: string | null }).highlightFileRef, reel_file_ref: (part as unknown as { reelFileRef: string | null }).reelFileRef } as unknown as Record<string, unknown>,
          after: { ...filePatch, version: nextVersion } as unknown as Record<string, unknown>,
          actorUserId: (user as unknown as { id?: string }).id ?? null,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {
        // non-fatal
      }

      return jsonOk({ part: updated, telegramFileId: fileId, telegramMessageId: messageId, type });
    }
  } catch (err) {
    const msg = (err as Error).message;
    if ((err as { code?: string }).code === "VERSION_CONFLICT") {
      return jsonError(msg, 409, "VERSION_CONFLICT");
    }
    return jsonInternalError(err, "api/content-room/parts/[id]/upload");
  }
}
