// Playlist live-streaming engine: sequential ffmpeg passthrough (no re-encode)
// of a YouTube playlist to an RTMP target. Single active session per server.
// Server-only module — spawns yt-dlp/ffmpeg, never import from client code.
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import {
  buildFfmpegArgs,
  buildM3u8Args,
  extractVideoId,
  fetchPlaylistItems,
  fetchStreamUrls,
  isM3u8Source,
  maskTarget,
  parseFfmpegTime,
  type LiveQuality,
  type PlaylistItem,
} from "./yt-dlp";
import { buildSceneArgs } from "./scene";

type FfmpegProcess = ChildProcessByStdio<null, Readable, Readable>;

export type LiveSessionState = "idle" | "starting" | "live" | "stopping" | "stopped" | "error";

export type QueueItemStatus = "pending" | "playing" | "done" | "failed" | "skipped";

export interface LiveQueueItem extends PlaylistItem {
  status: QueueItemStatus;
}

export interface LiveSession {
  state: LiveSessionState;
  quality: LiveQuality;
  loop: boolean;
  playlistInput: string;
  /** Full RTMP target including stream key — NEVER expose via API. */
  rtmpTarget: string;
  queue: LiveQueueItem[];
  currentIndex: number;
  startedAt: number | null;
  /** Seconds played of current item (from ffmpeg time=). */
  currentElapsedSec: number;
  error: string | null;
  finishedAt: number | null;
  /** DB row id (LSE-…) assigned by the API/conductor; null → no persistence. */
  sessionId: string | null;
  overlayEnabled: boolean;
  /** Legacy single-logo overlay (pre-scenes) — converted to a scene at spawn time. */
  overlay: import("./yt-dlp").OverlayConfig | null;
  /** Resolved graphics scene (Phase C) — wins over legacy overlay when present. */
  scene: import("./scene").Scene | null;
  scheduleRef: string | null;
  channelRef: string | null;
  /** "playlist" = YouTube queue, "m3u8" = single live/VOD HLS source. */
  sourceType: "playlist" | "m3u8";
  /** Active graphics scene name (Phase C). */
  sceneName: string | null;
}

export interface StartLiveOptions {
  playlistInput: string;
  rtmpUrl: string;
  streamKey: string;
  quality?: LiveQuality;
  loop?: boolean;
  maxItems?: number;
  sessionId?: string;
  overlayEnabled?: boolean;
  overlay?: import("./yt-dlp").OverlayConfig | null;
  scene?: import("./scene").Scene | null;
  scheduleRef?: string;
  channelRef?: string;
  sceneName?: string;
}

export interface LiveStreamerDeps {
  fetchItems: typeof fetchPlaylistItems;
  fetchUrls: typeof fetchStreamUrls;
  spawnFfmpeg: (
    inputs: string[],
    target: string,
    quality: LiveQuality,
    scene: import("./scene").Scene | null,
    sourceType?: "playlist" | "m3u8",
  ) => FfmpegProcess;
  now?: () => number;
  onEvent?: (action: string, detail: Record<string, unknown>) => void;
  fetchMeta?: (videoId: string) => Promise<PlaylistItem>;
  persist?: (session: LiveSession) => Promise<void>;
}

const NEXT_DELAY_MS = 1500;

class PlaylistStreamer {
  session: LiveSession | null = null;
  private proc: FfmpegProcess | null = null;
  private stopping = false;
  private deps: LiveStreamerDeps;

  constructor(deps?: Partial<LiveStreamerDeps>) {
    this.deps = {
      fetchItems: fetchPlaylistItems,
      fetchUrls: fetchStreamUrls,
      spawnFfmpeg: defaultSpawnFfmpeg,
      now: () => Date.now(),
      onEvent: logEventSafe,
      persist: persistSessionSnapshot,
      ...deps,
    };
  }

  isActive(): boolean {
    const s = this.session;
    return !!s && (s.state === "starting" || s.state === "live" || s.state === "stopping");
  }

  async start(opts: StartLiveOptions): Promise<LiveSession> {
    if (this.isActive()) throw new Error("یک جلسه لایو فعال وجود دارد؛ ابتدا آن را متوقف کنید.");
    const rtmpTarget = buildTarget(opts.rtmpUrl, opts.streamKey);
    if (!rtmpTarget) throw new Error("RTMP URL و کلید استریم الزامی است.");
    const sourceType = isM3u8Source(opts.playlistInput) ? "m3u8" : "playlist";
    const session: LiveSession = {
      state: "starting",
      quality: opts.quality ?? "720",
      // m3u8 sources never "end" → always reconnect via loop semantics.
      loop: sourceType === "m3u8" ? true : (opts.loop ?? true),
      playlistInput: opts.playlistInput,
      rtmpTarget,
      queue: [],
      currentIndex: -1,
      startedAt: Date.now(),
      currentElapsedSec: 0,
      error: null,
      finishedAt: null,
      sessionId: opts.sessionId ?? null,
      overlayEnabled: opts.overlayEnabled ?? false,
      overlay: opts.overlay ?? null,
      scene: opts.scene ?? null,
      scheduleRef: opts.scheduleRef ?? null,
      channelRef: opts.channelRef ?? null,
      sourceType,
      sceneName: opts.sceneName ?? null,
    };
    this.session = session;
    this.stopping = false;
    try {
      if (sourceType === "m3u8") {
        session.queue = [{ videoId: "m3u8", title: "منبع زنده HLS", durationSec: null, status: "pending" }];
      } else {
        const items = await this.deps.fetchItems(opts.playlistInput, opts.maxItems ?? 200);
        if (items.length === 0) throw new Error("پلی‌لیست خالی است یا پیدا نشد.");
        session.queue = items.map((it) => ({ ...it, status: "pending" as const }));
      }
      session.state = "live";
      this.deps.onEvent?.("live_started", { items: session.queue.length, quality: session.quality, sourceType, target: maskTarget(rtmpTarget) });
      void this.persistSafe();
      void this.runNext();
      return session;
    } catch (err) {
      session.state = "error";
      session.error = err instanceof Error ? err.message : "خطای نامشخص";
      session.finishedAt = Date.now();
      this.deps.onEvent?.("live_error", { stage: "start", error: session.error });
      throw err;
    }
  }

  private async runNext(): Promise<void> {
    const s = this.session;
    if (!s || this.stopping || s.state === "stopping" || s.state === "stopped") return;
    const nextIndex = s.currentIndex + 1;
    if (nextIndex >= s.queue.length) {
      if (s.loop && !this.stopping) {
        s.queue.forEach((q) => { q.status = "pending"; });
        s.currentIndex = -1;
        this.deps.onEvent?.("live_loop", { items: s.queue.length });
        void this.persistSafe();
        setTimeout(() => void this.runNext(), NEXT_DELAY_MS);
        return;
      }
      this.finish(null);
      return;
    }
    s.currentIndex = nextIndex;
    const item = s.queue[nextIndex];
    item.status = "playing";
    s.currentElapsedSec = 0;
    s.state = "live";
    void this.persistSafe();
    try {
      const scene = s.overlayEnabled ? (s.scene ?? overlayToScene(s.overlay)) : null;
      let inputs: string[];
      if (s.sourceType === "m3u8") {
        // Single HLS source — passed straight to ffmpeg (no yt-dlp extraction).
        inputs = [s.playlistInput];
      } else {
        const urls = await this.deps.fetchUrls(item.videoId, s.quality);
        if (this.stopping || s.state !== "live") return;
        inputs = urls.audioUrl ? [urls.videoUrl, urls.audioUrl] : [urls.videoUrl];
      }
      this.proc = this.deps.spawnFfmpeg(inputs, s.rtmpTarget, s.quality, scene, s.sourceType);
      this.proc.stderr.on("data", (chunk: Buffer) => {
        const t = parseFfmpegTime(chunk.toString());
        if (t !== null && this.session && this.session.queue[this.session.currentIndex] === item) {
          s.currentElapsedSec = t;
        }
      });
      this.proc.on("close", (code) => {
        this.proc = null;
        if (this.session !== s) return;
        if (item.status === "playing") item.status = code === 0 ? "done" : "failed";
        if (code !== 0 && code !== null && !this.stopping) {
          this.deps.onEvent?.("live_item_failed", { videoId: item.videoId, code });
        }
        void this.persistSafe();
        setTimeout(() => void this.runNext(), NEXT_DELAY_MS);
      });
      this.deps.onEvent?.("live_item_started", { videoId: item.videoId, title: item.title, index: nextIndex + 1 });
    } catch (err) {
      item.status = "failed";
      this.deps.onEvent?.("live_item_failed", { videoId: item.videoId, error: err instanceof Error ? err.message : "?" });
      void this.persistSafe();
      setTimeout(() => void this.runNext(), NEXT_DELAY_MS);
    }
  }

  skip(): boolean {
    const s = this.session;
    if (!s || !this.isActive() || !this.proc) return false;
    const item = s.queue[s.currentIndex];
    if (item) item.status = "skipped";
    this.proc.kill("SIGKILL");
    this.proc = null;
    this.deps.onEvent?.("live_item_skipped", { videoId: item?.videoId });
    setTimeout(() => void this.runNext(), 200);
    return true;
  }

  /** Append a single video (URL or id) to the end of the queue during playback. */
  async addItem(input: string): Promise<PlaylistItem> {
    const s = this.session;
    if (!s || !this.isActive()) throw new Error("جلسه لایو فعالی وجود ندارد.");
    const videoId = extractVideoId(input);
    if (!videoId) throw new Error("لینک یا شناسه ویدیو نامعتبر است.");
    if (s.queue.some((q) => q.videoId === videoId && (q.status === "pending" || q.status === "playing"))) {
      throw new Error("این ویدیو از قبل در صف است.");
    }
    const meta = await this.deps.fetchMeta?.(videoId);
    const item: LiveQueueItem = {
      videoId,
      title: meta?.title ?? videoId,
      durationSec: meta?.durationSec ?? null,
      status: "pending",
    };
    s.queue.push(item);
    this.deps.onEvent?.("live_queue_added", { videoId, title: item.title, queueLength: s.queue.length });
    void this.persistSafe();
    return item;
  }

  /** Remove a pending item by video id. Playing/done items cannot be removed. */
  removeItem(videoId: string): boolean {
    const s = this.session;
    if (!s) return false;
    const idx = s.queue.findIndex((q) => q.videoId === videoId);
    if (idx === -1 || s.queue[idx].status !== "pending" || idx <= s.currentIndex) return false;
    s.queue.splice(idx, 1);
    this.deps.onEvent?.("live_queue_removed", { videoId });
    void this.persistSafe();
    return true;
  }

  /** Move a pending item up (-1) or down (+1) within the pending range. */
  moveItem(videoId: string, dir: -1 | 1): boolean {
    const s = this.session;
    if (!s) return false;
    const idx = s.queue.findIndex((q) => q.videoId === videoId);
    if (idx === -1 || s.queue[idx].status !== "pending") return false;
    const target = idx + dir;
    if (target <= s.currentIndex || target >= s.queue.length) return false;
    if (s.queue[target].status !== "pending") return false;
    [s.queue[idx], s.queue[target]] = [s.queue[target], s.queue[idx]];
    void this.persistSafe();
    return true;
  }

  /** Re-queue a finished/failed/skipped item so it plays right after the current one. */
  replayItem(videoId: string): boolean {
    const s = this.session;
    if (!s || !this.isActive()) return false;
    const idx = s.queue.findIndex((q) => q.videoId === videoId);
    if (idx === -1 || idx === s.currentIndex) return false;
    const item = s.queue[idx];
    if (item.status !== "done" && item.status !== "failed" && item.status !== "skipped") return false;
    s.queue.splice(idx, 1);
    if (idx < s.currentIndex) s.currentIndex -= 1;
    item.status = "pending";
    s.queue.splice(s.currentIndex + 1, 0, item);
    this.deps.onEvent?.("live_queue_replayed", { videoId });
    void this.persistSafe();
    return true;
  }

  private persistSafe(): void {
    const s = this.session;
    if (!s?.sessionId || !this.deps.persist) return;
    void this.deps.persist(s).catch((err) => {
      console.error("[live] persist failed:", err instanceof Error ? err.message : err);
    });
  }

  /**
   * Switch the graphics scene mid-session.
   * m3u8 sources: instant (ffmpeg respawns on the live edge).
   * Playlist sources: applies from the next video (filter graph is fixed per spawn).
   */
  applyScene(scene: import("./scene").Scene): boolean {
    const s = this.session;
    if (!s || !this.isActive()) return false;
    s.scene = scene;
    s.sceneName = scene.name;
    this.deps.onEvent?.("live_scene_switched", { scene: scene.name, sourceType: s.sourceType, instant: s.sourceType === "m3u8" });
    if (s.sourceType === "m3u8" && this.proc) {
      this.proc.kill("SIGKILL");
      this.proc = null; // close handler → runNext replays the source with the new scene
    }
    void this.persistSafe();
    return true;
  }

  stop(reason = "manual"): boolean {
    const s = this.session;
    if (!s || !this.isActive()) return false;
    this.stopping = true;
    s.state = "stopping";
    if (this.proc) {
      this.proc.kill("SIGKILL");
      this.proc = null;
    }
    this.finish(reason);
    return true;
  }

  private finish(reason: string | null): void {
    const s = this.session;
    if (!s) return;
    s.state = reason === "manual" ? "stopped" : "stopped";
    s.finishedAt = Date.now();
    s.queue.forEach((q) => { if (q.status === "playing") q.status = "done"; });
    this.deps.onEvent?.("live_stopped", { reason: reason ?? "playlist_end", items: s.queue.length });
    this.stopping = false;
    void this.persistSafe();
  }

  /** Session safe for API exposure — stream key masked, no proc handles. */
  toPublic() {
    const s = this.session;
    if (!s) return { state: "idle" as const, queue: [], currentIndex: -1, currentElapsedSec: 0, rtmpTarget: null, error: null, sessionId: null, overlayEnabled: false, scheduleRef: null, channelRef: null, sourceType: "playlist" as const, elapsedTotalSec: 0, plannedTotalSec: 0, remainingSec: null as number | null, positionPct: null as number | null, nextItem: null as { title: string; startAtSec: number } | null, sceneName: null as string | null };
    const finished = s.queue.filter((q) => q.status === "done" || q.status === "failed" || q.status === "skipped");
    const elapsedTotalSec = Math.round(finished.reduce((a, q) => a + (q.durationSec ?? 0), 0) + (s.queue[s.currentIndex]?.status === "playing" ? s.currentElapsedSec : 0));
    const plannedTotalSec = Math.round(s.queue.reduce((a, q) => a + (q.durationSec ?? 0), 0));
    const next = s.queue[s.currentIndex + 1] ?? null;
    return {
      state: s.state,
      quality: s.quality,
      loop: s.loop,
      playlistInput: s.playlistInput,
      rtmpTarget: maskTarget(s.rtmpTarget),
      queue: s.queue.map((q) => ({ videoId: q.videoId, title: q.title, durationSec: q.durationSec, status: q.status })),
      currentIndex: s.currentIndex,
      currentElapsedSec: Math.round(s.currentElapsedSec),
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      error: s.error,
      isActive: this.isActive(),
      sessionId: s.sessionId,
      overlayEnabled: s.overlayEnabled,
      scheduleRef: s.scheduleRef,
      channelRef: s.channelRef,
      sourceType: s.sourceType,
      sceneName: s.sceneName,
      elapsedTotalSec,
      plannedTotalSec,
      remainingSec: plannedTotalSec > 0 ? Math.max(0, plannedTotalSec - elapsedTotalSec) : null,
      positionPct: plannedTotalSec > 0 ? Math.min(100, Math.round((elapsedTotalSec / plannedTotalSec) * 100)) : null,
      nextItem: next ? { title: next.title, startAtSec: elapsedTotalSec } : null,
    };
  }
}

function buildTarget(rtmpUrl: string, streamKey: string): string {
  const base = rtmpUrl.trim().replace(/\/+$/, "");
  const key = streamKey.trim();
  if (!base || !key) return "";
  return `${base}/${key}`;
}

function defaultSpawnFfmpeg(
  inputs: string[],
  target: string,
  quality: LiveQuality,
  scene: import("./scene").Scene | null,
  sourceType: "playlist" | "m3u8" = "playlist",
): FfmpegProcess {
  let args: string[];
  if (scene && scene.items.length > 0 && quality === "720") {
    args = buildSceneArgs(inputs, target, scene);
  } else if (sourceType === "m3u8") {
    args = buildM3u8Args(inputs[0], target, quality);
  } else {
    args = buildFfmpegArgs(inputs, target, quality);
  }
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume();
  child.on("error", (err) => {
    console.error("[live] ffmpeg spawn error:", err.message);
  });
  return child;
}

/** Convert legacy single-logo overlay config into a one-item scene. */
function overlayToScene(overlay: import("./yt-dlp").OverlayConfig | null): import("./scene").Scene | null {
  if (!overlay?.logoPath) return null;
  return {
    name: "legacy",
    items: [{ kind: "image", value: overlay.logoPath, position: overlay.position, opacity: overlay.opacity, scale: 0.18 }],
  };
}

/** Real persist: upsert session + items snapshot into DB. Non-fatal on error. */
export async function persistSessionSnapshot(session: LiveSession): Promise<void> {
  if (!session.sessionId) return;
  const { db } = await import("@/db");
  const { liveSessions, liveSessionItems } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const itemsPlayed = session.queue.filter((q) => q.status === "done").length;
  const itemsFailed = session.queue.filter((q) => q.status === "failed").length;
  const secondsStreamed = session.queue
    .filter((q) => q.status === "done")
    .reduce((acc, q) => acc + (q.durationSec ?? 0), 0);
  const state = session.state === "stopping" ? "stopping" : session.state === "error" ? "error" : session.state === "stopped" ? "stopped" : "live";
  await db
    .update(liveSessions)
    .set({
      state,
      finishedAt: session.finishedAt ? new Date(session.finishedAt) : null,
      error: session.error,
      stats: { itemsPlayed, itemsFailed, secondsStreamed },
      updatedAt: new Date(),
    })
    .where(eq(liveSessions.id, session.sessionId));
  // Replace item snapshot (small tables; simplest correct approach).
  await db.delete(liveSessionItems).where(eq(liveSessionItems.sessionRef, session.sessionId));
  if (session.queue.length > 0) {
    const { generateEntityId } = await import("@/lib/ids");
    await db.insert(liveSessionItems).values(
      session.queue.map((q, i) => ({
        id: generateEntityId("LSI"),
        sessionRef: session.sessionId as string,
        position: i,
        videoId: q.videoId,
        title: q.title,
        durationSec: q.durationSec,
        status: q.status,
      })),
    );
  }
}

async function logEventSafe(action: string, after: Record<string, unknown>): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { workflowEvents } = await import("@/db/schema");
    const { generateEntityId } = await import("@/lib/ids");
    await db.insert(workflowEvents).values({
      id: generateEntityId("WEV"),
      entityType: "live_stream",
      entityId: "live",
      action,
      before: null,
      after: after as unknown as Record<string, unknown>,
      actorUserId: null as unknown as string,
      source: "live",
    });
  } catch {
    // non-fatal
  }
}

// Survive Next.js HMR without losing the active session/proc.
const globalStore = globalThis as unknown as { __playlistStreamer?: PlaylistStreamer };

export function getStreamer(): PlaylistStreamer {
  if (!globalStore.__playlistStreamer) {
    globalStore.__playlistStreamer = new PlaylistStreamer();
    // Server restart kills the ffmpeg proc → mark previous session stopped.
    const s = globalStore.__playlistStreamer.session;
    if (s && (s.state === "live" || s.state === "starting")) {
      s.state = "stopped";
      s.error = "سرور ری‌استارت شد؛ استریم قطع شد.";
    }
  }
  return globalStore.__playlistStreamer;
}

export { PlaylistStreamer };
