// Shared logic for attaching a Telegram file to a content-room part.
// Used by the panel link API and the webhook "pending reply" flow.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentPartAssets, workflowEvents } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";

export type PartMediaKind = "video" | "cover" | "highlight" | "reel";

export interface LinkPartMediaOptions {
  partId: string;
  kind: PartMediaKind;
  messageId: string;
  /** Real Telegram file_id (or null → caller must have resolved it; tg_msg_ fallback only here). */
  fileId: string | null;
  fileName: string | null;
  actorUserId: string | null;
  source: "api" | "telegram";
}

export interface LinkPartMediaResult {
  storedRef: string;
}

export async function linkPartMedia(opts: LinkPartMediaOptions): Promise<LinkPartMediaResult> {
  const { partId, kind, messageId, fileId, fileName, actorUserId, source } = opts;
  const storedRef = fileId ?? `tg_msg_${messageId}`;
  const now = new Date();

  const [part] = await db.select().from(contentParts).where(eq(contentParts.id, partId)).limit(1);
  if (!part) throw new Error("قسمت یافت نشد.");

  const currentVersion = (part as unknown as { version?: number }).version ?? 1;
  const nextVersion = currentVersion + 1;

  if (kind === "highlight" || kind === "reel") {
    const assetId = generateEntityId("CPP");
    await db.insert(contentPartAssets).values({
      id: assetId,
      partId,
      kind,
      fileRef: storedRef,
      fileName: fileName ?? `${kind}_${messageId}`,
      createdBy: actorUserId,
      createdAt: now,
    } as never);
    await db.update(contentParts).set({ version: nextVersion, updatedAt: now } as never).where(eq(contentParts.id, partId));
    try {
      await db.insert(workflowEvents).values({
        id: generateEntityId("WEV"),
        entityType: "content_part",
        entityId: partId,
        action: "linked_from_telegram",
        before: { kind, file_ref: null } as unknown as Record<string, unknown>,
        after: { kind, messageId, fileId: storedRef, fileName: fileName ?? null, assetId, version: nextVersion } as unknown as Record<string, unknown>,
        actorUserId,
        source,
        reason: null,
        createdAt: now,
      } as never);
    } catch {}
  } else {
    const patch: Record<string, string> = kind === "video" ? { fileRef: storedRef } : { coverFileRef: storedRef };
    const [updated] = await db
      .update(contentParts)
      .set({ ...patch, version: nextVersion, updatedAt: now } as never)
      .where(eq(contentParts.id, partId))
      .returning();
    if (!updated) throw new Error("قسمت یافت نشد.");
    try {
      await db.insert(workflowEvents).values({
        id: generateEntityId("WEV"),
        entityType: "content_part",
        entityId: partId,
        action: "linked_from_telegram",
        before: {
          file_ref: (part as unknown as { fileRef?: string | null }).fileRef ?? null,
          cover_file_ref: (part as unknown as { coverFileRef?: string | null }).coverFileRef ?? null,
        } as unknown as Record<string, unknown>,
        after: { ...patch, kind, messageId, fileId: storedRef, fileName: fileName ?? null, version: nextVersion } as unknown as Record<string, unknown>,
        actorUserId,
        source,
        reason: null,
        createdAt: now,
      } as never);
    } catch {}
  }

  return { storedRef };
}

/** Parse a t.me message link → { chatId, messageId } (supports /c/ private groups and public usernames). */
export function parseTelegramMessageLink(link: string): { chatId: string | null; messageId: string | null } {
  const m = link.trim().match(/^(?:https?:\/\/)?t\.me\/(?:c\/(\d+)\/(\d+)|([a-zA-Z0-9_]+)\/(\d+))\/?$/i);
  if (!m) return { chatId: null, messageId: null };
  if (m[1]) return { chatId: m[1], messageId: m[2] };
  return { chatId: null, messageId: m[4] ?? null };
}
