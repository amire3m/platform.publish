import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { getAsset } from "@/lib/assets/repository";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("view_assets");
  if (!user) return response!;
  const { id } = await ctx.params;
  try {
    const asset = await getAsset(id);
    if (!asset) return jsonError("دارایی یافت نشد.", 404, "NOT_FOUND");
    return jsonOk(asset);
  } catch (err) {
    return jsonError((err as Error).message ?? "خطای سرور", 500);
  }
}
