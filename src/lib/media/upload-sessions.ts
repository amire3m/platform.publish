import { randomUUID } from "node:crypto";

export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024 * 1024;

export function createUploadSessionId(): string {
  return `MUS-${randomUUID().slice(0, 8)}`;
}

export function chunkPlan(totalBytes: number, chunkBytes: number): number[] {
  const total = Math.max(1, Math.ceil(totalBytes / chunkBytes));
  return Array.from({ length: total }, (_, i) => i);
}

export function nextMissingChunk(received: number[], totalChunks: number): number | null {
  const set = new Set(received);
  for (let i = 0; i < totalChunks; i++) if (!set.has(i)) return i;
  return null;
}
