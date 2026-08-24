import { eq } from "drizzle-orm";
import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { updateContentRecord, appendAuditEvent } from "@/lib/telegram/tgdb";
import { rescheduleSchema } from "@/lib/validation";
import { isPast } from "@/lib/date/jalali";

export async function PATCH(req: Request, { params }: { params: Promise<{ contentId: string }> }) {
  const { user, response } = await requirePermission("schedule_content");
  if (!user) return response;
  const { contentId } = await params;

  const [existing] = await db.select().from(content).where(eq(content.id, contentId)).limit(1);
  if (!existing) return jsonError("محتوا یافت نشد.", 404);
  if (["published", "archived"].includes(existing.status)) {
    return jsonError("محتوای منتشرشده یا آرشیوشده قابل تغییر زمان نیست.", 400);
  }

  const parsed = rescheduleSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");

  if (isPast(parsed.data.scheduledAtUtc)) {
    return jsonError("امکان زمان‌بندی در گذشته وجود ندارد.", 400);
  }

  const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) => {
    if (parsed.data.platform && t.platform !== parsed.data.platform) return t;
    return { ...t, publish_at_utc: parsed.data.scheduledAtUtc, publish_at_jalali: parsed.data.scheduledAtJalali, status: "scheduled" };
  });

  const row = await updateContentRecord(contentId, {
    scheduledAtUtc: new Date(parsed.data.scheduledAtUtc),
    scheduledAtJalali: parsed.data.scheduledAtJalali,
    status: "scheduled",
    platformTargets: targets,
  });

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "content_rescheduled",
    entityType: "content",
    entityId: contentId,
    before: { scheduledAtUtc: existing.scheduledAtUtc },
    after: { scheduledAtUtc: row?.scheduledAtUtc },
  });

  return jsonOk(row);
}
