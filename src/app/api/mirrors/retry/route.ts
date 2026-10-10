import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { mediaMirrors } from "@/db/schema";
import { jsonError, jsonOk, requirePermission } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Requeue failed mirrors: single fileId or all errors.
 * The worker loop picks them up within minutes.
 */
export async function POST(req: Request) {
  const { response } = await requirePermission("manage_content_room");
  if (response) return response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const { fileId, all, forceUncertain } = (body ?? {}) as { fileId?: string; all?: boolean; forceUncertain?: boolean };
  if (!fileId && !all) return jsonError("fileId یا all لازم است.", 422, "VALIDATION_ERROR");
  if (forceUncertain && (!fileId || all)) return jsonError("برای بازیابی ارسال نامطمئن، fileId لازم است.", 422, "VALIDATION_ERROR");

  try {
    if (forceUncertain) {
      const rows = await db
        .update(mediaMirrors)
        .set({ status: "queued", remoteTaskId: null, error: null, updatedAt: new Date() } as never)
        .where(and(
          eq(mediaMirrors.fileId, String(fileId)),
          eq(mediaMirrors.status, "uploading"),
          like(mediaMirrors.remoteTaskId, "submitting:%"),
        ) as never)
        .returning({ id: mediaMirrors.id });
      if (rows.length === 0) {
        return jsonError("وضعیت این ارسال تغییر کرده است؛ فهرست را تازه‌سازی کنید.", 409, "CLAIM_CHANGED");
      }
    } else if (all) {
      await db
        .update(mediaMirrors)
        .set({ status: "queued", error: null, updatedAt: new Date() } as never)
        .where(eq(mediaMirrors.status, "error") as never);
    } else {
      await db
        .update(mediaMirrors)
        .set({ status: "queued", error: null, updatedAt: new Date() } as never)
        .where(and(eq(mediaMirrors.fileId, String(fileId)), eq(mediaMirrors.status, "error")) as never);
    }
    return jsonOk({ requeued: true });
  } catch {
    return jsonError("تلاش مجدد ناموفق بود.", 500, "RETRY_FAILED");
  }
}
