import { and, eq, gte, inArray, notLike, sql } from "drizzle-orm";

import { db } from "@/db";
import { mediaMirrors } from "@/db/schema";
import { generateEntityId } from "@/lib/ids";

export type MirrorStatus = "queued" | "uploading" | "ready" | "error";
export const MIRROR_PROVIDER = "vids.st";

export interface MirrorRow {
  id: string;
  partId: string | null;
  fileId: string;
  provider: string;
  remoteId: string | null;
  remoteTaskId: string | null;
  remoteUrl: string | null;
  status: MirrorStatus;
  error: string | null;
}

function mapRow(r: Record<string, unknown>): MirrorRow {
  return {
    id: r.id as string,
    partId: ((r.partId as string | null) ?? (r.part_id as string | null) ?? null) as string | null,
    fileId: String(r.fileId ?? r.file_id ?? ""),
    provider: String(r.provider ?? MIRROR_PROVIDER),
    remoteId: ((r.remoteId as string | null) ?? (r.remote_id as string | null) ?? null) as string | null,
    remoteTaskId: ((r.remoteTaskId as string | null) ?? (r.remote_task_id as string | null) ?? null) as string | null,
    remoteUrl: ((r.remoteUrl as string | null) ?? (r.remote_url as string | null) ?? null) as string | null,
    status: ((r.status as MirrorStatus) ?? "queued") as MirrorStatus,
    error: ((r.error as string | null) ?? null) as string | null,
  };
}

export async function getMirrorByFile(fileId: string, provider = MIRROR_PROVIDER): Promise<MirrorRow | null> {
  const [row] = await db
    .select()
    .from(mediaMirrors)
    .where(and(eq(mediaMirrors.provider, provider), eq(mediaMirrors.fileId, fileId)))
    .limit(1);
  return row ? mapRow(row as unknown as Record<string, unknown>) : null;
}

export async function getMirrorUrl(fileId: string, provider = MIRROR_PROVIDER): Promise<string | null> {
  const row = await getMirrorByFile(fileId, provider);
  return row?.status === "ready" ? (row.remoteUrl ?? null) : null;
}

/** Batch mirror URLs for player enrichment (ready rows only, never throws). */
export async function getMirrorUrlsByFile(fileIds: readonly string[], provider = MIRROR_PROVIDER): Promise<Record<string, string>> {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (!ids.length) return {};
  try {
    const rows = (await db
      .select()
      .from(mediaMirrors)
      .where(and(eq(mediaMirrors.provider, provider), inArray(mediaMirrors.fileId, ids)))) as unknown as Array<Record<string, unknown>>;
    const out: Record<string, string> = {};
    for (const r of rows) {
      const mapped = mapRow(r);
      if (mapped.status === "ready" && mapped.remoteUrl) out[mapped.fileId] = mapped.remoteUrl;
    }
    return out;
  } catch {
    return {};
  }
}

export async function upsertQueuedMirror(partId: string | null, fileId: string, provider = MIRROR_PROVIDER): Promise<MirrorRow> {
  const now = new Date();
  const [row] = await db
    .insert(mediaMirrors)
    .values({
      id: generateEntityId("MMR"),
      partId,
      fileId,
      provider,
      status: "queued",
      error: null,
      createdAt: now,
      updatedAt: now,
    } as never)
    .onConflictDoUpdate({
      target: [mediaMirrors.provider, mediaMirrors.fileId],
      set: { partId, status: "queued", remoteId: null, remoteTaskId: null, remoteUrl: null, error: null, updatedAt: now } as never,
    })
    .returning();
  return mapRow(row as unknown as Record<string, unknown>);
}

export async function setMirrorUploading(fileId: string, taskId: string, provider = MIRROR_PROVIDER): Promise<void> {
  await db
    .update(mediaMirrors)
    .set({ status: "uploading", remoteTaskId: taskId, error: null, updatedAt: new Date() } as never)
    .where(and(eq(mediaMirrors.provider, provider), eq(mediaMirrors.fileId, fileId)));
}

export async function setMirrorReady(fileId: string, remoteId: string, remoteUrl: string | null, provider = MIRROR_PROVIDER): Promise<void> {
  await db
    .update(mediaMirrors)
    .set({ status: "ready", remoteId, remoteUrl, error: null, updatedAt: new Date() } as never)
    .where(and(eq(mediaMirrors.provider, provider), eq(mediaMirrors.fileId, fileId)));
}

export async function setMirrorError(fileId: string, error: string, provider = MIRROR_PROVIDER): Promise<void> {
  await db
    .update(mediaMirrors)
    .set({ status: "error", error: error.slice(0, 500), updatedAt: new Date() } as never)
    .where(and(eq(mediaMirrors.provider, provider), eq(mediaMirrors.fileId, fileId)));
}

export async function listPendingMirrors(limit = 20, provider = MIRROR_PROVIDER): Promise<MirrorRow[]> {
  const rows = (await db
    .select()
    .from(mediaMirrors)
    .where(and(eq(mediaMirrors.provider, provider), inArray(mediaMirrors.status, ["queued", "uploading"])))
    .limit(limit)) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** Stale "uploading" rows whose remote task died server-side go back to queued for a fresh upload. */
export async function requeueStaleUploading(maxAgeMs = 6 * 3600 * 1000, provider = MIRROR_PROVIDER): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = (await db
    .select({ fileId: mediaMirrors.fileId })
    .from(mediaMirrors)
    .where(
      and(
        eq(mediaMirrors.provider, provider),
        eq(mediaMirrors.status, "uploading"),
        sql`${mediaMirrors.updatedAt} < ${cutoff}`,
      ),
    )) as unknown as Array<{ fileId: string }>;
  if (!stale.length) return 0;
  await db
    .update(mediaMirrors)
    .set({ status: "queued", remoteTaskId: null, error: null, updatedAt: new Date() } as never)
    .where(
      and(
        eq(mediaMirrors.provider, provider),
        eq(mediaMirrors.status, "uploading"),
        sql`${mediaMirrors.updatedAt} < ${cutoff}`,
      ) as never,
    );
  return stale.length;
}

export async function deleteMirrorsByPartIds(partIds: string[]): Promise<void> {
  if (!partIds.length) return;
  await db.delete(mediaMirrors).where(inArray(mediaMirrors.partId, partIds));
}

/** Real video file_ids (parts + assets) with no mirror row yet. Covers excluded. */
export async function listUnmirroredVideoFiles(limit = 5): Promise<Array<{ partId: string; fileId: string }>> {
  const { contentParts, contentPartAssets } = await import("@/db/schema");
  const realFile = (col: Parameters<typeof notLike>[0]) => and(notLike(col, "tg_msg_%"), notLike(col, "sample_%"));
  const partRows = (await db
    .select({ partId: contentParts.id, fileId: contentParts.fileRef })
    .from(contentParts)
    .where(realFile(contentParts.fileRef))
    .limit(500)) as unknown as Array<{ partId: string; fileId: string | null }>;
  const assetRows = (await db
    .select({ partId: contentPartAssets.partId, fileId: contentPartAssets.fileRef })
    .from(contentPartAssets)
    .where(realFile(contentPartAssets.fileRef))
    .limit(500)) as unknown as Array<{ partId: string; fileId: string | null }>;
  const candidates = [...partRows, ...assetRows].filter((r) => r.fileId);
  if (!candidates.length) return [];
  const existing = (await db
    .select({ fileId: mediaMirrors.fileId })
    .from(mediaMirrors)
    .where(inArray(mediaMirrors.fileId, [...new Set(candidates.map((c) => c.fileId as string))]))) as unknown as Array<{ fileId: string }>;
  const mirrored = new Set(existing.map((r) => r.fileId));
  const out: Array<{ partId: string; fileId: string }> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const fileId = c.fileId as string;
    if (mirrored.has(fileId) || seen.has(fileId)) continue;
    seen.add(fileId);
    out.push({ partId: c.partId, fileId });
    if (out.length >= limit) break;
  }
  return out;
}

export async function listMirrorsByPartIds(partIds: string[]): Promise<MirrorRow[]> {
  if (!partIds.length) return [];
  const rows = (await db
    .select()
    .from(mediaMirrors)
    .where(inArray(mediaMirrors.partId, partIds))) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** Ready rows still missing a playback URL (transcoding finished later). */
export async function listReadyWithoutUrl(limit = 3, provider = MIRROR_PROVIDER): Promise<MirrorRow[]> {
  const rows = (await db
    .select()
    .from(mediaMirrors)
    .where(and(eq(mediaMirrors.provider, provider), eq(mediaMirrors.status, "ready"), sql`${mediaMirrors.remoteUrl} IS NULL`))
    .limit(limit)) as unknown as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}
