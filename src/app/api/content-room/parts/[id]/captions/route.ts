import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getProviders } from "@/lib/captions/providers";
import { buildCaptionPrompt } from "@/lib/captions/transcribe";
import { getPartWithProduct, getTranscriptByPart, saveCaptions } from "@/lib/captions/store";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const u = user as unknown as { role?: string; allowedActions?: string[]; allowedAccountIds?: string[] };
  const subject = { role: u.role, allowedActions: u.allowedActions, allowedAccountIds: u.allowedAccountIds } as never;
  const allowed =
    hasPermission(subject, "manage_content_room" as never) || hasPermission(subject, "update_assigned_content" as never);
  if (!allowed) return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  try {
    const found = await getPartWithProduct(id);
    if (!found) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
    const row = await getTranscriptByPart(id);
    if (!row || !row.fullText.trim()) {
      return jsonError("ابتدا رونویسی قسمت را انجام دهید.", 422, "NO_TRANSCRIPT");
    }
    const { captions } = getProviders();
    const prompt = buildCaptionPrompt({ title: found.product.title, channel: found.product.channel, transcript: row.fullText });
    const result = await captions.generate({ title: found.product.title, channel: found.product.channel, transcript: row.fullText, prompt });
    await saveCaptions(id, { youtube: result.youtube, instagram: result.instagram }, result.model);
    return jsonOk({ youtube: result.youtube, instagram: result.instagram });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts/[id]/captions POST");
  }
}
