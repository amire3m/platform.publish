// Shared live-session start used by both the panel API and the Telegram conductor.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, liveChannels, liveSessions } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { generateEntityId } from "@/lib/ids";
import { getStreamer } from "./playlist-streamer";
import { normalizePlaylistUrl } from "./yt-dlp";

export interface StartFromChannelOptions {
  channelId: string;
  playlistInput: string;
  quality?: "720" | "1080";
  loop?: boolean;
  overlayEnabled?: boolean;
  scheduleRef?: string;
}

export interface StartFromChannelResult {
  sessionId: string;
}

export async function loadLiveOverlayConfig(): Promise<{ logoPath: string; position: "top-left" | "top-right" | "bottom-left" | "bottom-right"; opacity: number } | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  const live = (row?.capabilityConfig as Record<string, unknown> | undefined)?.live as
    | { logoPath?: string; position?: string; opacity?: number }
    | undefined;
  if (!live?.logoPath) return null;
  const positions = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
  const position = positions.includes(live.position as never) ? (live.position as (typeof positions)[number]) : "top-right";
  return { logoPath: live.logoPath, position, opacity: Math.min(1, Math.max(0, live.opacity ?? 0.8)) };
}

/** Start a live session from a saved channel profile. Throws Persian errors on failure. */
export async function startLiveFromChannel(opts: StartFromChannelOptions): Promise<StartFromChannelResult> {
  const [channel] = await db.select().from(liveChannels).where(eq(liveChannels.id, opts.channelId)).limit(1);
  if (!channel || !channel.isActive) throw new Error("کانال فعال پیدا نشد.");
  const streamKey = decryptSecret(channel.streamKeyEncrypted);
  const quality = opts.quality ?? "720";
  const loop = opts.loop ?? true;
  const overlayEnabled = opts.overlayEnabled === true && quality === "720";
  const overlay = overlayEnabled ? await loadLiveOverlayConfig() : null;
  if (opts.overlayEnabled && !overlay) throw new Error("لوگو در تنظیمات پیکربندی نشده است.");

  const playlist = normalizePlaylistUrl(opts.playlistInput);
  const sessionId = generateEntityId("LSE");
  await db.insert(liveSessions).values({
    id: sessionId,
    scheduleRef: opts.scheduleRef ?? null,
    channelRef: channel.id,
    playlistInput: playlist,
    quality,
    loop,
    overlayEnabled,
    trigger: "manual",
    state: "live",
    startedAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    await getStreamer().start({
      playlistInput: playlist,
      rtmpUrl: channel.rtmpUrl,
      streamKey,
      quality,
      loop,
      sessionId,
      overlayEnabled,
      overlay,
      channelRef: channel.id,
      scheduleRef: opts.scheduleRef,
    });
    return { sessionId };
  } catch (err) {
    await db
      .update(liveSessions)
      .set({ state: "error", error: err instanceof Error ? err.message : null, finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(liveSessions.id, sessionId))
      .catch(() => {});
    throw err;
  }
}
