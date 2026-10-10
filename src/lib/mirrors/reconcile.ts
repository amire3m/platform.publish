import { buildMirrorSourceUrl } from "@/lib/media/telegram-url";
import { mirrorFile } from "./job";
import { VidsApiError, type VidsCapacity, type VidsClient } from "./vids";
import type { MirrorRow } from "./store";

export interface ReconcileStore {
  listPending: () => Promise<MirrorRow[]>;
  setSubmitting: (fileId: string, claimId: string) => Promise<boolean>;
  setUploading: (fileId: string, taskId: string, claimId: string) => Promise<boolean>;
  setClaimError: (fileId: string, claimId: string, error: string) => Promise<void>;
  setReady: (fileId: string, remoteId: string, remoteUrl: string | null) => Promise<void>;
  setError: (fileId: string, error: string) => Promise<void>;
  getTranscriptSrt: (partId: string) => Promise<string | null>;
  discoverUnmirrored: () => Promise<Array<{ partId: string; fileId: string }>>;
  enqueue: (partId: string, fileId: string) => Promise<void>;
  requeueMissing: (fileId: string, taskId: string) => Promise<void>;
  listReadyWithoutUrl: () => Promise<MirrorRow[]>;
}

export interface ReconcileResult {
  checked: number;
  completed: number;
  failed: number;
  enqueued: number;
  requeued: number;
  blocked: number;
  capacity: VidsCapacity | null;
}

export interface ReconcileInput {
  client?: Pick<VidsClient, "serverCapacity" | "remoteUpload" | "uploadStatus" | "fileInfo" | "uploadSubtitle">;
  store?: ReconcileStore;
  maxItems?: number;
  poll?: { tries: number; intervalMs: number };
  withLock?: (run: () => Promise<ReconcileResult>) => Promise<ReconcileResult | null>;
}

/**
 * Cron sweep: resume uploading mirrors and process queued ones.
 * No-ops without a mirror key. Never throws.
 */
function emptyResult(): ReconcileResult {
  return { checked: 0, completed: 0, failed: 0, enqueued: 0, requeued: 0, blocked: 0, capacity: null };
}

export async function reconcileMirrors(input: ReconcileInput = {}): Promise<ReconcileResult> {
  if (!(process.env.VIDS_API_KEY ?? "").trim()) return emptyResult();
  const withLock = input.withLock ?? (input.store
    ? async (run: () => Promise<ReconcileResult>) => run()
    : async (run: () => Promise<ReconcileResult>) => {
        const { withMirrorReconcileLock } = await import("./store");
        return withMirrorReconcileLock(run);
      });
  try {
    return (await withLock(() => reconcileMirrorsUnlocked(input))) ?? emptyResult();
  } catch (error) {
    console.error("[mirrors] reconcile lock failed:", error instanceof Error ? error.message : error);
    return emptyResult();
  }
}

async function reconcileMirrorsUnlocked(input: ReconcileInput): Promise<ReconcileResult> {
  const result = emptyResult();
  try {
    const { getVidsClient } = await import("./vids");
    const { listPendingMirrors, setMirrorSubmitting, setMirrorUploading, setMirrorClaimError, setMirrorReady, setMirrorError, listUnmirroredVideoFiles, upsertQueuedMirror, requeueMissingMirrorTask, listReadyWithoutUrl } = await import("./store");
    const client = input.client ?? getVidsClient();
    const maxItems = input.maxItems ?? 5;
    const poll = input.poll ?? { tries: 4, intervalMs: 15000 };
    const store: ReconcileStore = input.store ?? {
      listPending: () => listPendingMirrors(),
      setSubmitting: (fileId, claimId) => setMirrorSubmitting(fileId, claimId),
      setUploading: (fileId, taskId, claimId) => setMirrorUploading(fileId, taskId, claimId),
      setClaimError: (fileId, claimId, error) => setMirrorClaimError(fileId, claimId, error),
      setReady: (fileId, remoteId, remoteUrl) => setMirrorReady(fileId, remoteId, remoteUrl),
      setError: (fileId, error) => setMirrorError(fileId, error),
      getTranscriptSrt: async (partId) => {
        try {
          const { getTranscriptByPart } = await import("@/lib/captions/store");
          const row = await getTranscriptByPart(partId);
          return row && row.status === "ready" && row.srtText ? row.srtText : null;
        } catch {
          return null;
        }
      },
      discoverUnmirrored: () => listUnmirroredVideoFiles(maxItems),
      enqueue: (partId, fileId) => upsertQueuedMirror(partId, fileId).then(() => {}),
      requeueMissing: (fileId, taskId) => requeueMissingMirrorTask(fileId, taskId),
      listReadyWithoutUrl: () => listReadyWithoutUrl(),
    };
    const pending = (await store.listPending()).sort((a, b) => Number(b.status === "uploading") - Number(a.status === "uploading"));
    const uploading = pending.filter((row) => row.status === "uploading" && row.remoteTaskId && !row.remoteTaskId.startsWith("submitting:"));
    for (const row of uploading.slice(0, maxItems)) {
      result.checked++;
      try {
        let st;
        try {
          st = await client.uploadStatus(row.remoteTaskId!);
        } catch (error) {
          if (error instanceof VidsApiError && error.fromApiPayload && error.action === "upload/status" && error.status === 404) {
            console.error("[mirrors] task gone, requeued:", row.fileId);
            await store.requeueMissing(row.fileId, row.remoteTaskId!);
            result.requeued++;
          } else {
            console.error("[mirrors] status poll failed, keeping task:", row.fileId, error instanceof Error ? error.message : error);
            result.failed++;
          }
          continue;
        }
        const state = String(st.status ?? "").toLowerCase();
        if (state === "done" || state === "completed" || state === "finished") {
          const remoteId = String(st.file_id ?? row.remoteTaskId);
          let remoteUrl: string | null = null;
          try {
            remoteUrl = (await client.fileInfo(remoteId)).streamUrl;
          } catch {}
          await store.setReady(row.fileId, remoteId, remoteUrl);
          result.completed++;
        } else if (state === "error" || state === "failed") {
          await store.setError(row.fileId, "آینه‌سازی ناموفق بود.");
          result.failed++;
        }
      } catch {
        result.failed++;
      }
    }

    const queued = pending.filter((row) => row.status === "queued");
    if (queued.length > 0) {
      try {
        result.capacity = await client.serverCapacity();
      } catch (error) {
        console.error("[mirrors] capacity check failed:", error instanceof Error ? error.message : error);
        result.failed++;
      }
      const slots = Math.max(0, Math.min(result.capacity?.free_remote ?? 0, maxItems, queued.length));
      result.blocked = Math.max(0, queued.length - slots);
      for (const row of queued.slice(0, slots)) {
        result.checked++;
        const sourceUrl = buildMirrorSourceUrl(row.fileId);
        if (!sourceUrl) continue;
        const out = await mirrorFile({
          client,
          store: {
            setSubmitting: (fileId, claimId) => store.setSubmitting(fileId, claimId),
            setUploading: (fileId, taskId, claimId) => store.setUploading(fileId, taskId, claimId),
            setClaimError: (fileId, claimId, error) => store.setClaimError(fileId, claimId, error),
            setReady: (fileId, remoteId, remoteUrl) => store.setReady(fileId, remoteId, remoteUrl),
            setError: (fileId, error) => store.setError(fileId, error),
            getTranscriptSrt: (partId) => store.getTranscriptSrt(partId),
          },
          partId: row.partId ?? "",
          fileId: row.fileId,
          sourceUrl,
          poll,
          capacityGranted: true,
        });
        if (out === "ready") result.completed++;
        else if (out === "error") result.failed++;
      }
    }
    // discover existing video files with no mirror row yet and enqueue them
    try {
      const fresh = await store.discoverUnmirrored();
      for (const f of fresh.slice(0, maxItems)) {
        await store.enqueue(f.partId, f.fileId);
        result.enqueued++;
      }
    } catch {}
    // refresh playback links of ready rows that have none yet (transcoding lag)
    try {
      const bare = await store.listReadyWithoutUrl();
      for (const row of bare.slice(0, 3)) {
        if (!row.remoteId) continue;
        try {
          const url = (await client.fileInfo(row.remoteId)).streamUrl;
          if (url) {
            await store.setReady(row.fileId, row.remoteId, url);
            result.completed++;
          }
        } catch {}
      }
    } catch {}
    return result;
  } catch {
    return result;
  }
}
