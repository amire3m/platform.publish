import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaMirrors } from "@/db/schema";
import { jsonError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Requeue failed mirrors: single fileId or all errors.
 * The worker loop picks them up within minutes.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return jsonError("درخواست نامعتبر است.", 422, "VALIDATION_ERROR");
  }
  const { fileId, all } = (body ?? {}) as { fileId?: string; all?: boolean };
  if (!fileId && !all) return jsonError("fileId یا all لازم است.", 422, "VALIDATION_ERROR");

  try {
    if (all) {
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
