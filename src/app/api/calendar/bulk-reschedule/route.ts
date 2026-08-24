import { eq } from "drizzle-orm";
import { db } from "@/db";
import { content, workflowPublications } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { updateContentRecord, appendAuditEvent } from "@/lib/telegram/tgdb";
import { bulkRescheduleSchema } from "@/lib/validation";
import { schedulePublicationTarget, WorkflowTargetError } from "@/lib/workflow/target-service";

export async function POST(req: Request) {
  const { user, response } = await requirePermission("schedule_content");
  if (!user) return response;

  const parsed = bulkRescheduleSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");

  const results = [];
  for (const item of parsed.data.items) {
    // Target-aware path: publicationId present
    if (item.publicationId) {
      try {
        const [pub] = await db.select().from(workflowPublications).where(eq(workflowPublications.id, item.publicationId)).limit(1);
        if (!pub) {
          results.push({ publicationId: item.publicationId, ok: false });
          continue;
        }
        const expectedVersion = (pub as unknown as { version: number }).version;
        await schedulePublicationTarget(
          {
            publicationId: item.publicationId,
            scheduledAtUtc: item.scheduledAtUtc,
            scheduledAtJalali: item.scheduledAtJalali,
            actorUserId: user.id,
            expectedVersion,
          },
        );
        results.push({ publicationId: item.publicationId, ok: true });
      } catch (err) {
        if (err instanceof WorkflowTargetError) {
          results.push({ publicationId: item.publicationId, ok: false, code: err.code });
        } else {
          results.push({ publicationId: item.publicationId, ok: false });
        }
      }
      continue;
    }

    // Legacy path: contentId (only for events without workflow key)
    const contentId = item.contentId as string;
    const [existing] = await db.select().from(content).where(eq(content.id, contentId)).limit(1);
    if (!existing || ["published", "archived"].includes(existing.status)) {
      results.push({ contentId, ok: false });
      continue;
    }
    const targets = (existing.platformTargets as Record<string, unknown>[]).map((t) => ({
      ...t,
      publish_at_utc: item.scheduledAtUtc,
      publish_at_jalali: item.scheduledAtJalali,
      status: "scheduled",
    }));
    await updateContentRecord(contentId, {
      scheduledAtUtc: new Date(item.scheduledAtUtc),
      scheduledAtJalali: item.scheduledAtJalali,
      status: "scheduled",
      platformTargets: targets,
    });
    results.push({ contentId, ok: true });
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
