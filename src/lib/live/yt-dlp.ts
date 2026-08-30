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
export function buildFfmpegArgs(inputs: string[], target: string, quality: LiveQuality): string[] {
  const args: string[] = ["-hide_banner", "-loglevel", "warning"];
  for (const input of inputs) args.push("-i", input);
  if (inputs.length === 2) args.push("-map", "0:v:0", "-map", "1:a:0");
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
