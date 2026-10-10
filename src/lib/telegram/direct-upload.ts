/**
 * Disk-streamed uploads to Telegram.
 *
 * Large files must never sit wholly in Node RAM (2GB VPS): the request body
 * streams to a temp file, and curl streams that file to the Bot API as
 * multipart — memory stays flat regardless of file size.
 */
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const STREAM_UPLOAD_MAX_SECONDS = 1800;

export function sanitizeUploadFilename(raw: string): string {
  const base = basename(raw || "").trim();
  const cleaned = base.replace(/[^\w.\-()[\] ]+/g, "_").slice(0, 120);
  return cleaned || "upload.bin";
}

export async function saveUploadStream(body: ReadableStream<Uint8Array> | null): Promise<{ dir: string; path: string; bytes: number }> {
  if (!body) throw new Error("بدنه درخواست خالی است.");
  const dir = await mkdtemp(join(tmpdir(), "emro-up-"));
  const path = join(dir, "upload.bin");
  try {
    await pipeline(Readable.fromWeb(body as never), createWriteStream(path));
    const { size } = await stat(path);
    return { dir, path, bytes: size };
  } catch (e) {
    await cleanupUpload(dir).catch(() => {});
    throw e;
  }
}

export async function cleanupUpload(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export interface CurlSendOptions {
  apiBase: string;
  token: string;
  groupId: string;
  method: "sendVideo" | "sendDocument" | "sendPhoto";
  field: "video" | "document" | "photo";
  filePath: string;
  filename: string;
  mime: string;
  threadId?: number;
  caption?: string;
}

export interface CurlSendResult {
  fileId: string | null;
  messageId: number | null;
}

/** Uploads one file from disk to Telegram via curl multipart (streams, ~0 RAM). */
export async function sendFileViaCurl(opts: CurlSendOptions): Promise<CurlSendResult> {
  const { apiBase, token, groupId, method, field, filePath, filename, mime, threadId, caption } = opts;
  const base = apiBase.replace(/\/$/, "");
  const cfgPath = join(tmpdir(), `emro-curl-${Date.now()}-${Math.floor(Math.random() * 1e6)}.cfg`);
  // Token lives in a config file (not argv) so it never shows in `ps`.
  await writeFile(cfgPath, `url = "${base}/bot${token}/${method}"\nsilent = true\nshow-error = true\nmax-time = ${STREAM_UPLOAD_MAX_SECONDS}\n`);
  const args: string[] = ["-K", cfgPath, "-F", `chat_id=${groupId}`];
  if (threadId) args.push("-F", `message_thread_id=${threadId}`);
  if (caption) args.push("-F", `caption=${caption.slice(0, 1024)}`);
  args.push("-F", `${field}=@${filePath};type=${mime || "application/octet-stream"};filename=${filename}`);
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile("curl", args, { timeout: (STREAM_UPLOAD_MAX_SECONDS + 60) * 1000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ stdout: String(stdout), stderr: String(stderr) });
      });
    });
    let json: { ok?: boolean; result?: Record<string, unknown>; description?: string };
    try {
      json = JSON.parse(stdout);
    } catch {
      throw new Error("پاسخ نامعتبر از تلگرام.");
    }
    if (!json?.ok) throw new Error(`Telegram API error (${method}): ${(json as { description?: string })?.description ?? "unknown error"}`);
    const result = (json.result ?? {}) as Record<string, unknown>;
    const pick = (...paths: Array<() => unknown>): string | null => {
      for (const p of paths) {
        try {
          const v = p();
          if (typeof v === "string" && v) return v;
        } catch {}
      }
      return null;
    };
    const doc = result.document as { file_id?: string } | undefined;
    const vid = result.video as { file_id?: string } | undefined;
    const aud = result.audio as { file_id?: string } | undefined;
    const pho = result.photo as Array<{ file_id?: string }> | undefined;
    const fileId =
      field === "video"
        ? pick(() => vid?.file_id)
        : field === "photo"
          ? pick(() => pho?.[0]?.file_id, () => String((result.message_id as number) ?? ""))
          : pick(() => doc?.file_id, () => vid?.file_id, () => aud?.file_id, () => pho?.[0]?.file_id);
    const messageId = typeof result.message_id === "number" ? result.message_id : null;
    return { fileId, messageId };
  } finally {
    await rm(cfgPath, { force: true }).catch(() => {});
  }
}
