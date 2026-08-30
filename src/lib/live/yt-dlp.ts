// yt-dlp integration for live streaming: playlist discovery + direct stream URLs.
// Runs only on the server (Node runtime). The bgutil PO-token provider must be
// reachable at http://127.0.0.1:4416 (docker container bgutil-pot) for YouTube
// extraction from datacenter IPs.
import { spawn } from "node:child_process";

export interface PlaylistItem {
  videoId: string;
  title: string;
  durationSec: number | null;
}

export interface StreamUrls {
  videoUrl: string;
  audioUrl: string | null;
}

export type LiveQuality = "1080" | "720";

export type OverlayPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface OverlayConfig {
  logoPath: string;
  position: OverlayPosition;
  /** 0..1 */
  opacity: number;
}

const OVERLAY_POS: Record<OverlayPosition, string> = {
  "top-left": "10:10",
  "top-right": "W-w-10:10",
  "bottom-left": "10:H-h-10",
  "bottom-right": "W-w-10:H-h-10",
};

export function ytDlpPath(): string {
  return process.env.LIVE_YTDLP_PATH?.trim() || "yt-dlp";
}

export function buildFormatSelector(quality: LiveQuality): string {
  // Passthrough only: pre-encoded H.264 + AAC so ffmpeg can -c copy.
  // 137 = 1080p video-only, 136 = 720p video-only, 140 = AAC audio, 18 = 360p muxed fallback.
  return quality === "720" ? "136+140/18" : "137+140/136+140/18";
}

/**
 * Build ffmpeg args for one item.
 * - 720: light re-encode (x264 ultrafast) with a forced 2-second keyframe interval —
 *   satisfies YouTube's "keyframe frequency of four seconds or less" ingestion rule.
 *   Verified on-server: ~2x realtime on a single core, drop=0.
 * - 1080: pure passthrough (-c copy) — zero CPU, but keyframe cadence follows the
 *   source (YouTube may warn about buffering).
 * Audio is always copied (YouTube sources are AAC, which FLV supports).
 */
export function buildFfmpegArgs(
  inputs: string[],
  target: string,
  quality: LiveQuality,
  overlay?: OverlayConfig,
): string[] {
  const args: string[] = ["-hide_banner", "-loglevel", "warning"];
  for (const input of inputs) args.push("-i", input);
  if (inputs.length === 2 && !(quality === "720" && overlay && overlay.logoPath && overlay.opacity > 0)) {
    args.push("-map", "0:v:0", "-map", "1:a:0");
  }
  if (quality === "1080") {
    // Overlay requires re-encoding — ignored in passthrough mode.
    args.push("-c", "copy");
  } else if (overlay && overlay.logoPath && overlay.opacity > 0) {
    const logoIdx = inputs.length;
    args.push("-i", overlay.logoPath);
    const audioMap = inputs.length === 2 ? "1:a" : "0:a?";
    args.push(
      "-filter_complex",
      `[0:v]scale=-2:720[v];[${logoIdx}:v]colorchannelmixer=aa=${overlay.opacity.toFixed(2)}[wm];[v][wm]overlay=${OVERLAY_POS[overlay.position] ?? OVERLAY_POS["top-right"]}[vout]`,
      "-map", "[vout]",
      "-map", audioMap,
      "-c:v", "libx264", "-preset", "ultrafast",
      "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
      "-pix_fmt", "yuv420p",
      "-force_key_frames", "expr:gte(t,n_forced*2)",
      "-c:a", "copy",
    );
  } else {
    args.push(
      "-vf", "scale=-2:720",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
      "-pix_fmt", "yuv420p",
      "-force_key_frames", "expr:gte(t,n_forced*2)",
      "-c:a", "copy",
    );
  }
  args.push("-f", "flv", target);
  return args;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], timeoutMs = 180_000): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        resolve({ code: 124, stdout, stderr: stderr + "\ntimeout" });
      }
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", (err) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ code: 127, stdout, stderr: String(err) }); }
    });
    child.on("close", (code) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); }
    });
  });
}

/** Detect an HLS (m3u8) source — used as a live/VOD program source instead of a YouTube playlist. */
export function isM3u8Source(input: string): boolean {
  return /\.m3u8(\?|$)/i.test(input.trim());
}

/**
 * ffmpeg args for an m3u8 program source. YouTube-source streams are h264+aac,
 * which FLV/RTMP accepts directly → pure copy (~2-3% CPU). Reconnect flags keep
 * a live TV source alive across network hiccups.
 */
export function buildM3u8Args(url: string, target: string, quality: LiveQuality): string[] {
  const args: string[] = [
    "-hide_banner", "-loglevel", "warning",
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10",
    "-rw_timeout", "15000000",
    "-i", url,
  ];
  if (quality === "1080") {
    args.push("-c", "copy");
  } else {
    args.push(
      "-vf", "scale=-2:720",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
      "-pix_fmt", "yuv420p",
      "-force_key_frames", "expr:gte(t,n_forced*2)",
      "-c:a", "copy",
    );
  }
  args.push("-f", "flv", target);
  return args;
}

/** Parse one flat-playlist line "id\ttitle\tduration". Returns null for invalid rows. */
export function parsePlaylistLine(line: string): PlaylistItem | null {
  const parts = line.split("\t").map((s) => s.trim());
  if (parts.length < 1 || !parts[0]) return null;
  const videoId = parts[0];
  if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
  const title = parts[1] && parts[1] !== "NA" ? parts[1] : videoId;
  const durRaw = parts[2];
  const durationSec = durRaw && durRaw !== "NA" && /^\d+(\.\d+)?$/.test(durRaw) ? Math.round(Number(durRaw)) : null;
  return { videoId, title, durationSec };
}

/** Fetch playlist items in order via flat playlist (no per-video extraction). */
export async function fetchPlaylistItems(playlistInput: string, max = 200): Promise<PlaylistItem[]> {
  const target = normalizePlaylistUrl(playlistInput);
  const res = await run(ytDlpPath(), [
    "--no-warnings", "--flat-playlist", "--quiet",
    "--print", "%(id)s\t%(title)s\t%(duration)s",
    "--playlist-items", `1:${max}`,
    target,
  ]);
  if (res.code !== 0 || !res.stdout.trim()) {
    throw new Error(`خواندن پلی‌لیست ناموفق بود: ${res.stderr.split("\n").filter(Boolean).slice(-1)[0] ?? "unknown"}`);
  }
  const items: PlaylistItem[] = [];
  const seen = new Set<string>();
  for (const line of res.stdout.split("\n")) {
    const item = parsePlaylistLine(line);
    if (item && !seen.has(item.videoId)) {
      seen.add(item.videoId);
      items.push(item);
    }
  }
  return items;
}

/** Get direct passthrough stream URLs for one video. */
export async function fetchStreamUrls(videoId: string, quality: LiveQuality): Promise<StreamUrls> {
  const res = await run(ytDlpPath(), [
    "--no-warnings", "--quiet",
    "-f", buildFormatSelector(quality),
    "--print", "urls",
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  if (res.code !== 0 || !res.stdout.trim()) {
    throw new Error(`استخراج استریم ${videoId} ناموفق بود: ${res.stderr.split("\n").filter(Boolean).slice(-1)[0] ?? "unknown"}`);
  }
  const lines = res.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return { videoUrl: lines[0], audioUrl: lines[1] };
  return { videoUrl: lines[0], audioUrl: null };
}

/** Normalize user input to a playlist URL yt-dlp accepts. */
export function normalizePlaylistUrl(input: string): string {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{12,50}$/.test(s)) return `https://www.youtube.com/playlist?list=${s}`;
  return s;
}

/** Convert ffmpeg "time=HH:MM:SS.xx" to seconds. Returns null if not matched. */
export function parseFfmpegTime(line: string): number | null {
  const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Mask stream key in a target URL for safe display/logging. */
export function maskTarget(target: string): string {
  const idx = target.lastIndexOf("/");
  if (idx === -1 || idx === target.length - 1) return "***";
  return `${target.slice(0, idx + 1)}***`;
}

/** Extract an 11-char YouTube video id from a raw id or a watch/shorts/youtu.be URL. */
export function extractVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Fetch metadata for a single video (used by queue add during live playback). */
export async function fetchVideoMeta(videoId: string): Promise<PlaylistItem> {
  const res = await run(ytDlpPath(), [
    "--no-warnings", "--quiet",
    "--print", "%(id)s\t%(title)s\t%(duration)s",
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  const line = res.stdout.split("\n").map((l) => l.trim()).find(Boolean);
  const item = line ? parsePlaylistLine(line) : null;
  if (res.code !== 0 || !item) {
    throw new Error(`خواندن ویدیو ${videoId} ناموفق بود: ${res.stderr.split("\n").filter(Boolean).slice(-1)[0] ?? "unknown"}`);
  }
  return item;
}
