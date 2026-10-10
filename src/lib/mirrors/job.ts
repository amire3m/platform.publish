import { randomUUID } from "node:crypto";
import { VidsApiError, type VidsClient } from "./vids";
import { getTranscriptByPart } from "@/lib/captions/store";

export interface MirrorJobStore {
  setSubmitting: (fileId: string, claimId: string) => Promise<boolean>;
  setUploading: (fileId: string, taskId: string, claimId: string) => Promise<boolean>;
  setClaimError: (fileId: string, claimId: string, error: string) => Promise<void>;
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
  capacityGranted?: boolean;
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
  let claimId: string | null = null;
  let claimed = false;
  let accepted = false;
  try {
    if (input.capacityGranted !== true) {
      const capacity = await client.serverCapacity();
      if (capacity.free_remote <= 0) return "pending";
    }
    claimId = randomUUID();
    claimed = await store.setSubmitting(fileId, claimId);
    if (!claimed) return "pending";
    const taskId = await client.remoteUpload(sourceUrl);
    accepted = true;
    const persisted = await store.setUploading(fileId, taskId, claimId);
    if (!persisted) throw new Error(`task id persistence conflict (${taskId})`);
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
    const msg = error instanceof Error ? error.message : "خطای آینه‌سازی";
    if (claimed && !accepted && claimId && error instanceof VidsApiError && error.fromApiPayload && error.status >= 400 && error.status < 500) {
      await store.setClaimError(fileId, claimId, msg).catch(() => {});
      return "error";
    }
    if (claimed) {
      console.error(accepted
        ? "[mirrors] accepted task persistence/poll failed, keeping claim active:"
        : "[mirrors] remote submission uncertain, keeping claim active:", fileId, msg);
      return "pending";
    }
    console.error("[mirrors] job failed:", fileId, msg);
    await store.setError(fileId, msg).catch(() => {});
    return "error";
  }
}
/** Default store wiring against the real DB + transcript rows. */
export function createDbMirrorJobStore(): MirrorJobStore {
  return {
    setUploading: async (fileId, taskId, claimId) => {
      const { setMirrorUploading } = await import("./store");
      return setMirrorUploading(fileId, taskId, claimId);
    },
    setSubmitting: async (fileId, claimId) => {
      const { setMirrorSubmitting } = await import("./store");
      return setMirrorSubmitting(fileId, claimId);
    },
    setClaimError: async (fileId, claimId, error) => {
      const { setMirrorClaimError } = await import("./store");
      await setMirrorClaimError(fileId, claimId, error);
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
 * Fire-and-forget entry after a part file is linked. Only enqueues video kinds
 * with a real Telegram file_id; the cron reconcile owns all uploads serially
 * (upstream allows a single concurrent remote-upload, so link-time uploads
 * would race the cron and die server-side). Never throws — linking must never
 * fail because mirroring did.
 */
export async function maybeMirrorAfterLink(input: {
  partId: string;
  kind: string;
  fileId: string | null;
  sourceUrl?: string | null;
  run?: (job: { partId: string; fileId: string }) => Promise<unknown>;
}): Promise<void> {
  try {
    if (!MIRRORABLE_KINDS.has(input.kind)) return;
    if (!input.fileId || input.fileId.startsWith("tg_msg_") || input.fileId.startsWith("sample_")) return;
    if (!(process.env.VIDS_API_KEY ?? "").trim()) return;
    if (input.run) {
      await input.run({ partId: input.partId, fileId: input.fileId });
      return;
    }
    const { upsertQueuedMirror } = await import("./store");
    await upsertQueuedMirror(input.partId, input.fileId);
  } catch {}
}
