import { eq } from "drizzle-orm";
import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { updateContentRecord, appendAuditEvent } from "@/lib/telegram/tgdb";
import { bulkRescheduleSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const { user, response } = await requirePermission("schedule_content");
  if (!user) return response;

  const parsed = bulkRescheduleSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "داده نامعتبر است.", 422);

  const results = [];
  for (const item of parsed.data.items) {
    const [existing] = await db.select().from(content).where(eq(content.id, item.contentId)).limit(1);
    if (!existing || ["published", "archived"].includes(existing.status)) {
      results.push({ contentId: item.contentId, ok: false });
      continue;
    }
    const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) => ({
      ...t,
      publish_at_utc: item.scheduledAtUtc,
      publish_at_jalali: item.scheduledAtJalali,
      status: "scheduled",
    }));
    await updateContentRecord(item.contentId, {
      scheduledAtUtc: new Date(item.scheduledAtUtc),
      scheduledAtJalali: item.scheduledAtJalali,
      status: "scheduled",
      platformTargets: targets,
    });
    results.push({ contentId: item.contentId, ok: true });
  }

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "content_bulk_rescheduled",
    entityType: "content",
    after: { count: results.filter((r) => r.ok).length },
  });

  return jsonOk(results);
}
