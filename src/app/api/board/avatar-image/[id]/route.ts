import { jsonError, requireUser } from "@/lib/api-helpers";
import { BOARD_CHANNELS } from "@/lib/board/channels";
import { fetchBoardChannelAvatar, resolveBoardChannelAccountId } from "@/lib/board/server-avatars";

/**
 * Same-origin proxy for YouTube channel avatars.
 * The browser never talks to Google directly, so the images load
 * wherever the panel itself loads. Browser-cached for a day.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response!;
  const { id } = await params;
  const channel = BOARD_CHANNELS.find((c) => c.id === id);
  if (!channel) return jsonError("کانال یافت نشد.", 404, "NOT_FOUND");

  const accountId = await resolveBoardChannelAccountId(id);
  if (!accountId) return jsonError("تصویری برای این کانال ثبت نشده است.", 404, "NO_AVATAR");
  const { url } = await fetchBoardChannelAvatar(accountId);
  if (!url) return jsonError("تصویری برای این کانال ثبت نشده است.", 404, "NO_AVATAR");

  const upstream = await fetch(url);
  if (!upstream.ok) return jsonError("دریافت تصویر ناموفق بود.", 502, "UPSTREAM_ERROR");
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length === 0) return jsonError("دریافت تصویر ناموفق بود.", 502, "UPSTREAM_ERROR");
  return new Response(buf, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
      "Content-Length": String(buf.length),
    },
  });
}
