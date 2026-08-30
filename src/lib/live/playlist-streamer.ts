// Playlist live-streaming engine: sequential ffmpeg passthrough (no re-encode)
// of a YouTube playlist to an RTMP target. Single active session per server.
// Server-only module — spawns yt-dlp/ffmpeg, never import from client code.
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import {
  buildFfmpegArgs,
  fetchPlaylistItems,
  fetchStreamUrls,
  maskTarget,
  parseFfmpegTime,
  type LiveQuality,
  type PlaylistItem,
} from "./yt-dlp";

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
}

export interface StartLiveOptions {
  playlistInput: string;
  rtmpUrl: string;
  streamKey: string;
  quality?: LiveQuality;
  loop?: boolean;
  maxItems?: number;
}

export interface LiveStreamerDeps {
  fetchItems: typeof fetchPlaylistItems;
  fetchUrls: typeof fetchStreamUrls;
  spawnFfmpeg: (inputs: string[], target: string, quality: LiveQuality) => FfmpegProcess;
  now?: () => number;
  onEvent?: (action: string, detail: Record<string, unknown>) => void;
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
    const session: LiveSession = {
      state: "starting",
      quality: opts.quality ?? "1080",
      loop: opts.loop ?? true,
      playlistInput: opts.playlistInput,
      rtmpTarget,
      queue: [],
      currentIndex: -1,
      startedAt: Date.now(),
      currentElapsedSec: 0,
      error: null,
      finishedAt: null,
    };
    this.session = session;
    this.stopping = false;
    try {
      const items = await this.deps.fetchItems(opts.playlistInput, opts.maxItems ?? 200);
      if (items.length === 0) throw new Error("پلی‌لیست خالی است یا پیدا نشد.");
      session.queue = items.map((it) => ({ ...it, status: "pending" as const }));
      session.state = "live";
      this.deps.onEvent?.("live_started", { items: items.length, quality: session.quality, target: maskTarget(rtmpTarget) });
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
    try {
      const urls = await this.deps.fetchUrls(item.videoId, s.quality);
      if (this.stopping || s.state !== "live") return;
      const inputs = urls.audioUrl ? [urls.videoUrl, urls.audioUrl] : [urls.videoUrl];
      this.proc = this.deps.spawnFfmpeg(inputs, s.rtmpTarget, s.quality);
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
        setTimeout(() => void this.runNext(), NEXT_DELAY_MS);
      });
      this.deps.onEvent?.("live_item_started", { videoId: item.videoId, title: item.title, index: nextIndex + 1 });
    } catch (err) {
      item.status = "failed";
      this.deps.onEvent?.("live_item_failed", { videoId: item.videoId, error: err instanceof Error ? err.message : "?" });
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
  }

  /** Session safe for API exposure — stream key masked, no proc handles. */
  toPublic() {
    const s = this.session;
    if (!s) return { state: "idle" as const, queue: [], currentIndex: -1, currentElapsedSec: 0, rtmpTarget: null, error: null };
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
    };
  }
}

function buildTarget(rtmpUrl: string, streamKey: string): string {
  const base = rtmpUrl.trim().replace(/\/+$/, "");
  const key = streamKey.trim();
  if (!base || !key) return "";
  return `${base}/${key}`;
}

function defaultSpawnFfmpeg(inputs: string[], target: string, quality: LiveQuality): FfmpegProcess {
  const args = buildFfmpegArgs(inputs, target, quality);
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume();
  child.on("error", (err) => {
    console.error("[live] ffmpeg spawn error:", err.message);
  });
  return child;
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
