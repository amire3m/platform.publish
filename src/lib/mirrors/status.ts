import type { MirrorRow, MirrorStatus } from "./store";

export const MIRROR_STATUSES: MirrorStatus[] = ["ready", "uploading", "queued", "error"];

export const MIRROR_STATUS_FA: Record<MirrorStatus, string> = {
  ready: "آماده",
  uploading: "در حال آپلود",
  queued: "در صف",
  error: "خطا",
};

export type MirrorCounts = Record<MirrorStatus, number>;

/** Count rows per status (pure, tested). */
export function summarizeMirrors(rows: readonly Pick<MirrorRow, "status">[]): MirrorCounts {
  const out: MirrorCounts = { ready: 0, uploading: 0, queued: 0, error: 0 };
  for (const r of rows) {
    if (r.status in out) out[r.status as MirrorStatus] += 1;
  }
  return out;
}

/** Filter rows by status; empty status returns all (pure, tested). */
export function filterMirrorsByStatus<T extends Pick<MirrorRow, "status">>(rows: readonly T[], status: string): T[] {
  if (!status) return [...rows];
  return rows.filter((r) => r.status === status);
}
