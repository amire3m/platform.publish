import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentPartMusic, musicLibrary } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { parseTelegramMessageLink } from "@/lib/content-room/link";
import { TelegramClient } from "@/lib/telegram/client";
import { buildPlaybackUrl, isRealFileId } from "@/lib/media/playback-token";
import { generateEntityId } from "@/lib/ids";

function canEdit(subject: { role: string; allowedActions: string[] }): boolean {
  return hasPermission(subject, "manage_content_room") || hasPermission(subject, "update_assigned_content");
}

/** Shared music library: register once, reuse in any video without re-upload. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  try {
    const rows = (await db.select().from(musicLibrary).orderBy(desc(musicLibrary.createdAt)).limit(500)) as unknown as Array<{
      id: string;
      title: string;
      fileRef: string;
      fileName: string | null;
      telegramLink: string | null;
      createdBy: string | null;
      createdAt: Date | string;
    }>;
    const usage = (await db
      .select({ musicId: contentPartMusic.musicId, used: count() })
      .from(contentPartMusic)
      .groupBy(contentPartMusic.musicId)) as unknown as Array<{ musicId: string; used: number }>;
    const usedById = new Map(usage.map((u) => [u.musicId, Number(u.used)]));
    return jsonOk({
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        usedInParts: usedById.get(r.id) ?? 0,
        playbackUrl: isRealFileId(r.fileRef) ? buildPlaybackUrl(r.fileRef, "audio/mpeg") : null,
      })),
    });
  } catch (error) {
    return jsonInternalError(error, "api/music GET");
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
  };
  if (!canEdit(subject)) return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");

  const body = (await req.json().catch(() => null)) as { title?: string; telegramLink?: string; fileId?: string; fileName?: string } | null;
  const title = body?.title?.trim();
  if (!title) return jsonError("عنوان موسیقی الزامی است.", 422, "VALIDATION_ERROR");

  let fileId = body?.fileId?.trim() || null;
  let fileName: string | null = body?.fileName?.trim() || null;
  const telegramLink = body?.telegramLink?.trim() || null;

  if (!fileId && telegramLink) {
    const parsed = parseTelegramMessageLink(telegramLink);
    if (!parsed) return jsonError("لینک تلگرام معتبر نیست.", 422, "VALIDATION_ERROR");
    try {
      const groupEnv = (process.env.TELEGRAM_GROUP_ID || "").replace("-100", "");
      const chatId = parsed.chatId ?? groupEnv;
      const fullChat = chatId.startsWith("-100") ? chatId : `-100${chatId}`;
      const client = TelegramClient.fromEnv();
      const resolved = await client.resolveVideoByForward(fullChat, Number(parsed.messageId));
      if (!resolved?.fileId) return jsonError("فایل از تلگرام قابل دریافت نبود.", 422, "UNRESOLVABLE");
      fileId = resolved.fileId;
    } catch (error) {
      return jsonInternalError(error, "api/music resolve");
    }
  }
  if (!fileId) return jsonError("شناسه فایل یا لینک تلگرام الزامی است.", 422, "VALIDATION_ERROR");

  try {
    const [row] = await db
      .insert(musicLibrary)
      .values({
        id: generateEntityId("MUS"),
        title,
        fileRef: fileId,
        fileName,
        telegramLink,
        createdBy: (user as unknown as { id: string }).id,
      } as never)
      .returning();
    return jsonOk(row, 201);
  } catch (error) {
    return jsonInternalError(error, "api/music POST");
  }
}
