import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contentPartAssets, contentParts } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildPlaybackUrl, isRealFileId } from "@/lib/media/playback-token";

export interface PartCoverOption {
  fileRef: string;
  label: string;
  targetKind: string | null;
  isMain: boolean;
  previewUrl: string | null;
}

/** All cover options per part: main part cover + targeted cover assets. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
  };
  if (!hasPermission(subject, "manage_content_room") && !hasPermission(subject, "view_content_room")) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }
  const { id: productId } = await ctx.params;
  try {
    const parts = (await db.select().from(contentParts).where(eq(contentParts.productId, productId))) as unknown as Array<{
      id: string;
      partNumber: number;
      coverFileRef: string | null;
    }>;
    const partIds = parts.map((p) => p.id);
    const assets = partIds.length
      ? ((await db
          .select()
          .from(contentPartAssets)
          .where(and(inArray(contentPartAssets.partId, partIds), eq(contentPartAssets.kind, "cover")))) as unknown as Array<{
          partId: string;
          fileRef: string;
          fileName: string | null;
          targetKind: string | null;
          bundleId: string | null;
          partTotal: number | null;
        }>)
      : [];
    const targetLabel = (t: string | null): string => {
      if (t === "youtube_full") return "کاور ویدیوی کامل";
      if (t === "highlight") return "کاور برش";
      if (t === "reel") return "کاور ریلز";
      return "کاور بدون هدف مشخص";
    };
    const byPart: Record<string, PartCoverOption[]> = {};
    for (const p of parts) {
      const opts: PartCoverOption[] = [];
      if (p.coverFileRef) {
        opts.push({
          fileRef: p.coverFileRef,
          label: "کاور اصلی قسمت",
          targetKind: null,
          isMain: true,
          previewUrl: isRealFileId(p.coverFileRef) ? buildPlaybackUrl(p.coverFileRef, "image/jpeg") : null,
        });
      }
      const seenBundles = new Set<string>();
      for (const a of assets.filter((x) => x.partId === p.id)) {
        if (a.bundleId) {
          if (seenBundles.has(a.bundleId)) continue;
          seenBundles.add(a.bundleId);
          const marker = `bundle:${a.bundleId}`;
          opts.push({
            fileRef: marker,
            label: `${targetLabel(a.targetKind)} — چندپارچه (${a.partTotal ?? "?"} پارت)`,
            targetKind: a.targetKind,
            isMain: false,
            previewUrl: buildPlaybackUrl(marker, "image/jpeg"),
          });
          continue;
        }
        opts.push({
          fileRef: a.fileRef,
          label: `${targetLabel(a.targetKind)}${a.fileName ? ` — ${a.fileName}` : ""}`,
          targetKind: a.targetKind,
          isMain: false,
          previewUrl: isRealFileId(a.fileRef) ? buildPlaybackUrl(a.fileRef, "image/jpeg") : null,
        });
      }
      byPart[p.id] = opts;
    }
    return jsonOk({ covers: byPart });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/products covers GET");
  }
}
