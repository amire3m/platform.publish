import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contentParts } from "@/db/schema";
import { jsonError, jsonInternalError, jsonOk } from "@/lib/api-helpers";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

/** PATCH part metadata (currently: YouTube check-upload URL). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("ابتدا وارد حساب کاربری خود شوید.", 401, "UNAUTHENTICATED");
  const subject = {
    role: (user as unknown as { role: string }).role,
    allowedActions: (user as unknown as { allowedActions?: string[] }).allowedActions ?? [],
  };
  if (!hasPermission(subject, "manage_content_room") && !hasPermission(subject, "update_assigned_content")) {
    return jsonError("شما مجوز انجام این عملیات را ندارید.", 403, "FORBIDDEN");
  }
  const { id: partId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { ytCheckUrl?: unknown } | null;
  const raw = typeof body?.ytCheckUrl === "string" ? body.ytCheckUrl.trim() : "";
  if (raw !== "") {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return jsonError("لینک معتبر نیست.", 422, "VALIDATION_ERROR");
    }
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "youtube.com" && host !== "youtu.be" && host !== "studio.youtube.com") {
      return jsonError("فقط لینک یوتیوب پذیرفته می‌شود.", 422, "VALIDATION_ERROR");
    }
  }
  try {
    const [updated] = await db
      .update(contentParts)
      .set({ ytCheckUrl: raw || null, updatedAt: new Date() } as never)
      .where(eq(contentParts.id, partId))
      .returning({ id: contentParts.id, ytCheckUrl: contentParts.ytCheckUrl });
    if (!updated) return jsonError("قسمت یافت نشد.", 404, "NOT_FOUND");
    return jsonOk({ part: updated });
  } catch (error) {
    return jsonInternalError(error, "api/content-room/parts PATCH");
  }
}
