// Shared logic for attaching a Telegram file to a content-room part.
// Used by the panel link API and the webhook "pending reply" flow.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentPartAssets, workflowEvents } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";

export type PartMediaKind = "video" | "cover" | "highlight" | "reel" | "clean";

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

  if (kind === "highlight" || kind === "reel" || kind === "clean") {
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

  // best-effort mirror enqueue (video kinds only) — the cron reconcile owns
  // uploads serially; never fails linking
  try {
    const { maybeMirrorAfterLink } = await import("@/lib/mirrors/job");
    void maybeMirrorAfterLink({ partId, kind, fileId: storedRef }).catch(() => {});
  } catch {}

  return { storedRef };
}

/** Parse a t.me message link → { chatId, messageId }.
 * Supports private groups (/c/<chat>/<msg>), group topics (/c/<chat>/<thread>/<msg>,
 * <username>/<thread>/<msg>), plain public links, and ignores query/fragment
 * suffixes (?single, ?thread=, #...). messageId is always the last segment. */
export function parseTelegramMessageLink(link: string): { chatId: string | null; messageId: string | null } {
  const none = { chatId: null, messageId: null };
  const clean = link.trim().split(/[?#]/)[0].replace(/\/+$/, "");
  const m = clean.match(/^(?:https?:\/\/)?t\.me\/([^\s/]+)(?:\/([^\s/]+))?(?:\/([^\s/]+))?(?:\/([^\s/]+))?$/i);
  if (!m) return none;
  const [, a, b, c, d] = m;
  const isNum = (s: string | undefined) => !!s && /^\d+$/.test(s);
  if (d !== undefined) {
    // four segments: only c/<chat>/<thread>/<msg> is meaningful
    if (a.toLowerCase() === "c" && isNum(b) && isNum(d)) return { chatId: b as string, messageId: d as string };
    return none;
  }
  if (c !== undefined) {
    // three segments: messageId is last when numeric
    if (!isNum(c)) return none;
    if (a.toLowerCase() === "c" && isNum(b)) return { chatId: b as string, messageId: c as string };
    return { chatId: null, messageId: c as string };
  }
  if (b === undefined) return none;
  // two segments: <username>/<msg>
  if (!isNum(b) || a.toLowerCase() === "c") return none;
  return { chatId: null, messageId: b };
}
