/**
 * Browser client for resumable uploads: create session → PUT 8MB chunks
 * (with retry) → complete. Files stream slice-by-slice; the whole file
 * is never held in memory beyond one chunk.
 */

export interface ResumableFile {
  size: number;
  name?: string;
  type?: string;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface ResumableMeta {
  fileName?: string;
  mime?: string;
  assetId?: string | null;
  partId?: string | null;
  productId?: string | null;
  channel?: string | null;
  kind?: string | null;
}

export interface ResumableProgress {
  sessionId: string;
  sentChunks: number;
  totalChunks: number;
  sentBytes: number;
  totalBytes: number;
}

export interface ResumableResult {
  assetId: string;
  revisionId: string;
  version: number;
}

export interface ResumableOptions {
  fetchFn?: typeof fetch;
  chunkRetries?: number;
  onProgress?: (p: ResumableProgress) => void;
}

async function readData(res: Response): Promise<Record<string, unknown>> {
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: Record<string, unknown>; error?: string };
  if (!res.ok || body.ok === false) {
    throw new Error((body.error as string) || `upload request failed (${res.status})`);
  }
  return (body.data ?? {}) as Record<string, unknown>;
}

export async function uploadFileResumable(
  file: ResumableFile,
  meta: ResumableMeta = {},
  opts: ResumableOptions = {},
): Promise<ResumableResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const retries = opts.chunkRetries ?? 3;

  const created = await readData(
    await fetchFn("/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: meta.fileName ?? file.name ?? "upload.bin",
        mime: meta.mime ?? file.type ?? "application/octet-stream",
        totalBytes: file.size,
        assetId: meta.assetId ?? null,
        partId: meta.partId ?? null,
        productId: meta.productId ?? null,
        channel: meta.channel ?? null,
        kind: meta.kind ?? null,
      }),
    }),
  );
  const sessionId = created.sessionId as string;
  const totalChunks = created.totalChunks as number;
  const chunkBytes = created.chunkBytes as number;
  if (!sessionId || !totalChunks || !chunkBytes) throw new Error("invalid upload session");

  let sentBytes = 0;
  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkBytes;
    const end = Math.min(file.size, start + chunkBytes);
    const buf = await file.slice(start, end).arrayBuffer();
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await readData(
          await fetchFn(`/api/media/uploads/${sessionId}/chunks?index=${index}`, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream" },
            body: buf,
          }),
        );
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    sentBytes += end - start;
    opts.onProgress?.({ sessionId, sentChunks: index + 1, totalChunks, sentBytes, totalBytes: file.size });
  }

  const done = await readData(
    await fetchFn(`/api/media/uploads/${sessionId}/complete`, { method: "POST" }),
  );
  return {
    assetId: done.assetId as string,
    revisionId: done.revisionId as string,
    version: done.version as number,
  };
}
