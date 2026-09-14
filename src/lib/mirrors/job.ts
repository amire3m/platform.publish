import type { VidsClient } from "./vids";
import { getTranscriptByPart } from "@/lib/captions/store";

export interface MirrorJobStore {
  setUploading: (fileId: string, taskId: string) => Promise<void>;
  setReady: (fileId: string, remoteId: string, remoteUrl: string | null) => Promise<void>;
  setError: (fileId: string, error: string) => Promise<void>;
  getTranscriptSrt: (partId: string) => Promise<string | null>;
}

export interface MirrorJobInput {
  client: Pick<VidsClient, "serverCapacity" | "remoteUpload" | "uploadStatus" | "fileInfo" | "uploadSubtitle">;
  store: MirrorJobStore;
  partId: string;
  fileId: string;
  sourceUrl: string;
  poll?: { tries: number; intervalMs: number };
  srtLabel?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mirrors one Telegram file to vids.st via remote-upload.
 * Returns "ready" | "pending" (retry later via cron) | "error".
 * Never throws — callers fire-and-forget this.
 */
export async function mirrorFile(input: MirrorJobInput): Promise<"ready" | "pending" | "error"> {
  const { client, store, fileId, sourceUrl } = input;
  const tries = input.poll?.tries ?? 40;
  const intervalMs = input.poll?.intervalMs ?? 15000;
  try {
    const capacity = await client.serverCapacity();
    if (capacity.free_remote <= 0) return "pending";
    const taskId = await client.remoteUpload(sourceUrl);
    await store.setUploading(fileId, taskId);
    for (let i = 0; i < tries; i++) {
      if (intervalMs > 0) await sleep(intervalMs);
      const st = await client.uploadStatus(taskId);
      const state = String(st.status ?? "").toLowerCase();
      if (state === "done" || state === "completed" || state === "finished") {
        const remoteId = String(st.file_id ?? taskId);
        let remoteUrl: string | null = null;
        try {
          const info = await client.fileInfo(remoteId);
          remoteUrl = info.streamUrl;
        } catch {}
        await store.setReady(fileId, remoteId, remoteUrl);
        // best-effort Persian subtitles alongside the video
        try {
          const srt = await store.getTranscriptSrt(input.partId);
          if (srt) await client.uploadSubtitle(remoteId, input.srtLabel ?? "Persian", srt);
        } catch {}
        return "ready";
      }
      if (state === "error" || state === "failed") {
        await store.setError(fileId, `آینه‌سازی ناموفق بود (${state}).`);
        return "error";
      }
    }
    return "pending";
  } catch (error) {
    await store.setError(fileId, error instanceof Error ? error.message : "خطای آینه‌سازی").catch(() => {});
    return "error";
  }
}
/** Default store wiring against the real DB + transcript rows. */
export function createDbMirrorJobStore(): MirrorJobStore {
  return {
    setUploading: async (fileId, taskId) => {
      const { setMirrorUploading } = await import("./store");
      await setMirrorUploading(fileId, taskId);
    },
    setReady: async (fileId, remoteId, remoteUrl) => {
      const { setMirrorReady } = await import("./store");
      await setMirrorReady(fileId, remoteId, remoteUrl);
    },
    setError: async (fileId, error) => {
      const { setMirrorError } = await import("./store");
      await setMirrorError(fileId, error);
    },
    getTranscriptSrt: async (partId) => {
      try {
        const row = await getTranscriptByPart(partId);
        return row && row.status === "ready" && row.srtText ? row.srtText : null;
      } catch {
        return null;
      }
    },
  };
}

const MIRRORABLE_KINDS = new Set(["video", "highlight", "reel"]);

/**
 * Fire-and-forget entry after a part file is linked. Only video kinds with a
 * real Telegram file_id are mirrored, and only when a mirror key is set.
 * Never throws — linking must never fail because mirroring did.
 */
export async function maybeMirrorAfterLink(input: {
  partId: string;
  kind: string;
  fileId: string | null;
  sourceUrl: string | null;
  run?: (job: { partId: string; fileId: string; sourceUrl: string }) => Promise<unknown>;
}): Promise<void> {
  try {
    if (!MIRRORABLE_KINDS.has(input.kind)) return;
    if (!input.fileId || !input.sourceUrl) return;
    if (!(process.env.VIDS_API_KEY ?? "").trim()) return;
    if (input.run) {
      await input.run({ partId: input.partId, fileId: input.fileId, sourceUrl: input.sourceUrl });
      return;
    }
    const { upsertQueuedMirror } = await import("./store");
    const { getVidsClient } = await import("./vids");
    await upsertQueuedMirror(input.partId, input.fileId);
    await mirrorFile({
      client: getVidsClient(),
      store: createDbMirrorJobStore(),
      partId: input.partId,
      fileId: input.fileId,
      sourceUrl: input.sourceUrl,
      poll: { tries: 40, intervalMs: 15000 },
    });
  } catch {}
}
