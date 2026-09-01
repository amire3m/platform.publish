import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { linkPartMedia, parseTelegramMessageLink, type PartMediaKind } from "@/lib/content-room/link";
import { setPendingReply, clearPendingReply, pendingTtlSeconds } from "@/lib/content-room/pending-link";
import { TelegramClient } from "@/lib/telegram/client";

export const runtime = "nodejs";

const KINDS: PartMediaKind[] = ["video", "cover", "highlight", "reel"];

/** Resolve a real file_id for a t.me link by forwarding the message once. */
async function resolveLinkFileId(chatIdNum: string | null, messageId: string): Promise<{ fileId: string | null; fileName: string | null }> {
  const groupEnv = (process.env.TELEGRAM_GROUP_ID || "").replace("-100", "");
  const chatId = chatIdNum ?? groupEnv;
  if (!chatId || !/^[0-9]+$/.test(messageId)) return { fileId: null, fileName: null };
  try {
    const client = TelegramClient.fromEnv();
    const fullChat = chatId.startsWith("-100") ? chatId : `-100${chatId}`;
    const resolved = await client.resolveVideoByForward(fullChat, Number(messageId));
    if (!resolved) return { fileId: null, fileName: null };
    return { fileId: resolved.fileId, fileName: null };
  } catch (err) {
    console.error("[part-link] resolve failed:", (err as Error).message);
    return { fileId: null, fileName: null };
  }
}

export async function POST(req: Request) {
  const { user: authUser, response } = await requirePermission("manage_content_room");
  if (response || !authUser) return response ?? jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  try {
    const body = (await req.json().catch(() => null)) as {
      partId?: string;
      kind?: string;
      mode?: "link" | "await_reply" | "cancel";
      telegramLink?: string;
    } | null;
    if (!body?.partId || !KINDS.includes(body.kind as PartMediaKind)) {
      return jsonError("شناسه قسمت و نوع فایل الزامی است.", 422, "VALIDATION_ERROR");
    }
    const kind = body.kind as PartMediaKind;
    const actor = authUser as unknown as { id: string; telegramId: string | null };

    const [part] = await db.select().from(contentParts).where(eq(contentParts.id, body.partId)).limit(1);
    if (!part) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");

    // Cancel a pending await_reply session
    if (body.mode === "cancel") {
      if (actor.telegramId) clearPendingReply(actor.telegramId);
      return jsonOk({ mode: "cancelled" });
    }

    // Mode 1: paste a t.me link → resolve + link immediately
    if (body.mode === "link") {
      const parsed = parseTelegramMessageLink(body.telegramLink ?? "");
      if (!parsed.messageId) return jsonError("لینک پیام تلگرام معتبر نیست. مثال: https://t.me/c/…/123", 422, "VALIDATION_ERROR");
      const { fileId } = await resolveLinkFileId(parsed.chatId, parsed.messageId);
      const result = await linkPartMedia({
        partId: body.partId,
        kind,
        messageId: parsed.messageId,
        fileId,
        fileName: null,
        actorUserId: actor.id ?? null,
        source: "api",
      });
      return jsonOk({ mode: "linked", storedRef: result.storedRef, resolved: !!fileId });
    }

    // Mode 2: arm "reply to link" — valid for a short TTL
    if (body.mode === "await_reply") {
      if (!actor.telegramId) return jsonError("حساب شما به تلگرام متصل نیست؛ لینک را مستقیم وارد کنید.", 422, "NOT_CONFIGURED");
      const entry = setPendingReply(actor.telegramId, {
        userId: actor.id,
        partId: body.partId,
        partNumber: (part as unknown as { partNumber: number }).partNumber ?? 0,
        kind,
      });
      return jsonOk({ mode: "awaiting", ttlSeconds: pendingTtlSeconds(entry), partNumber: entry.partNumber, kind: entry.kind });
    }

    return jsonError("حالت نامعتبر است.", 422, "VALIDATION_ERROR");
  } catch (err) {
    return jsonInternalError(err, "content-room/part-link POST");
  }
}
