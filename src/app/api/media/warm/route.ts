import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { TelegramClient } from "@/lib/telegram/client";

export const runtime = "nodejs";

/** Populate the local Bot API cache for a file (prepare-to-play). Never writes app state. */
export async function POST(request: Request): Promise<Response> {
  const { user, response } = await requirePermission("view_content_room");
  if (!user) return response!;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const fileId = (body as { fileId?: unknown })?.fileId;
  if (typeof fileId !== "string" || !fileId || fileId.startsWith("tg_msg_")) {
    return jsonError("شناسه فایل معتبر نیست.", 422, "VALIDATION_ERROR");
  }
  try {
    const client = TelegramClient.fromEnv();
    // Single-byte range: warms the Bot API cache without pulling the whole
    // file into this process's RAM.
    const upstream = await client.downloadFileResponse(fileId, "bytes=0-0");
    await upstream.body?.cancel().catch(() => {});
    return jsonOk({ warmed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "خطای نامشخص";
    return jsonError(`آماده‌سازی ناموفق بود: ${message.slice(0, 200)}`, 502, "WARM_FAILED");
  }
}
