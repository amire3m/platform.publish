import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentPartAssets, workflowEvents } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { generateEntityId } from "@/lib/ids";
import { TelegramClient } from "@/lib/telegram/client";

export const runtime = "nodejs";

const ALLOWED_KINDS = new Set(["video", "cover", "highlight", "reel"] as const);
type Kind = "video" | "cover" | "highlight" | "reel";

export interface LinkRouteDependencies {
  getCurrentUser: typeof getCurrentUser;
  db: typeof db;
  getTelegramClient?: () => TelegramClient | null;
}

const defaultDependencies: LinkRouteDependencies = {
  getCurrentUser,
  db,
  getTelegramClient: () => {
    try {
      return TelegramClient.fromEnv();
    } catch {
      return null;
    }
  },
};

export async function handleLinkRequest(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
  deps: LinkRouteDependencies = defaultDependencies,
): Promise<Response> {
  const { id } = await ctx.params;

  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = (await Promise.race([
      deps.getCurrentUser(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("getCurrentUser timeout")), 1500)),
    ])) as Awaited<ReturnType<typeof getCurrentUser>>;
  } catch {
    return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  }
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 400, "VALIDATION_ERROR");
  }

  const raw = body as Record<string, unknown>;
  const messageIdRaw = raw.messageId;
  const fileIdRaw = raw.fileId;
  const fileNameRaw = raw.fileName;
  const kindRaw = raw.kind;

  if (messageIdRaw === undefined || messageIdRaw === null || String(messageIdRaw).trim() === "") {
    return jsonError("شناسه پیام الزامی است.", 400, "VALIDATION_ERROR");
  }
  const messageId = String(messageIdRaw).trim();
  // numeric validation optional, allow string
  if (typeof kindRaw !== "string" || !ALLOWED_KINDS.has(kindRaw as Kind)) {
    return jsonError("نوع نامعتبر است. مقادیر مجاز: video، cover، highlight، reel.", 400, "INVALID_KIND");
  }
  const kind = kindRaw as Kind;

  const fileId = typeof fileIdRaw === "string" && fileIdRaw.trim() !== "" && !fileIdRaw.startsWith("tg_msg_") ? fileIdRaw.trim() : null;
  const fileName = typeof fileNameRaw === "string" && fileNameRaw.trim() !== "" ? fileNameRaw.trim() : null;

  // Optional Telegram validation without re-uploading the 2GB blob — copy file_id
  if (fileId) {
    const client = deps.getTelegramClient?.() ?? null;
    if (client) {
      try {
        await client.getFile(fileId);
      } catch (err) {
        // If file_id is invalid/expired, surface as validation error; if client misconfigured, ignore
        const msg = (err as Error).message ?? "";
        if (msg.includes("Telegram API error")) {
          return jsonError("شناسه فایل تلگرام نامعتبر است.", 400, "INVALID_FILE_ID");
        }
        // non-fatal otherwise
      }
    }
  }

  // Panel link without a real file_id → resolve via temp forward (once per message).
  let effectiveFileId = fileId;
  let storedRef = effectiveFileId ?? `tg_msg_${messageId}`;
  const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (!effectiveFileId && !isTestEnv) {
    const numericId = Number(messageId);
    if (Number.isFinite(numericId) && numericId > 0) {
      try {
        const client = deps.getTelegramClient?.() ?? null;
        const chatId = process.env.TELEGRAM_GROUP_ID || "";
        if (client && chatId) {
          const resolved = await client.resolveVideoByForward(chatId, numericId);
          if (resolved) {
            effectiveFileId = resolved.fileId;
            storedRef = resolved.fileId;
          }
        }
      } catch (err) {
        console.error("[link] forward-resolve failed:", (err as Error).message);
      }
    }
  }

  // Fetch part
  const [part] = await deps.db.select().from(contentParts).where(eq(contentParts.id, id)).limit(1);
  if (!part) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");

  try {
    const now = new Date();
    const currentVersion = (part as unknown as { version?: number }).version ?? 1;
    const nextVersion = currentVersion + 1;
    const actorUserId = (user as unknown as { id?: string }).id ?? null;

    if (kind === "highlight" || kind === "reel") {
      const assetId = generateEntityId("CPP");
      const [asset] = await deps.db
        .insert(contentPartAssets)
        .values({
          id: assetId,
          partId: id,
          kind,
          fileRef: storedRef,
          fileName: fileName ?? (fileId ? `${kind}_${messageId}` : `video_${messageId}`),
          createdBy: actorUserId,
          createdAt: now,
        } as never)
        .returning();

      // bump part version for optimistic concurrency
      const [updated] = await deps.db
        .update(contentParts)
        .set({ version: nextVersion, updatedAt: now } as never)
        .where(eq(contentParts.id, id))
        .returning();

      try {
        await deps.db.insert(workflowEvents).values({
          id: generateEntityId("WEV"),
          entityType: "content_part",
          entityId: id,
          action: "linked_from_telegram",
          before: { kind, file_ref: null } as unknown as Record<string, unknown>,
          after: { kind, messageId, fileId: storedRef, fileName: fileName ?? null, assetId, version: nextVersion } as unknown as Record<string, unknown>,
          actorUserId,
          source: "api",
          reason: null,
          createdAt: now,
        } as never);
      } catch {}

      return jsonOk({ part: updated ?? part, asset, fileRef: storedRef, kind, messageId });
    }

    // video / cover -> update single column
    const filePatch: Record<string, string> = kind === "video" ? { fileRef: storedRef } : { coverFileRef: storedRef };

    const [updated] = await deps.db
      .update(contentParts)
      .set({ ...filePatch, version: nextVersion, updatedAt: now } as never)
      .where(eq(contentParts.id, id))
      .returning();

    if (!updated) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");

    try {
      await deps.db.insert(workflowEvents).values({
        id: generateEntityId("WEV"),
        entityType: "content_part",
        entityId: id,
        action: "linked_from_telegram",
        before: {
          file_ref: (part as unknown as { fileRef?: string | null }).fileRef ?? null,
          cover_file_ref: (part as unknown as { coverFileRef?: string | null }).coverFileRef ?? null,
        } as unknown as Record<string, unknown>,
        after: { ...filePatch, kind, messageId, fileId: storedRef, fileName: fileName ?? null, version: nextVersion } as unknown as Record<string, unknown>,
        actorUserId,
        source: "api",
        reason: null,
        createdAt: now,
      } as never);
    } catch {}

    return jsonOk({ part: updated, fileRef: storedRef, kind, messageId });
  } catch (err) {
    return jsonInternalError(err, "api/content-room/parts/[id]/link");
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleLinkRequest(req, ctx, defaultDependencies);
}
