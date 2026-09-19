import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

/**
 * A media payload that never holds a large file fully in RAM: small files
 * ride as a Buffer, large ones as a temp-file path streamed on demand.
 */
export type MediaPayload =
  | { kind: "buffer"; buffer: Buffer }
  | { kind: "file"; path: string; size: number; cleanup: () => Promise<void> };

export function payloadSize(p: MediaPayload): number {
  return p.kind === "buffer" ? p.buffer.length : p.size;
}

export function payloadToStream(p: MediaPayload): Readable {
  return p.kind === "buffer" ? Readable.from(p.buffer) : createReadStream(p.path);
}

export async function cleanupPayload(p: MediaPayload): Promise<void> {
  if (p.kind === "file") {
    try {
      await p.cleanup();
    } catch {}
  }
}
