/**
 * Multipart bundles: files too big for a single Telegram upload are split
 * into raw parts (no zip — video doesn't compress) and tracked via a manifest
 * (bundle_id / part_index / part_total + sha256 per part). Downloads
 * transparently reassemble; callers never see parts.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentPartAssets } from "@/db/schema";

export const BUNDLE_PART_BYTES = 500 * 1024 * 1024; // 500MB parts
export const BUNDLE_MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8GB total sanity cap

export function isBundleRef(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith("bundle:");
}

export function bundleIdOf(ref: string): string {
  return ref.slice("bundle:".length);
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash as never);
  return hash.digest("hex");
}

/** Split a file into sequential part files (streaming, constant memory). */
export async function splitFileToParts(srcPath: string, partBytes: number, dir: string): Promise<string[]> {
  const { size } = await stat(srcPath);
  const total = Math.max(1, Math.ceil(size / partBytes));
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const dest = join(dir, `part-${String(i + 1).padStart(3, "0")}`);
    await pipeline(createReadStream(srcPath, { start: i * partBytes, end: Math.min(size, (i + 1) * partBytes) - 1 }), createWriteStream(dest));
    out.push(dest);
  }
  return out;
}

export interface BundlePartRow {
  id: string;
  fileRef: string;
  partIndex: number | null;
  partTotal: number | null;
  fileHash: string | null;
}

export async function listBundleParts(bundleId: string): Promise<BundlePartRow[]> {
  const rows = (await db
    .select({
      id: contentPartAssets.id,
      fileRef: contentPartAssets.fileRef,
      partIndex: contentPartAssets.partIndex,
      partTotal: contentPartAssets.partTotal,
      fileHash: contentPartAssets.fileHash,
    })
    .from(contentPartAssets)
    .where(eq(contentPartAssets.bundleId, bundleId))
    .orderBy(asc(contentPartAssets.partIndex))) as unknown as BundlePartRow[];
  return rows;
}

export interface MaterializedBundle {
  path: string;
  size: number;
  cleanup: () => Promise<void>;
}

/**
 * Reassemble a bundle into one temp file (streaming concat).
 * `downloadPart` fetches a single part fileRef to a temp path.
 */
export async function materializeBundle(
  bundleId: string,
  downloadPart: (fileRef: string) => Promise<{ path: string; cleanup: () => Promise<void> }>,
): Promise<MaterializedBundle> {
  const parts = await listBundleParts(bundleId);
  if (parts.length === 0) throw new Error("باندل خالی است یا یافت نشد.");
  const dir = await mkdtemp(join(tmpdir(), "emro-bundle-"));
  const outPath = join(dir, "bundle.bin");
  const cleanup = async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  };
  try {
    const { createWriteStream: cws } = await import("node:fs");
    const out = cws(outPath);
    let size = 0;
    for (const p of parts) {
      const dl = await downloadPart(p.fileRef);
      try {
        const st = await stat(dl.path);
        await pipeline(createReadStream(dl.path), out, { end: false } as never);
        size += st.size;
      } finally {
        await dl.cleanup().catch(() => {});
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.on("finish", () => resolve());
      out.on("error", reject);
      out.end();
    });
    return { path: outPath, size, cleanup };
  } catch (e) {
    await cleanup().catch(() => {});
    throw e;
  }
}
