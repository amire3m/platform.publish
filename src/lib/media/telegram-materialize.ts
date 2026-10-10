/**
 * Staging → Telegram materialization for the unified media core.
 * Reuses the proven curl/bundle path: single-shot at or below 2GB,
 * 500MB raw parts above it, 8GB total cap. Staging files stream from
 * disk — never fully in RAM.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateEntityId } from "@/lib/ids";
import { sendFileViaCurl } from "@/lib/telegram/direct-upload";
import { BUNDLE_MAX_BYTES, BUNDLE_PART_BYTES, sha256File, splitFileToParts } from "./bundles";

export const TELEGRAM_SINGLE_CAP_BYTES = 2 * 1024 * 1024 * 1024;

export type MaterializePlan = { mode: "single" } | { mode: "bundle"; parts: number } | { mode: "too_large" };

export function materializePlan(sizeBytes: number): MaterializePlan {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { mode: "single" };
  if (sizeBytes > BUNDLE_MAX_BYTES) return { mode: "too_large" };
  if (sizeBytes <= TELEGRAM_SINGLE_CAP_BYTES) return { mode: "single" };
  return { mode: "bundle", parts: Math.ceil(sizeBytes / BUNDLE_PART_BYTES) };
}

export interface MaterializeInput {
  stagingPath: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  apiBase: string;
  botToken: string;
  groupId: string;
  threadId?: number;
  caption?: string;
}

export interface MaterializedPart {
  fileId: string;
  messageId: number | null;
  hash: string | null;
  partIndex?: number;
  partTotal?: number;
}

export interface MaterializeOutput {
  fileRef: string;
  manifest: MaterializedPart[];
  partCount: number;
}

type SendFn = typeof sendFileViaCurl;

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

/** Single-shot upload with the same video→document fallback as content-room. */
async function singleShot(input: MaterializeInput, send: SendFn): Promise<MaterializeOutput> {
  const base = {
    apiBase: input.apiBase,
    token: input.botToken,
    groupId: input.groupId,
    filePath: input.stagingPath,
    filename: input.filename,
    mime: input.mime,
    threadId: input.threadId,
    caption: input.caption,
  };
  let fileId: string | null = null;
  let messageId: number | null = null;
  if (isVideoMime(input.mime)) {
    try {
      ({ fileId, messageId } = await send({ ...base, method: "sendVideo", field: "video" }));
    } catch {
      ({ fileId, messageId } = await send({ ...base, method: "sendDocument", field: "document" }));
    }
    if (!fileId) {
      ({ fileId, messageId } = await send({ ...base, method: "sendDocument", field: "document" }));
    }
  } else {
    try {
      ({ fileId, messageId } = await send({ ...base, method: "sendPhoto", field: "photo" }));
    } catch {
      ({ fileId, messageId } = await send({ ...base, method: "sendDocument", field: "document" }));
    }
  }
  if (!fileId) throw new Error("no file_id returned");
  return { fileRef: fileId, manifest: [{ fileId, messageId, hash: null }], partCount: 1 };
}

async function bundleUpload(input: MaterializeInput, send: SendFn): Promise<MaterializeOutput> {
  const bundleId = generateEntityId("BDL");
  const workDir = await mkdtemp(join(tmpdir(), "emro-mat-"));
  try {
    const partPaths = await splitFileToParts(input.stagingPath, BUNDLE_PART_BYTES, workDir);
    const manifest: MaterializedPart[] = [];
    let idx = 0;
    for (const pp of partPaths) {
      idx++;
      const hash = await sha256File(pp).catch(() => null);
      const { fileId, messageId } = await send({
        apiBase: input.apiBase,
        token: input.botToken,
        groupId: input.groupId,
        method: "sendDocument",
        field: "document",
        filePath: pp,
        filename: `${input.filename}.part${String(idx).padStart(3, "0")}`,
        mime: "application/octet-stream",
        threadId: input.threadId,
        caption: `${input.filename} — بخش ${idx} از ${partPaths.length}`,
      });
      if (!fileId) throw new Error(`bundle part ${idx}/${partPaths.length} returned no file_id`);
      manifest.push({ fileId, messageId, hash, partIndex: idx, partTotal: partPaths.length });
    }
    return { fileRef: `bundle:${bundleId}`, manifest, partCount: partPaths.length };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function materializeStagingToTelegram(
  input: MaterializeInput,
  send: SendFn = sendFileViaCurl,
): Promise<MaterializeOutput> {
  const plan = materializePlan(input.sizeBytes);
  if (plan.mode === "too_large") {
    throw Object.assign(new Error("حجم فایل از سقف مجاز (۸ گیگابایت) بیشتر است."), { code: "FILE_TOO_LARGE" });
  }
  try {
    if (plan.mode === "single") {
      try {
        return await singleShot(input, send);
      } catch {
        // Fail over to bundle only when the file is big enough to split.
        if (input.sizeBytes <= BUNDLE_PART_BYTES) throw new Error("single-shot Telegram upload failed");
        return await bundleUpload(input, send);
      }
    }
    return await bundleUpload(input, send);
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { code: "TELEGRAM_UPLOAD_FAILED" });
  }
}
