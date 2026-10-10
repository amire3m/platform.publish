/**
 * Stale resumable-upload reaper. Open sessions older than TTL are marked
 * `expired` and their tmp staging dirs removed so abandoned 8GB uploads
 * can never fill the disk. Never throws — returns counts.
 */
import { eq, lt } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { db } from "@/db";
import { mediaUploadSessions } from "@/db/schema";
import { stagingDir } from "./upload-sessions";

export interface OpenSessionRow {
  id: string;
  status: string;
  updatedAt: Date;
}

export function selectStaleOpenSessions(rows: readonly OpenSessionRow[], nowMs: number, ttlHours: number): string[] {
  const ttlMs = ttlHours * 60 * 60 * 1000;
  return rows
    .filter((r) => r.status === "open" && nowMs - new Date(r.updatedAt).getTime() > ttlMs)
    .map((r) => r.id);
}

export interface ExpireStaleResult {
  expired: number;
  errors: number;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** DB-backed run: expire stale open sessions + remove their staging dirs. */
export async function expireStaleUploadSessions(ttlHours?: number): Promise<ExpireStaleResult> {
  const out: ExpireStaleResult = { expired: 0, errors: 0 };
  try {
    const ttl = ttlHours ?? envInt("MEDIA_UPLOAD_SESSION_TTL_HOURS", 24);
    const cutoff = new Date(Date.now() - ttl * 60 * 60 * 1000);
    const stale = (await db
      .select({ id: mediaUploadSessions.id })
      .from(mediaUploadSessions)
      .where((await import("drizzle-orm")).and(
        eq(mediaUploadSessions.status, "open"),
        lt(mediaUploadSessions.updatedAt, cutoff),
      ) as never)
      .limit(100)) as Array<{ id: string }>;
    for (const s of stale) {
      try {
        await rm(stagingDir(s.id), { recursive: true, force: true });
        await db
          .update(mediaUploadSessions)
          .set({ status: "expired", updatedAt: new Date() } as never)
          .where(eq(mediaUploadSessions.id, s.id));
        out.expired++;
      } catch {
        out.errors++;
      }
    }
  } catch {
    out.errors++;
  }
  return out;
}
