import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentProducts, contentPartAssets, workflowEvents } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
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

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const allowedChannels = (user as unknown as { allowedChannels?: string[] }).allowedChannels ?? [];
  const role = (user as unknown as { role?: string }).role ?? "viewer";
  const isPrivileged = ["owner", "manager", "admin"].includes(role) || allowedChannels.length === 0;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.toLowerCase().trim() ?? "";
  const typeFilter = url.searchParams.get("type") ?? "";
  const channelFilter = url.searchParams.get("channel") ?? "";

  // fetch products with channel filter and permission
  const products = await db.select().from(contentProducts).orderBy(desc(contentProducts.createdAt)).limit(200);
  const filteredProducts = products.filter((p) => {
    const ch = (p as unknown as { channel: string }).channel;
    if (channelFilter && ch !== channelFilter) return false;
    if (!isPrivileged && allowedChannels.length > 0 && !allowedChannels.includes(ch)) return false;
    if (q && !(p as unknown as { title: string }).title?.toLowerCase().includes(q)) return false;
    return true;
  });
  const productIds = new Set(filteredProducts.map((p) => (p as unknown as { id: string }).id));
  const productById = new Map(filteredProducts.map((p) => [(p as unknown as { id: string }).id, p] as const));

  const partRows = await db.select().from(contentParts).orderBy(desc(contentParts.createdAt)).limit(500);
  const filteredParts = partRows.filter((part) => {
    const pid = (part as unknown as { productId: string }).productId;
    return productIds.has(pid);
  });

  const partIds = filteredParts.map((p) => (p as unknown as { id: string }).id);
  let assetRows: typeof contentPartAssets.$inferSelect[] = [];
  if (partIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    assetRows = await db.select().from(contentPartAssets).where(inArray(contentPartAssets.partId, partIds)).limit(500);
  }

  const items: Array<Record<string, unknown>> = [];
  for (const part of filteredParts) {
    const prod = productById.get((part as unknown as { productId: string }).productId) as unknown as { channel: string; title: string } | undefined;
    const channel = prod?.channel ?? "";
    const baseTitle = prod?.title ?? "";
    const p = part as unknown as { id: string; partNumber: number; fileRef: string | null; coverFileRef: string | null; createdAt: Date };
    const isRealFileId = (v: string | null) => !!v && !v.startsWith("tg_msg_") && !v.startsWith("sample_");
    if (isRealFileId(p.fileRef) && (!typeFilter || typeFilter === "video")) {
      const token = buildToken(p.fileRef!, "video/mp4");
      items.push({ id: `${p.id}-video`, filename: `${baseTitle} - قسمت ${p.partNumber} - ویدئو`, type: "video", channel, channelLabel: channel, size: 0, createdAt: p.createdAt, playbackUrl: buildUrl(token), source: "part", partId: p.id });
    }
    if (isRealFileId(p.coverFileRef) && (!typeFilter || typeFilter === "cover")) {
      const token = buildToken(p.coverFileRef!, "image/jpeg");
      items.push({ id: `${p.id}-cover`, filename: `${baseTitle} - قسمت ${p.partNumber} - کاور`, type: "cover", channel, size: 0, createdAt: p.createdAt, playbackUrl: buildUrl(token), source: "part", partId: p.id });
    }
  }
  for (const asset of assetRows) {
    const a = asset as unknown as { id: string; partId: string; kind: string; fileRef: string; fileName: string | null; createdAt: Date };
    if (!a.fileRef || a.fileRef.startsWith("tg_msg_") || a.fileRef.startsWith("sample_")) continue;
    const part = filteredParts.find((p) => (p as unknown as { id: string }).id === a.partId) as unknown as { partNumber: number } | undefined;
    const prod = part ? productById.get((filteredParts.find((p)=> (p as unknown as {id:string}).id===a.partId) as unknown as {productId:string})?.productId) as unknown as { channel: string; title: string } | undefined : undefined;
    const channel = prod?.channel ?? "";
    const type = a.kind === "highlight" ? "برش" : "ریلز";
    if (typeFilter && typeFilter !== a.kind && typeFilter !== type) continue;
    if (q && !((a.fileName ?? "").toLowerCase().includes(q) || type.includes(q))) continue;
    const token = buildToken(a.fileRef, "video/mp4");
    const partNum = part?.partNumber ?? "";
    const baseTitle = prod?.title ?? "";
    items.push({ id: a.id, filename: a.fileName ?? `${baseTitle} - قسمت ${partNum} - ${type}`, type, kind: a.kind, channel, size: 0, createdAt: a.createdAt, playbackUrl: buildUrl(token), source: "asset", partId: a.partId, fileRef: a.fileRef });
  }

  // also include recent group videos not yet linked (so library never empty)
  try {
    const recentGroup = await db
      .select()
      .from(workflowEvents)
      .where(eq(workflowEvents.action, "group_video_replied"))
      .orderBy(desc(workflowEvents.createdAt))
      .limit(20);
    for (const ev of recentGroup) {
      const after = (ev as unknown as { after: Record<string, unknown> }).after ?? {};
      const fileId = (after.fileId as string) || (after.file_id as string) || "";
      if (!fileId || fileId.startsWith("tg_msg_") || fileId.startsWith("sample_")) continue;
      const messageId = String((ev as unknown as { entityId: string }).entityId ?? after.messageId ?? "");
      if (typeFilter && typeFilter !== "video") continue;
      if (q && !messageId.includes(q)) continue;
      // avoid duplicate if already linked as asset (same fileId)
      if (items.some((it) => (it as Record<string, unknown>).fileRef === fileId)) continue;
      const token = buildToken(fileId, "video/mp4");
      items.push({
        id: `group-${messageId}`,
        filename: `ویدیوی گروه — پیام ${messageId}`,
        type: "video",
        channel: "",
        size: 0,
        createdAt: (ev as unknown as { createdAt: Date }).createdAt,
        playbackUrl: buildUrl(token),
        source: "group",
        messageId,
        fileRef: fileId,
      });
    }
  } catch {}

  items.sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
  return jsonOk({ items: items.slice(0, 100) });
}
