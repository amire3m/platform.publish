import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { contentParts, contentPartAssets } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const [part] = await db.select().from(contentParts).where(eq(contentParts.id, id)).limit(1);
  if (!part) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
  const rows = await db.select().from(contentPartAssets).where(eq(contentPartAssets.partId, id)).orderBy(asc(contentPartAssets.createdAt));
  return jsonOk({ assets: rows });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
    allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
  };
  if (!hasPermission(subject, "manage_content_room") && !hasPermission(subject, "update_assigned_content")) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }
  const url = new URL(req.url);
  const assetId = url.searchParams.get("assetId");
  if (!assetId) return jsonError("شناسه فایل الزامی است.", 400, "VALIDATION_ERROR");
  const [asset] = await db.select().from(contentPartAssets).where(eq(contentPartAssets.id, assetId)).limit(1);
  if (!asset || (asset as unknown as { partId: string }).partId !== id) return jsonError("فایل یافت نشد.", 404, "NOT_FOUND");
  await db.delete(contentPartAssets).where(eq(contentPartAssets.id, assetId));
  return jsonOk({ ok: true });
}
