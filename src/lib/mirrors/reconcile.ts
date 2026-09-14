import { buildMirrorSourceUrl } from "@/lib/media/telegram-url";
import { mirrorFile } from "./job";
import type { VidsClient } from "./vids";
import type { MirrorRow } from "./store";

export interface ReconcileStore {
  listPending: () => Promise<MirrorRow[]>;
  setUploading: (fileId: string, taskId: string) => Promise<void>;
  setReady: (fileId: string, remoteId: string, remoteUrl: string | null) => Promise<void>;
  setError: (fileId: string, error: string) => Promise<void>;
  getTranscriptSrt: (partId: string) => Promise<string | null>;
}

export interface ReconcileInput {
  client?: Pick<VidsClient, "serverCapacity" | "remoteUpload" | "uploadStatus" | "fileInfo" | "uploadSubtitle">;
  store?: ReconcileStore;
  maxItems?: number;
  poll?: { tries: number; intervalMs: number };
}

/**
 * Cron sweep: resume uploading mirrors and process queued ones.
 * No-ops without a mirror key. Never throws.
 */
export async function reconcileMirrors(input: ReconcileInput = {}): Promise<{ checked: number; completed: number; failed: number }> {
  const result = { checked: 0, completed: 0, failed: 0 };
  try {
    if (!(process.env.VIDS_API_KEY ?? "").trim()) return result;
    const { getVidsClient } = await import("./vids");
    const { listPendingMirrors, setMirrorUploading, setMirrorReady, setMirrorError } = await import("./store");
    const client = input.client ?? getVidsClient();
    const maxItems = input.maxItems ?? 5;
    const poll = input.poll ?? { tries: 4, intervalMs: 15000 };
    const store: ReconcileStore = input.store ?? {
      listPending: () => listPendingMirrors(maxItems),
      setUploading: (fileId, taskId) => setMirrorUploading(fileId, taskId),
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
    };
    const pending = await store.listPending();
    for (const row of pending.slice(0, maxItems)) {
      result.checked++;
      try {
        if (row.status === "uploading" && row.remoteTaskId) {
          // resume: single status poll, no re-upload
          const st = await client.uploadStatus(row.remoteTaskId);
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
          continue;
        }
        // queued (or uploading without task): full run via source URL
        const sourceUrl = buildMirrorSourceUrl(row.fileId);
        if (!sourceUrl) continue;
        const out = await mirrorFile({
          client,
          store: {
            setUploading: (fileId, taskId) => store.setUploading(fileId, taskId),
            setReady: (fileId, remoteId, remoteUrl) => store.setReady(fileId, remoteId, remoteUrl),
            setError: (fileId, error) => store.setError(fileId, error),
            getTranscriptSrt: (partId) => store.getTranscriptSrt(partId),
          },
          partId: row.partId ?? "",
          fileId: row.fileId,
          sourceUrl,
          poll,
        });
        if (out === "ready") result.completed++;
        else if (out === "error") result.failed++;
      } catch {
        result.failed++;
      }
    }
    return result;
  } catch {
    return result;
  }
}
