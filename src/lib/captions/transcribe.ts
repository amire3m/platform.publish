import { execFile } from "node:child_process";

import { buildSrt, mergeSegments, type TranscriptSegment } from "./srt";
import { planAudioChunks } from "./chunks";
import type { SttProvider } from "./providers";

export interface TranscriptionDeps {
  /** Local media file path (temp download or bot-API cache). Never a full RAM buffer. */
  mediaPath: () => Promise<string>;
  probeDuration: (mediaPath: string) => Promise<number>;
  extractWav: (mediaPath: string, start: number, end: number) => Promise<Buffer>;
  stt: SttProvider;
  saveProgress: (status: string) => Promise<void>;
  persist: (result: { text: string; durationSec: number; segments: TranscriptSegment[]; srt: string; model: string }) => Promise<void>;
}

export function transcriptionTooLongError(): Error & { code: string } {
  return Object.assign(new Error("مدت فایل بیشتر از سقف مجاز است."), { code: "TRANSCRIBE_TOO_LONG" });
}

export async function runTranscription(deps: TranscriptionDeps, opts: { maxMinutes: number }): Promise<{ segments: number }> {
  const mediaPath = await deps.mediaPath();
  const durationSec = await deps.probeDuration(mediaPath);
  if (durationSec / 60 > opts.maxMinutes) throw transcriptionTooLongError();
  await deps.saveProgress("processing");
  const chunks = planAudioChunks(durationSec);
  const merged: Array<{ offset: number; segments: TranscriptSegment[] }> = [];
  let model = "unknown";
  for (const chunk of chunks) {
    const wav = await deps.extractWav(mediaPath, chunk.start, chunk.end);
    const r = await deps.stt.transcribe(wav, { language: "fa" });
    model = r.model;
    merged.push({ offset: chunk.start, segments: r.segments });
  }
  const segments = mergeSegments(merged);
  const text = segments.map((s) => s.text).join(" ");
  await deps.persist({ text, durationSec, segments, srt: buildSrt(segments), model });
  return { segments: segments.length };
}

export function buildCaptionPrompt(input: { title: string; channel: string; transcript: string }): string {
  const transcript = input.transcript.slice(0, 12000);
  return [
    "You write Persian social-media captions. Reply with JSON only: { \"youtube\": \"...\", \"instagram\": \"...\" }.",
    `Video title: ${input.title}`,
    `Channel: ${input.channel}`,
    "youtube: an engaging Persian title (max 100 chars), then 2-4 line description, then 3 hashtags.",
    "instagram: a hook first line, short Persian caption, then 5-10 hashtags.",
    `Transcript:\n${transcript}`,
  ].join("\n");
}

/** Extract 16kHz mono wav for [start, end) from a file path (seek before input: no full-file RAM). */
export async function extractWav(mediaPath: string, start: number, end: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // 16kHz mono 16-bit: ~32KB/s, so a 10-min chunk peaks ~19MB in stdout.
    const maxBuffer = 128 * 1024 * 1024;
    const proc = execFile(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-ss", String(start), "-t", String(end - start), "-i", mediaPath, "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"],
      { encoding: "buffer", maxBuffer },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout as Buffer);
      },
    );
    void proc;
  });
}

/** Probe media duration in seconds from a file path (no file content in RAM). */
export async function probeDuration(mediaPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(Object.assign(new Error("خواندن مدت فایل ناموفق بود."), { code: "PROBE_FAILED" }));
          return;
        }
        const sec = Number(String(stdout).trim());
        if (!Number.isFinite(sec) || sec <= 0) {
          reject(Object.assign(new Error("مدت معتبر برای فایل یافت نشد."), { code: "PROBE_FAILED" }));
          return;
        }
        resolve(sec);
      },
    );
    void proc;
  });
}
