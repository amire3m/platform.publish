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
  let tone: string | undefined;
  try {
    const reqJson = await _request.json().catch(() => ({}));
    tone = (reqJson as Record<string, unknown>).tone as string | undefined;
  } catch {}
  try {
    const found = await getPartWithProduct(id);
    if (!found) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
    const row = await getTranscriptByPart(id);
    if (!row || !row.fullText.trim()) {
      return jsonError("ابتدا رونویسی قسمت را انجام دهید.", 422, "NO_TRANSCRIPT");
    }
    const { captions } = getProviders();
    const { detectTone } = await import("@/lib/captions/tone-detector");
    const { FA_HOOKS, POWER_WORDS_FA, pickFormula, hashtagsFa } = await import("@/lib/captions/formulas-fa");
    const effectiveTone = (tone as unknown as string) ?? detectTone(row.fullText);
    const formula = pickFormula(effectiveTone as never);
    const hookTpl = (FA_HOOKS[effectiveTone as never] ?? FA_HOOKS["صمیمی"])[0];
    const power = POWER_WORDS_FA.slice(0, 2).join("، ");
    const prompt = buildCaptionPrompt({ title: found.product.title, channel: found.product.channel, transcript: row.fullText }) + `\nلحن: ${effectiveTone}\nفرمول: ${formula.name} — ${formula.template}\nقلاب پیشنهادی: ${hookTpl}\nکلمات قدرتمند: ${power}\nهشتگ پیشنهادی: ${hashtagsFa(found.product.title).join(" ")}`;
    const result = await captions.generate({ title: found.product.title, channel: found.product.channel, transcript: row.fullText, prompt });
    await saveCaptions(id, { youtube: result.youtube, instagram: result.instagram }, result.model);
    return jsonOk({ youtube: result.youtube, instagram: result.instagram });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts/[id]/captions POST");
  }
}
