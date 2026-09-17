import { desc } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentProducts, mediaMirrors } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { summarizeMirrors } from "@/lib/mirrors/status";
import type { MirrorRow } from "@/lib/mirrors/store";

export const dynamic = "force-dynamic";

export interface MirrorListItem extends MirrorRow {
  productTitle: string | null;
  updatedAt: string | null;
}

/** Mirror status list with product titles (best-effort enrichment, never fails auth). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");

  const status = new URL(req.url).searchParams.get("status") ?? "";
  const rows = (await db
    .select()
    .from(mediaMirrors)
    .orderBy(desc(mediaMirrors.updatedAt))
    .limit(200)) as unknown as Array<Record<string, unknown>>;

  const items: MirrorListItem[] = rows.map((r) => ({
    id: String(r.id ?? ""),
    partId: (r.partId ?? r.part_id ?? null) as string | null,
    fileId: String(r.fileId ?? r.file_id ?? ""),
    provider: String(r.provider ?? "vids.st"),
    remoteId: (r.remoteId ?? r.remote_id ?? null) as string | null,
    remoteTaskId: (r.remoteTaskId ?? r.remote_task_id ?? null) as string | null,
    remoteUrl: (r.remoteUrl ?? r.remote_url ?? null) as string | null,
    status: ((r.status as MirrorRow["status"]) ?? "queued") as MirrorRow["status"],
    error: (r.error ?? null) as string | null,
    productTitle: null,
    updatedAt: r.updatedAt instanceof Date ? (r.updatedAt as Date).toISOString() : (r.updated_at instanceof Date ? (r.updated_at as Date).toISOString() : null),
  }));

  // Best-effort product titles via parts (never fails the listing).
  try {
    const partIds = [...new Set(items.map((i) => i.partId).filter((p): p is string => !!p))];
    if (partIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const parts = (await db.select().from(contentParts).where(inArray(contentParts.id, partIds))) as unknown as Array<{ id: string; productId: string }>;
      const productIds = [...new Set(parts.map((p) => p.productId))];
      const products = productIds.length > 0
        ? ((await db.select().from(contentProducts).where(inArray(contentProducts.id, productIds))) as unknown as Array<{ id: string; title: string }>)
        : [];
      const productById = new Map(products.map((p) => [p.id, p.title]));
      const productByPart = new Map(parts.map((p) => [p.id, productById.get(p.productId) ?? null]));
      for (const item of items) {
        if (item.partId) item.productTitle = productByPart.get(item.partId) ?? null;
      }
    }
  } catch {}

  const filtered = status ? items.filter((i) => i.status === status) : items;
  return jsonOk({ items: filtered, counts: summarizeMirrors(items) });
}
