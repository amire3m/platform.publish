import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { addTag } from "@/lib/assets/repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("view_assets");
  if (!user) return response!;
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 400, "INVALID_JSON");
  }
  const tag = (body as { tag?: string })?.tag?.trim();
  if (!tag) return jsonError("برچسب الزامی است.", 422, "VALIDATION_ERROR");
  if (tag.length > 30) return jsonError("برچسب نباید بیش از ۳۰ کاراکتر باشد.", 422, "VALIDATION_ERROR");
  try {
    const updated = await addTag(id, tag);
    return jsonOk(updated);
  } catch (err) {
    const msg = (err as Error).message ?? "خطای سرور";
    if (msg.includes("یافت نشد")) return jsonError(msg, 404, "NOT_FOUND");
    return jsonError(msg, 400);
  }
}
