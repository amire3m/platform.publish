import { desc } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentProducts, contentPartAssets, workflowEvents } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { getChannelLabelFa } from "@/lib/channels";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

function buildToken(fileId: string, mime?: string) {
  const secret = process.env.JWT_SECRET || "dev-only-insecure-jwt-secret-change-me";
  return jwt.sign({ fileId, contentType: mime }, secret, { expiresIn: "15m" });
}

function buildUrl(token: string) {
  const base = process.env.APP_BASE_URL || "";
  return base ? `${base}/api/media/telegram/${token}` : `/api/media/telegram/${token}`;
}

function isRealFileId(v: string | null | undefined): boolean {
  return !!v && !v.startsWith("tg_msg_") && !v.startsWith("sample_");
}

export interface LibraryFileItem {
  id: string;
  filename: string;
  type: "full_video" | "highlight" | "reel" | "cover" | string;
  playbackUrl: string;
  mirrorUrl?: string | null;
  fileId?: string | null;
  createdAt: string;
  telegramLink?: string;
  partId?: string;
}

export interface LibraryPartNode {
  partId: string;
  partNumber: number;
  fullVideo: LibraryFileItem | null;
  highlights: LibraryFileItem[];
  reels: LibraryFileItem[];
  cover: LibraryFileItem | null;
}

export interface LibraryProductNode {
  productId: string;
  title: string;
  status: string;
  /** Files directly under the product when it has no parts. */
  files: LibraryFileItem[];
  parts: LibraryPartNode[];
}

export interface LibraryChannelNode {
  channel: string;
  label: string;
  products: LibraryProductNode[];
}

export interface LibraryTreeResponse {
  channels: LibraryChannelNode[];
  /** Unlinked recent group videos (no channel/product home). */
  group: Array<LibraryFileItem & { messageId: string }>;
}

/** Attach ready mirror URLs to items (pure; fetching happens in GET). */
export function attachMirrorUrls<T extends { fileId?: string | null }>(
  items: readonly T[],
  mirrors: Record<string, string>,
): Array<T & { mirrorUrl: string | null }> {
  return items.map((item) => ({
    ...item,
    mirrorUrl: (item.fileId && mirrors[item.fileId]) || null,
  }));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const allowedChannels = (user as unknown as { allowedChannels?: string[] }).allowedChannels ?? [];
  const role = (user as unknown as { role?: string }).role ?? "viewer";
  const isPrivileged = ["owner", "manager", "admin"].includes(role) || allowedChannels.length === 0;

  const products = await db.select().from(contentProducts).orderBy(desc(contentProducts.updatedAt)).limit(300);
  const filteredProducts = products.filter((p) => {
    const ch = (p as unknown as { channel: string }).channel;
    if (!isPrivileged && allowedChannels.length > 0 && !allowedChannels.includes(ch)) return false;
    return true;
  });
  const productById = new Map(filteredProducts.map((p) => [(p as unknown as { id: string }).id, p] as const));

  const partRows = await db.select().from(contentParts).orderBy(contentParts.partNumber).limit(2000);
  const filteredParts = partRows.filter((part) => productById.has((part as unknown as { productId: string }).productId));

  const partIds = filteredParts.map((p) => (p as unknown as { id: string }).id);
  const assetRows =
    partIds.length > 0
      ? await db.select().from(contentPartAssets).where((await import("drizzle-orm")).inArray(contentPartAssets.partId, partIds)).limit(2000)
      : [];

  const fileOf = (id: string, filename: string, type: string, ref: string, mime: string, createdAt: Date, partId?: string): LibraryFileItem => ({
    id,
    filename,
    type,
    playbackUrl: buildUrl(buildToken(ref, mime)),
    fileId: ref,
    createdAt: createdAt.toISOString(),
    partId,
  });

  // Build per-part file buckets
  const partsByProduct = new Map<string, LibraryPartNode[]>();
  for (const part of filteredParts) {
    const p = part as unknown as { id: string; partNumber: number; productId: string; fileRef: string | null; coverFileRef: string | null; createdAt: Date };
    const prod = productById.get(p.productId) as unknown as { title: string; channel: string } | undefined;
    const baseTitle = prod?.title ?? "";
    const node: LibraryPartNode = {
      partId: p.id,
      partNumber: p.partNumber,
      fullVideo: isRealFileId(p.fileRef) ? fileOf(`${p.id}-full`, `${baseTitle} - قسمت ${p.partNumber} - ویدیو کامل`, "full_video", p.fileRef!, "video/mp4", p.createdAt, p.id) : null,
      highlights: [],
      reels: [],
      cover: isRealFileId(p.coverFileRef) ? fileOf(`${p.id}-cover`, `${baseTitle} - قسمت ${p.partNumber} - کاور`, "cover", p.coverFileRef!, "image/jpeg", p.createdAt, p.id) : null,
    };
    for (const asset of assetRows as unknown as Array<{ id: string; partId: string; kind: string; fileRef: string; fileName: string | null; createdAt: Date }>) {
      if (asset.partId !== p.id || !isRealFileId(asset.fileRef)) continue;
      const type = asset.kind === "highlight" ? "highlight" : "reel";
      const item = fileOf(asset.id, asset.fileName ?? `${baseTitle} - قسمت ${p.partNumber} - ${type === "highlight" ? "برش" : "ریلز"}`, type, asset.fileRef, "video/mp4", asset.createdAt, p.id);
      if (type === "highlight") node.highlights.push(item);
      else node.reels.push(item);
    }
    const list = partsByProduct.get(p.productId) ?? [];
    list.push(node);
    partsByProduct.set(p.productId, list);
  }

  // Group by channel
  const channelMap = new Map<string, LibraryChannelNode>();
  for (const prod of filteredProducts) {
    const pr = prod as unknown as { id: string; title: string; channel: string; status: string };
    let ch = channelMap.get(pr.channel);
    if (!ch) {
      ch = { channel: pr.channel, label: getChannelLabelFa(pr.channel), products: [] };
      channelMap.set(pr.channel, ch);
    }
    const parts = partsByProduct.get(pr.id) ?? [];
    ch.products.push({
      productId: pr.id,
      title: pr.title,
      status: pr.status,
      // products without parts keep their files directly (currently none, kept for forward-compat)
      files: [],
      parts: parts.sort((a, b) => a.partNumber - b.partNumber),
    });
  }

  const channels = [...channelMap.values()];

  // Unlinked recent group videos (no channel/product home) — root level "group"
  const group: Array<LibraryFileItem & { messageId: string }> = [];
  try {
    const { eq } = await import("drizzle-orm");
    const recentGroup = await db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.action, "group_video_replied"))
      .orderBy(desc(workflowEvents.createdAt))
      .limit(20);
    const groupId = process.env.TELEGRAM_GROUP_ID || "-1002326782937";
    const chatIdForLink = groupId.replace("-100", "");
    for (const ev of recentGroup as unknown as Array<{ after: Record<string, unknown>; createdAt: Date; entityId: string }>) {
      const after = ev.after ?? {};
      const fileId = (after.fileId as string) || (after.file_id as string) || "";
      if (!isRealFileId(fileId)) continue;
      const messageId = String(ev.entityId ?? after.messageId ?? "");
      group.push({
        id: `group-${messageId}`,
        filename: `ویدیوی گروه — پیام ${messageId}`,
        type: "full_video",
        playbackUrl: buildUrl(buildToken(fileId, "video/mp4")),
        fileId,
        createdAt: ev.createdAt.toISOString(),
        telegramLink: `https://t.me/c/${chatIdForLink}/${messageId}`,
        messageId,
      });
    }
  } catch {}

  // best-effort mirror enrichment (never fails the listing)
  try {
    const { getMirrorUrlsByFile } = await import("@/lib/mirrors/store");
    const collect = (items: Array<{ fileId?: string | null }>): string[] =>
      items.map((i) => i.fileId).filter((f): f is string => !!f);
    const allItems = [...channels.flatMap((c) => c.products.flatMap((p) => p.parts.flatMap((part) => [
      ...(part.fullVideo ? [part.fullVideo] : []),
      ...part.highlights,
      ...part.reels,
    ]))), ...group];
    const mirrors = await getMirrorUrlsByFile(collect(allItems));
    const withUrls = new Map(attachMirrorUrls(allItems, mirrors).map((i) => [i.id, i.mirrorUrl ?? null]));
    const apply = (item: { id: string; mirrorUrl?: string | null }) => {
      item.mirrorUrl = withUrls.get(item.id) ?? null;
    };
    for (const ch of channels) {
      for (const prod of ch.products) {
        for (const part of prod.parts) {
          if (part.fullVideo) apply(part.fullVideo);
          for (const h of part.highlights) apply(h);
          for (const r of part.reels) apply(r);
        }
      }
    }
    for (const g of group) apply(g);
  } catch {}

  return jsonOk({ channels, group } satisfies LibraryTreeResponse);
}
