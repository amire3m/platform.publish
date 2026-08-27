import { jsonError, requirePermission } from "@/lib/api-helpers";
import { get360pUrl } from "@/lib/youtube/proxy";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const { user, response } = await requirePermission("view_analytics");
  if (!user) return response!;

  const { videoId } = await params;
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return jsonError("شناسه ویدیو نامعتبر است.", 400);
  }

  let url: string;
  try {
    url = await get360pUrl(videoId);
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (msg.includes("360") || msg.includes("۳۶۰")) {
      return jsonError("کیفیت ۳۶۰ موجود نیست.", 502);
    }
    return jsonError("ویدیو در دسترس نیست.", 404);
  }

  try {
    const range = req.headers.get("range");
    const upstream = await fetch(url, range ? { headers: { Range: range } } : undefined);
    if (!upstream.ok || !upstream.body) {
      return jsonError("ویدیو در دسترس نیست.", 404);
    }
    const headers = new Headers(upstream.headers);
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Accept-Ranges", "bytes");
    // Ensure content-type is preserved; ytdl mp4 should be video/mp4
    if (!headers.has("content-type")) {
      headers.set("content-type", "video/mp4");
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return jsonError("ویدیو در دسترس نیست.", 404);
  }
}
