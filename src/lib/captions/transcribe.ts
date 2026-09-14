import { execFile } from "node:child_process";

import { buildSrt, mergeSegments, type TranscriptSegment } from "./srt";
import { planAudioChunks } from "./chunks";
import type { SttProvider } from "./providers";

export interface TranscriptionDeps {
  downloadFile: () => Promise<Buffer>;
  probeDuration: (video: Buffer) => Promise<number>;
  extractWav: (video: Buffer, start: number, end: number) => Promise<Buffer>;
  stt: SttProvider;
  saveProgress: (status: string) => Promise<void>;
  persist: (result: { text: string; durationSec: number; segments: TranscriptSegment[]; srt: string; model: string }) => Promise<void>;
}

export function transcriptionTooLongError(): Error & { code: string } {
  return Object.assign(new Error("مدت فایل بیشتر از سقف مجاز است."), { code: "TRANSCRIBE_TOO_LONG" });
}

export async function runTranscription(deps: TranscriptionDeps, opts: { maxMinutes: number }): Promise<{ segments: number }> {
  const video = await deps.downloadFile();
  const durationSec = await deps.probeDuration(video);
  if (durationSec / 60 > opts.maxMinutes) throw transcriptionTooLongError();
  await deps.saveProgress("processing");
  const chunks = planAudioChunks(durationSec);
  const merged: Array<{ offset: number; segments: TranscriptSegment[] }> = [];
  let model = "unknown";
  for (const chunk of chunks) {
    const wav = await deps.extractWav(video, chunk.start, chunk.end);
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

/** Extract 16kHz mono wav for [start, end) via the system ffmpeg binary. */
export async function extractWav(video: Buffer, start: number, end: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ss", String(start), "-t", String(end - start), "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"],
      { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout as Buffer);
      },
    );
    (proc.stdin as unknown as { write: (b: Buffer) => void; end: () => void }).write(video);
    (proc.stdin as unknown as { end: () => void }).end();
  });
}

/** Probe media duration in seconds via ffprobe (ships with ffmpeg). */
export async function probeDuration(video: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "pipe:0"],
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
    (proc.stdin as unknown as { write: (b: Buffer) => void; end: () => void }).write(video);
    (proc.stdin as unknown as { end: () => void }).end();
  });
}
