import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentProducts, contentPartAssets, workflowEvents } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { buildTelegramMediaUrl } from "@/lib/media/telegram-url";

export const runtime = "nodejs";

export interface GroupMediaItem {
  messageId: string;
  fileId: string | null;
  fileName: string | null;
  mime: string | null;
  date: string | null;
  caption: string | null;
  /** Telegram forum topic name this message was posted in (null = main chat). */
  topicName: string | null;
  /** Signed thumbnail URL for instant visual identification (null when unknown). */
  thumbUrl: string | null;
  /** Video duration in seconds when known. */
  durationSec: number | null;
  /** Real playable URL (null when only a tg_msg_ fallback ref exists). */
  playUrl: string | null;
  /** true when this exact file is already attached to some part. */
  linked: boolean;
  /** Where it is linked, for a quick jump. */
  linkedTo: { partId: string; partNumber: number | null; productTitle: string | null } | null;
  /** t.me link to the original message. */
  telegramLink: string;
}

export interface GroupMediaDependencies {
  getCurrentUser: typeof getCurrentUser;
  db: typeof db;
}

const defaultDependencies: GroupMediaDependencies = {
  getCurrentUser,
  db,
};

function parseLimit(req: Request): number {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("limit");
    if (raw == null || raw.trim() === "") return 24;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 24;
    if (n < 1) return 1;
    if (n > 50) return 50;
    return n;
  } catch {
    return 24;
  }
}

interface EventLike {
  entityId: string;
  after: Record<string, unknown>;
  createdAt: Date | string | null;
}

function toItem(row: EventLike, topicName: string | null, chatIdForLink: string): GroupMediaItem {
  const after = row.after ?? {};
  const messageId = String(after.messageId ?? row.entityId ?? "");
  const rawFileId = (after.fileId ?? after.file_id ?? null) as string | null;
  const realFileId = rawFileId && !rawFileId.startsWith("tg_msg_") ? rawFileId : null;
  const thumbId = (after.thumbFileId ?? after.thumb_file_id ?? null) as string | null;
  const fileName = (after.fileName ?? after.file_name ?? null) as string | null;
  const durationSec = (after.durationSec ?? after.duration ?? null) as number | null;
  const caption = (after.caption ?? null) as string | null;
  return {
    messageId,
    fileId: rawFileId,
    fileName,
    mime: (after.mime as string | undefined) ?? null,
    date: row.createdAt ? new Date(row.createdAt as string | Date).toISOString() : null,
    caption,
    topicName,
    thumbUrl: buildTelegramMediaUrl(thumbId, "image/jpeg"),
    durationSec: typeof durationSec === "number" ? durationSec : null,
    playUrl: realFileId ? buildTelegramMediaUrl(realFileId, "video/mp4") : null,
    linked: false,
    linkedTo: null,
    telegramLink: `https://t.me/c/${chatIdForLink}/${messageId}`,
  };
}

function toGroupMediaItemFromAsset(row: {
  id: string;
  fileRef: string | null;
  fileName: string | null;
  createdAt: Date | string | null;
}): GroupMediaItem {
  const fileRef = (row.fileRef ?? null) as string | null;
  let messageId: string;
  if (fileRef && fileRef.startsWith("tg_msg_")) {
    messageId = fileRef.replace("tg_msg_", "");
  } else if (fileRef && /^[0-9]+$/.test(fileRef)) {
    messageId = fileRef;
  } else {
    messageId = row.id;
  }
  return {
    messageId,
    fileId: fileRef,
    fileName: row.fileName ?? null,
    mime: null,
    date: row.createdAt ? new Date(row.createdAt as string | Date).toISOString() : null,
    caption: null,
    topicName: null,
    thumbUrl: null,
    durationSec: null,
    playUrl: null,
    linked: true,
    linkedTo: null,
    telegramLink: "",
  };
}

export async function handleGroupMediaRequest(
  req: Request,
  deps: GroupMediaDependencies = defaultDependencies,
): Promise<Response> {
  const limit = parseLimit(req);

  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = (await Promise.race([
      deps.getCurrentUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("getCurrentUser timeout")), 1500),
      ),
    ])) as Awaited<ReturnType<typeof getCurrentUser>>;
  } catch {
    return jsonError("لطفا دوباره وارد شوید.", 401, "UNAUTHENTICATED");
  }
  if (!user) return jsonError("لطفا دوباره وارد شوید.", 401, "UNAUTHENTICATED");

  try {
    const items: GroupMediaItem[] = [];
    const groupId = process.env.TELEGRAM_GROUP_ID || "";
    const chatIdForLink = groupId.replace("-100", "");

    // 1. Primary: webhook-captured group videos (true message ids, thumbs, durations)
    try {
      const { or } = await import("drizzle-orm");
      const fetched = (await deps.db
        .select()
        .from(workflowEvents)
        .where(
          or(
            eq((workflowEvents as unknown as { action: unknown }).action as never, "group_video_replied" as never),
            eq((workflowEvents as unknown as { action: unknown }).action as never, "linked_from_telegram" as never),
          ) as never,
        )
        .orderBy(desc((workflowEvents as unknown as { createdAt: unknown }).createdAt as never))
        .limit(limit * 3)) as unknown as Array<{ entityId: string; after: unknown; createdAt: unknown; entityType: string }>;

      const relevant = fetched.filter((r) => {
        const after = (r.after ?? {}) as Record<string, unknown>;
        if (r.entityType === "telegram_group_message") return true;
        // linked_from_telegram rows describe part links, not raw group files — skip
        return false;
      }).slice(0, limit);

      // topic names
      const threadIds = [
        ...new Set(
          relevant
            .map((r) => (r.after ?? {}) as Record<string, unknown>)
            .map((after) => after.messageThreadId ?? after.message_thread_id)
            .filter((t): t is number => typeof t === "number"),
        ),
      ];
      const threadToLabel = new Map<number, string>();
      if (threadIds.length > 0) {
        try {
          const { telegramTopics } = await import("@/db/schema");
          const { inArray } = await import("drizzle-orm");
          const topicRows = (await deps.db
            .select()
            .from(telegramTopics as unknown as never)
            .where(inArray((telegramTopics as unknown as { messageThreadId: unknown }).messageThreadId as never, threadIds as never))) as unknown as Array<{ messageThreadId: number; label: string }>;
          for (const t of topicRows) threadToLabel.set(t.messageThreadId, t.label);
        } catch {}
      }

      for (const r of relevant) {
        const after = (r.after ?? {}) as Record<string, unknown>;
        const tid = (after.messageThreadId ?? after.message_thread_id) as number | undefined;
        items.push(toItem({ entityId: r.entityId, after, createdAt: r.createdAt as Date | null }, tid ? threadToLabel.get(tid) ?? null : null, chatIdForLink));
      }

      // 2. linked-status: which file_ids already live on parts/assets
      const realIds = new Set(items.map((i) => i.fileId).filter((v): v is string => !!v && !v.startsWith("tg_msg_")));
      const msgIds = new Set(items.filter((i) => (i.fileId ?? "").startsWith("tg_msg_")).map((i) => (i.fileId as string).replace("tg_msg_", "")));
      const linkMap = new Map<string, { partId: string; partNumber: number | null; productTitle: string | null }>();
      if (realIds.size > 0 || msgIds.size > 0) {
        try {
          const parts = (await deps.db.select().from(contentParts).limit(2000)) as unknown as Array<{ id: string; partNumber: number; productId: string; fileRef: string | null; coverFileRef: string | null }>;
          const products = (await deps.db.select().from(contentProducts).limit(1000)) as unknown as Array<{ id: string; title: string }>;
          const productTitle = new Map(products.map((p) => [p.id, p.title] as const));
          const assets = (await deps.db.select().from(contentPartAssets).limit(2000)) as unknown as Array<{ partId: string; fileRef: string | null }>;
          const consider = (ref: string | null, partId: string) => {
            if (!ref) return;
            if (realIds.has(ref) || (ref.startsWith("tg_msg_") && msgIds.has(ref.replace("tg_msg_", "")))) {
              const part = parts.find((p) => p.id === partId);
              linkMap.set(ref, {
                partId,
                partNumber: part?.partNumber ?? null,
                productTitle: part ? productTitle.get(part.productId) ?? null : null,
              });
            }
          };
          for (const p of parts) {
            consider(p.fileRef, p.id);
            consider(p.coverFileRef, p.id);
          }
          for (const a of assets) consider(a.fileRef, a.partId);
        } catch {}
      }
      for (const item of items) {
        const hit = item.fileId ? linkMap.get(item.fileId) : undefined;
        if (hit) {
          item.linked = true;
          item.linkedTo = hit;
        }
      }
    } catch {
      // fall through to assets fallback
    }

    if (items.length > 0) {
      return jsonOk({ items: items.slice(0, limit) });
    }

    // 3. Fallback: recent contentPartAssets (legacy)
    const rows = (await deps.db
      .select({
        id: contentPartAssets.id,
        fileRef: contentPartAssets.fileRef,
        fileName: contentPartAssets.fileName,
        createdAt: contentPartAssets.createdAt,
      })
      .from(contentPartAssets)
      .orderBy(desc(contentPartAssets.createdAt))
      .limit(limit)) as unknown as Array<{ id: string; fileRef: string | null; fileName: string | null; createdAt: Date | string | null }>;

    return jsonOk({ items: rows.map(toGroupMediaItemFromAsset) });
  } catch (err) {
    console.warn("[group-media] fallback empty list:", (err as Error).message?.slice(0, 200));
    return jsonOk({ items: [] });
  }
}

export async function GET(req: Request): Promise<Response> {
  return handleGroupMediaRequest(req, defaultDependencies);
}
