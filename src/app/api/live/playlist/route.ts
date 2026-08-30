import { db } from "@/db";
import { liveSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { generateEntityId } from "@/lib/ids";
import { requireLivePermission } from "@/lib/live/perm";
import { getStreamer } from "@/lib/live/playlist-streamer";
import { normalizePlaylistUrl } from "@/lib/live/yt-dlp";
import { startLiveFromChannel, loadLiveOverlayConfig } from "@/lib/live/start";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { response } = await requireLivePermission();
  if (response) return response;

  const body = (await req.json().catch(() => null)) as {
    playlistInput?: string;
    channelRef?: string;
    rtmpUrl?: string;
    streamKey?: string;
    quality?: string;
    loop?: boolean;
    overlayEnabled?: boolean;
  } | null;
  if (!body) return jsonError("درخواست نامعتبر است.", 400, "VALIDATION_ERROR");

  const playlistInput = typeof body.playlistInput === "string" ? body.playlistInput.trim() : "";
  const quality = body.quality === "1080" ? "1080" : "720";
  if (!playlistInput) return jsonError("لینک یا شناسه پلی‌لیست الزامی است.", 422, "VALIDATION_ERROR");

  // Channel-based start (shared with the Telegram conductor)
  if (body.channelRef) {
    try {
      await startLiveFromChannel({
        channelId: body.channelRef,
        playlistInput,
        quality,
        loop: body.loop ?? true,
        overlayEnabled: body.overlayEnabled === true,
      });
      return jsonOk(getStreamer().toPublic());
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "شروع لایو ناموفق بود.", 502, "LIVE_START_FAILED");
    }
  }

  // Legacy raw-key start
  const DEFAULT_RTMP = "rtmp://a.rtmp.youtube.com/live2";
  const rtmpUrl = (typeof body.rtmpUrl === "string" && body.rtmpUrl.trim()) || DEFAULT_RTMP;
  const streamKey = typeof body.streamKey === "string" ? body.streamKey.trim() : "";
  if (!streamKey) return jsonError("کلید استریم یا کانال ذخیره‌شده الزامی است.", 422, "VALIDATION_ERROR");
  if (!/^rtmps?:\/\//.test(rtmpUrl)) return jsonError("RTMP URL باید با rtmp:// شروع شود.", 422, "VALIDATION_ERROR");

  const overlayEnabled = body.overlayEnabled === true;
  const overlay = overlayEnabled ? await loadLiveOverlayConfig() : null;
  if (overlayEnabled && !overlay) {
    return jsonError("لوگو در تنظیمات پیکربندی نشده است.", 422, "VALIDATION_ERROR");
  }

  const sessionId = generateEntityId("LSE");
  await db.insert(liveSessions).values({
    id: sessionId,
    channelRef: null,
    playlistInput: normalizePlaylistUrl(playlistInput),
    quality,
    loop: body.loop ?? true,
    overlayEnabled,
    trigger: "manual",
    state: "live",
    startedAt: new Date(),
    updatedAt: new Date(),
  });

  const streamer = getStreamer();
  try {
    await streamer.start({
      playlistInput: normalizePlaylistUrl(playlistInput),
      rtmpUrl,
      streamKey,
      quality,
      loop: body.loop ?? true,
      sessionId,
      overlayEnabled,
      overlay,
    });
    return jsonOk(streamer.toPublic());
  } catch (err) {
    await db
      .update(liveSessions)
      .set({ state: "error", error: err instanceof Error ? err.message : null, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId))
      .catch(() => {});
    return jsonError(err instanceof Error ? err.message : "شروع لایو ناموفق بود.", 502, "LIVE_START_FAILED");
  }
}

export async function GET() {
  const { response } = await requireLivePermission();
  if (response) return response;
  return jsonOk(getStreamer().toPublic());
}
