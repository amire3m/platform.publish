import { promises as fsp, statfsSync } from "node:fs";
import { join } from "node:path";

export interface SweepDeps {
  root: string;
  now: number;
  ttlDays: number;
  dryRun: boolean;
  getLastAccess: (filePath: string) => Promise<Date | null>;
}

export interface SweepResult {
  scanned: number;
  deleted: number;
  freedBytes: number;
  errors: number;
}

/** Thumbnails are tiny and needed for lists — never swept. */
export function isThumbnailPath(filePath: string): boolean {
  return filePath.split("/").includes("thumbnails");
}

export function shouldKeep(filePath: string, accessedAt: Date | null, now: number, ttlDays: number): boolean {
  if (isThumbnailPath(filePath)) return true;
  if (!accessedAt) return false;
  return now - accessedAt.getTime() <= ttlDays * 24 * 60 * 60 * 1000;
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isDirectory()) yield* walkFiles(full);
    else if (e.isFile()) yield full;
  }
}

/**
 * Delete cached media untouched past TTL. Uses the recorded last-access,
 * falling back to max(atime, mtime) so pre-existing files are judged fairly.
 * Never throws — returns counts.
 */
export async function sweepMediaCache(deps: SweepDeps): Promise<SweepResult> {
  const out: SweepResult = { scanned: 0, deleted: 0, freedBytes: 0, errors: 0 };
  try {
    for await (const file of walkFiles(deps.root)) {
      out.scanned++;
      try {
        const st = await fsp.stat(file);
        let accessed: Date | null = null;
        try {
          accessed = await deps.getLastAccess(file);
        } catch {
          accessed = null;
        }
        if (!accessed) {
          const fsTime = Math.max(st.atimeMs, st.mtimeMs);
          accessed = Number.isFinite(fsTime) && fsTime > 0 ? new Date(fsTime) : null;
        }
        if (!shouldKeep(file, accessed, deps.now, deps.ttlDays)) {
          if (!deps.dryRun) await fsp.unlink(file);
          out.deleted++;
          out.freedBytes += st.size;
        }
      } catch {
        out.errors++;
      }
    }
  } catch {
    out.errors++;
  }
  return out;
}

/** Best-effort access record (never throws, never blocks serving). */
export async function touchMediaAccess(filePath: string): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { mediaAccess } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    const now = new Date();
    await db
      .insert(mediaAccess)
      .values({ filePath, lastAccess: now, accessCount: 1 } as never)
      .onConflictDoUpdate({
        target: mediaAccess.filePath,
        set: { lastAccess: now, accessCount: sql`${mediaAccess.accessCount} + 1` } as never,
      });
  } catch {}
}

async function readAccessMap(paths: readonly string[]): Promise<Map<string, Date>> {
  try {
    const { db } = await import("@/db");
    const { mediaAccess } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    if (!paths.length) return new Map();
    const rows = (await db
      .select()
      .from(mediaAccess)
      .where(inArray(mediaAccess.filePath, [...paths]))) as unknown as Array<{
      filePath?: string;
      file_path?: string;
      lastAccess?: Date | string;
      last_access?: Date | string;
    }>;
    const out = new Map<string, Date>();
    for (const r of rows) {
      const p = r.filePath ?? r.file_path;
      const at = r.lastAccess ?? r.last_access;
      if (p && at) out.set(p, new Date(at));
    }
    return out;
  } catch {
    return new Map();
  }
}

function diskUsagePct(root: string): number {
  try {
    const st = statfsSync(root);
    const total = Number(st.blocks) * Number(st.bsize);
    const free = Number(st.bfree) * Number(st.bsize);
    if (!total) return 0;
    return Math.round(((total - free) / total) * 100);
  } catch {
    return 0;
  }
}

export interface SweepRunOptions {
  root?: string;
  ttlDays?: number;
  highWaterPct?: number;
  dryRun?: boolean;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Full sweep run: aggressive 1-day TTL past the high-water mark, plus
 * discovery of every cached file for access lookup. Returns the counts.
 */
export async function runMediaSweep(opts: SweepRunOptions = {}): Promise<SweepResult & { ttlDays: number; diskPct: number }> {
  const root = opts.root ?? process.env.MEDIA_CACHE_ROOT ?? "/var/lib/docker/volumes/tg-bot-api-data/_data";
  const ttlDays = opts.ttlDays ?? envInt("MEDIA_TTL_DAYS", 7);
  const highWaterPct = opts.highWaterPct ?? envInt("MEDIA_DISK_HIGH_WATER", 70);
  const dryRun = opts.dryRun ?? process.env.MEDIA_SWEEP_DRY_RUN !== "0";
  const diskPct = diskUsagePct(root);
  const effectiveTtl = diskPct >= highWaterPct ? 1 : ttlDays;
  const paths: string[] = [];
  for await (const file of walkFiles(root)) paths.push(file);
  const access = await readAccessMap(paths);
  return {
    ...(await sweepMediaCache({
      root,
      now: Date.now(),
      ttlDays: effectiveTtl,
      dryRun,
      getLastAccess: async (p) => access.get(p) ?? null,
    })),
    ttlDays: effectiveTtl,
    diskPct,
  };
}
