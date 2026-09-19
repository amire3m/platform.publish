import { jsonError, jsonInternalError, jsonOk, requirePermission } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getProviders } from "@/lib/captions/providers";
import { extractWav, probeDuration, runTranscription } from "@/lib/captions/transcribe";
import {
  dailyMinutesUsed,
  getPartWithProduct,
  getTranscriptByPart,
  saveTranscriptResult,
  setTranscriptStatus,
  upsertQueued,
} from "@/lib/captions/store";
import { TelegramClient } from "@/lib/telegram/client";

export const runtime = "nodejs";

async function canEdit(): Promise<{ ok: boolean; userId: string; response?: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, userId: "", response: jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED") };
  const u = user as unknown as { id?: string; role?: string; allowedActions?: string[]; allowedAccountIds?: string[] };
  const subject = { role: u.role, allowedActions: u.allowedActions, allowedAccountIds: u.allowedAccountIds } as never;
  const allowed =
    hasPermission(subject, "manage_content_room" as never) || hasPermission(subject, "update_assigned_content" as never);
  if (!allowed) return { ok: false, userId: "", response: jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN") };
  return { ok: true, userId: u.id ?? "unknown" };
}

async function downloadToLocalPath(fileRef: string | null): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (!fileRef || fileRef.startsWith("tg_msg_")) {
    throw Object.assign(new Error("فایل قابل دانلود نیست؛ ابتدا فایل را از تلگرام لینک کنید."), { code: "NO_FILE" });
  }
  // Stream to disk (or reuse the local Bot API cache) — never buffer whole videos in RAM.
  const client = TelegramClient.fromEnv();
  return client.downloadToTempFile(fileRef);
}

function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : "خطای ناشناخته";
  return msg.slice(0, 500);
}

async function runJob(partId: string, fileRef: string | null): Promise<void> {
  // Serialized globally: only one transcription holds ffmpeg/temp-disk at a time.
  const { runBigJob } = await import("@/lib/media/big-job");
  await runBigJob(`transcribe:${partId}`, async () => {
    await setTranscriptStatus(partId, "processing");
    let local: { path: string; cleanup: () => Promise<void> } | null = null;
    try {
      local = await downloadToLocalPath(fileRef);
      const { stt } = getProviders();
      const maxMinutes = Number(process.env.TRANSCRIBE_MAX_MINUTES ?? 60);
      await runTranscription(
        {
          mediaPath: async () => (local as { path: string }).path,
          probeDuration,
          extractWav,
          stt,
          saveProgress: (s) => setTranscriptStatus(partId, s as "processing"),
          persist: (r) => saveTranscriptResult(partId, r),
        },
        { maxMinutes: Number.isFinite(maxMinutes) && maxMinutes > 0 ? maxMinutes : 60 },
      );
    } catch (error) {
      await setTranscriptStatus(partId, "error", errorMessage(error)).catch(() => {});
    } finally {
      if (local) await local.cleanup().catch(() => {});
    }
  }).catch(() => {});
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const gate = await canEdit();
  if (!gate.ok) return gate.response!;
  try {
    const found = await getPartWithProduct(id);
    if (!found) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
    const existing = await getTranscriptByPart(id);
    if (existing && (existing.status === "queued" || existing.status === "processing")) {
      return jsonOk({ status: existing.status }, 202);
    }
    const dailyCap = Number(process.env.STT_DAILY_MINUTES ?? 300);
    const maxMinutes = Number(process.env.TRANSCRIBE_MAX_MINUTES ?? 60);
    const used = await dailyMinutesUsed();
    if (used + maxMinutes > dailyCap) {
      return jsonError("سقف روزانه رونویسی به پایان رسیده است؛ فردا تلاش کنید.", 429, "DAILY_LIMIT");
    }
    await upsertQueued(id);
    runJob(id, found.part.fileRef).then(undefined, () => {});
    return jsonOk({ status: "queued" }, 202);
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts/[id]/transcribe POST");
  }
}
