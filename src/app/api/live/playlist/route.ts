import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/permissions";
import { getStreamer } from "@/lib/live/playlist-streamer";
import { normalizePlaylistUrl } from "@/lib/live/yt-dlp";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_RTMP = "rtmp://a.rtmp.youtube.com/live2";

async function requireLivePermission() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") };
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
    allowedAccountIds: (user as unknown as { allowedAccountIds?: string[] }).allowedAccountIds ?? [],
  };
  const ok = hasPermission(subject, "manage_content_room" as Permission) || hasPermission(subject, "publish_now" as Permission);
  if (!ok) return { user: null, response: jsonError("شما مجوز مدیریت لایو را ندارید.", 403, "FORBIDDEN") };
  return { user, response: null };
}

export async function POST(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;

  const body = await req.json().catch(() => null) as {
    playlistInput?: string;
    rtmpUrl?: string;
    streamKey?: string;
    quality?: string;
    loop?: boolean;
  } | null;
  if (!body) return jsonError("درخواست نامعتبر است.", 400, "VALIDATION_ERROR");

  const playlistInput = typeof body.playlistInput === "string" ? body.playlistInput.trim() : "";
  const rtmpUrl = (typeof body.rtmpUrl === "string" && body.rtmpUrl.trim()) || DEFAULT_RTMP;
  const streamKey = typeof body.streamKey === "string" ? body.streamKey.trim() : "";
  const quality = body.quality === "720" ? "720" : "1080";

  if (!playlistInput) return jsonError("لینک یا شناسه پلی‌لیست الزامی است.", 422, "VALIDATION_ERROR");
  if (!streamKey) return jsonError("کلید استریم الزامی است.", 422, "VALIDATION_ERROR");
  if (!/^rtmps?:\/\//.test(rtmpUrl)) return jsonError("RTMP URL باید با rtmp:// شروع شود.", 422, "VALIDATION_ERROR");

  const streamer = getStreamer();
  try {
    await streamer.start({
      playlistInput: normalizePlaylistUrl(playlistInput),
      rtmpUrl,
      streamKey,
      quality,
      loop: body.loop ?? true,
    });
    return jsonOk(streamer.toPublic());
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "شروع لایو ناموفق بود.", 502, "LIVE_START_FAILED");
  }
}

export async function GET() {
  const { response } = await requireLivePermission();
  if (response) return response;
  return jsonOk(getStreamer().toPublic());
}
