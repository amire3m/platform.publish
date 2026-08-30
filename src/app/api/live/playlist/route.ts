import { eq } from "drizzle-orm";
import { db } from "@/db";
import { liveChannels, liveSessions } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { generateEntityId } from "@/lib/ids";
import { requireLivePermission } from "@/lib/live/perm";
import { getStreamer } from "@/lib/live/playlist-streamer";
import { normalizePlaylistUrl } from "@/lib/live/yt-dlp";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_RTMP = "rtmp://a.rtmp.youtube.com/live2";

async function loadOverlayConfig(): Promise<{ logoPath: string; position: "top-left" | "top-right" | "bottom-left" | "bottom-right"; opacity: number } | null> {
  const { appSettings } = await import("@/db/schema");
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const live = (row?.capabilityConfig as Record<string, unknown> | undefined)?.live as
    | { logoPath?: string; position?: string; opacity?: number }
    | undefined;
  if (!live?.logoPath) return null;
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
  const position = positions.includes(live.position as never) ? (live.position as (typeof positions)[number]) : "top-right";
  return { logoPath: live.logoPath, position, opacity: Math.min(1, Math.max(0, live.opacity ?? 0.8)) };
}

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

  // Resolve RTMP target: saved channel profile or legacy raw key.
  let rtmpUrl = DEFAULT_RTMP;
  let streamKey = "";
  let channelRef: string | null = null;
  if (body.channelRef) {
    const [channel] = await db.select().from(liveChannels).where(eq(liveChannels.id, body.channelRef)).limit(1);
    if (!channel || !channel.isActive) return jsonError("کانال انتخاب‌شده پیدا نشد یا غیرفعال است.", 422, "VALIDATION_ERROR");
    rtmpUrl = channel.rtmpUrl;
    streamKey = decryptSecret(channel.streamKeyEncrypted);
    channelRef = channel.id;
  } else {
    rtmpUrl = (typeof body.rtmpUrl === "string" && body.rtmpUrl.trim()) || DEFAULT_RTMP;
    streamKey = typeof body.streamKey === "string" ? body.streamKey.trim() : "";
    if (!streamKey) return jsonError("کلید استریم یا کانال ذخیره‌شده الزامی است.", 422, "VALIDATION_ERROR");
  }
  if (!/^rtmps?:\/\//.test(rtmpUrl)) return jsonError("RTMP URL باید با rtmp:// شروع شود.", 422, "VALIDATION_ERROR");

  const overlayEnabled = body.overlayEnabled === true;
  const overlay = overlayEnabled ? await loadOverlayConfig() : null;
  if (overlayEnabled && !overlay) {
    return jsonError("لوگو در تنظیمات پیکربندی نشده است.", 422, "VALIDATION_ERROR");
  }

  const sessionId = generateEntityId("LSE");
  await db.insert(liveSessions).values({
    id: sessionId,
    channelRef,
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
      channelRef: channelRef ?? undefined,
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
