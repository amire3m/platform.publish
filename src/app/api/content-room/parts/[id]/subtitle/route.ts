import { jsonError, jsonInternalError, requirePermission } from "@/lib/api-helpers";
import { getPartWithProduct, getTranscriptByPart } from "@/lib/captions/store";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const { user, response } = await requirePermission("view_content_room");
  if (!user) return response!;
  try {
    const found = await getPartWithProduct(id);
    if (!found) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
    const row = await getTranscriptByPart(id);
    if (!row || !row.srtText) return jsonError("زیرنویس یافت نشد.", 404, "NOT_FOUND");
    return new Response(row.srtText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="part-${found.part.partNumber}.srt"`,
      },
    });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts/[id]/subtitle GET");
  }
}
