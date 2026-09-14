import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildSrt, type TranscriptSegment } from "@/lib/captions/srt";
import { getTranscriptByPart, saveEditedText } from "@/lib/captions/store";

export const runtime = "nodejs";

async function canEdit(): Promise<{ ok: boolean; response?: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") };
  const u = user as unknown as { role?: string; allowedActions?: string[]; allowedAccountIds?: string[] };
  const subject = { role: u.role, allowedActions: u.allowedActions, allowedAccountIds: u.allowedAccountIds } as never;
  const allowed =
    hasPermission(subject, "manage_content_room" as never) || hasPermission(subject, "update_assigned_content" as never);
  if (!allowed) return { ok: false, response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
  return { ok: true };
}

function resplitEvenly(text: string, totalSec: number, blocks: number): TranscriptSegment[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || blocks <= 0 || totalSec <= 0) return [{ start: 0, end: Math.max(0, totalSec), text }];
  const per = Math.ceil(words.length / blocks);
  const out: TranscriptSegment[] = [];
  for (let i = 0; i < blocks; i++) {
    const slice = words.slice(i * per, (i + 1) * per);
    if (!slice.length) break;
    out.push({ start: (totalSec * i) / blocks, end: (totalSec * (i + 1)) / blocks, text: slice.join(" ") });
  }
  return out;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const { user, response } = await requirePermission("view_content_room");
  if (!user) return response!;
  try {
    const row = await getTranscriptByPart(id);
    if (!row) return jsonOk({ status: "none" });
    return jsonOk({
      status: row.status,
      text: row.fullText,
      segments: row.segments,
      srt: row.srtText,
      captions: row.captions,
      version: row.version,
      error: row.error,
      sttModel: row.sttModel,
      llmModel: row.llmModel,
    });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts/[id]/transcript GET");
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const gate = await canEdit();
  if (!gate.ok) return gate.response!;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const text = (body as { text?: unknown })?.text;
  const expectedVersion = (body as { expectedVersion?: unknown })?.expectedVersion;
  if (typeof text !== "string" || text.length > 100000) {
    return jsonError("متن نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    return jsonError("نسخه رکورد الزامی است.", 422, "VALIDATION_ERROR");
  }
  try {
    const existing = await getTranscriptByPart(id);
    if (!existing) return jsonError("رونوشت یافت نشد.", 404, "NOT_FOUND");
    const totalSec = existing.durationSec ?? existing.segments[existing.segments.length - 1]?.end ?? 0;
    const blocks = Math.max(1, existing.segments.length);
    const srt = buildSrt(resplitEvenly(text, totalSec, blocks));
    const updated = await saveEditedText(id, text, srt, expectedVersion);
    return jsonOk({ text: updated.fullText, srt: updated.srtText, version: updated.version });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "VERSION_CONFLICT") return jsonError("نسخه قدیمی است.", 409, "VERSION_CONFLICT");
    if (code === "NOT_FOUND") return jsonError("رونوشت یافت نشد.", 404, "NOT_FOUND");
    return jsonInternalError(error, "api/content-room/parts/[id]/transcript PATCH");
  }
}
