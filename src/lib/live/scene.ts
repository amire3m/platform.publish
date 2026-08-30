// Graphics scenes for the live encoder (720p mode only).
// A scene is an ordered list of overlay items rendered onto the video:
//   image  — PNG/JPG logo or pre-rendered Persian text (drawtext cannot shape Persian)
//   text   — Latin/digits/clock via drawtext (DejaVu fonts on server)
//   pip    — picture-in-picture HLS (m3u8) source in a corner
// Pure builders are unit-tested; scene storage lives in appSettings.capabilityConfig.live.
import type { OverlayPosition } from "./yt-dlp";

export type SceneItemKind = "image" | "text" | "pip";

export interface SceneItem {
  kind: SceneItemKind;
  /** image: server file path; pip: m3u8 URL; text: drawtext content (Latin/digits). */
  value: string;
  position: OverlayPosition;
  /** Fraction of output width for image/pip (0.05–0.9). */
  scale?: number;
  /** 0.1–1 for image/text. */
  opacity?: number;
}

export interface Scene {
  name: string;
  items: SceneItem[];
}

export const POS_XY: Record<OverlayPosition, string> = {
  "top-left": "10:10",
  "top-right": "W-w-10:10",
  "bottom-left": "10:H-h-10",
  "bottom-right": "W-w-10:H-h-10",
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

interface BuiltFilter {
  filter: string;
  finalLabel: string;
  extraInputCount: number;
}

/**
 * Build the -filter_complex string for a scene over a scaled 720p base.
 * mainWidthPx = width of the scaled base (720p → ~1280).
 * Extra inputs (images then pips, in scene order) start at index = mainInputCount.
 */
export function buildSceneFilter(items: SceneItem[], mainInputCount: number, mainWidthPx = 1280): BuiltFilter | null {
  if (items.length === 0) return null;
  const parts: string[] = ["[0:v]scale=-2:720[base]"];
  let current = "base";
  let labelIndex = 0;
  let nextInputIndex = mainInputCount;
  let extraInputCount = 0;
  for (const item of items) {
    const label = `cur${labelIndex}`;
    if (item.kind === "image") {
      const w = Math.round(mainWidthPx * clamp(item.scale ?? 0.18, 0.05, 0.9));
      const op = clamp(item.opacity ?? 1, 0.1, 1).toFixed(2);
      parts.push(`[${nextInputIndex}:v]scale=${w}:-1,format=rgba,colorchannelmixer=aa=${op}[ov${labelIndex}]`);
      parts.push(`[${current}][ov${labelIndex}]overlay=${POS_XY[item.position]}[${label}]`);
      nextInputIndex += 1;
      extraInputCount += 1;
    } else if (item.kind === "pip") {
      const w = Math.round(mainWidthPx * clamp(item.scale ?? 0.33, 0.1, 0.9));
      parts.push(`[${nextInputIndex}:v]scale=${w}:-2[pf${labelIndex}]`);
      parts.push(`[${current}][pf${labelIndex}]overlay=${POS_XY[item.position]}[${label}]`);
      nextInputIndex += 1;
      extraInputCount += 1;
    } else if (item.kind === "text") {
      const op = clamp(item.opacity ?? 1, 0.1, 1).toFixed(2);
      const text = item.value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "");
      parts.push(
        `[${current}]drawtext=text='${text}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=28:fontcolor=white@${op}:x=(w-text_w)/2:y=h*0.92[${label}]`,
      );
    } else {
      continue;
    }
    current = label;
    labelIndex += 1;
  }
  if (labelIndex === 0) return null;
  return { filter: parts.join(";"), finalLabel: current, extraInputCount };
}

/**
 * Full ffmpeg args for a scene-based 720p encode.
 * inputs = main video (index 0) + optional audio (index 1).
 */
export function buildSceneArgs(inputs: string[], target: string, scene: Scene): string[] {
  const args: string[] = ["-hide_banner", "-loglevel", "warning"];
  for (const input of inputs) args.push("-i", input);
  for (const item of scene.items) {
    if (item.kind === "image") {
      args.push("-loop", "1", "-i", item.value);
    } else if (item.kind === "pip") {
      args.push(
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "10",
        "-rw_timeout", "15000000",
        "-i", item.value,
      );
    }
  }
  const audioMap = inputs.length === 2 ? "1:a" : "0:a?";
  const built = buildSceneFilter(scene.items, inputs.length);
  if (!built) {
    args.push(
      "-map", "0:v:0",
      "-map", inputs.length === 2 ? "1:a:0" : "0:a?",
      "-vf", "scale=-2:720",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
      "-pix_fmt", "yuv420p",
      "-force_key_frames", "expr:gte(t,n_forced*2)",
      "-c:a", "copy",
    );
  } else {
    args.push(
      "-filter_complex", built.filter,
      "-map", `[${built.finalLabel}]`,
      "-map", audioMap,
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

// ---------------------------------------------------------------------------
// Settings storage (appSettings.capabilityConfig.live)
// ---------------------------------------------------------------------------
export interface LiveGraphicsConfig {
  /** Legacy single-logo fields (pre-scenes) — kept for backward compatibility. */
  logoPath?: string;
  position?: string;
  opacity?: number;
  scenes?: Scene[];
  activeSceneName?: string;
}

export function parseScenes(cfg: LiveGraphicsConfig | undefined): { scenes: Scene[]; activeName: string | null } {
  if (!cfg) return { scenes: [], activeName: null };
  if (cfg.scenes && cfg.scenes.length > 0) {
    const activeName = cfg.scenes.some((s) => s.name === cfg.activeSceneName) ? cfg.activeSceneName! : cfg.scenes[0].name;
    return { scenes: cfg.scenes, activeName };
  }
  // Legacy single logo → synthesize a default scene
  if (cfg.logoPath) {
    const position = (["top-left", "top-right", "bottom-left", "bottom-right"].includes(cfg.position ?? "")
      ? cfg.position
      : "top-right") as OverlayPosition;
    const scene: Scene = {
      name: "پیش‌فرض",
      items: [{ kind: "image", value: cfg.logoPath, position, opacity: cfg.opacity ?? 0.8, scale: 0.18 }],
    };
    return { scenes: [scene], activeName: scene.name };
  }
  return { scenes: [], activeName: null };
}

export function findScene(scenes: Scene[], name: string | null | undefined): Scene | null {
  if (!name) return null;
  return scenes.find((s) => s.name === name) ?? null;
}
