import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramTopics } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { TelegramClient } from "@/lib/telegram/client";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;
  const { id } = await params;

  const body = (await req.json()) as { label?: string; messageThreadId?: number | null };
  const [existing] = await db.select().from(telegramTopics).where(eq(telegramTopics.id, id)).limit(1);
  if (!existing) return jsonError("تاپیک یافت نشد.", 404);

  if (body.label && existing.messageThreadId) {
    try {
      const client = TelegramClient.fromEnv();
      await client.editForumTopic(existing.messageThreadId, body.label);
    } catch {
      // Best-effort: local label rename still proceeds even if Telegram sync fails.
    }
  }

  const [row] = await db
    .update(telegramTopics)
    .set({
      label: body.label ?? existing.label,
      messageThreadId: body.messageThreadId !== undefined ? body.messageThreadId : existing.messageThreadId,
      updatedAt: new Date(),
    })
    .where(eq(telegramTopics.id, id))
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "telegram_topic_updated",
    entityType: "telegram_topic",
    entityId: id,
    before: existing,
    after: row,
  });

  return jsonOk(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;
  const { id } = await params;

  const [existing] = await db.select().from(telegramTopics).where(eq(telegramTopics.id, id)).limit(1);
  if (!existing) return jsonError("تاپیک یافت نشد.", 404);
  if (existing.isFixed) return jsonError("تاپیک‌های ثابت سیستم قابل حذف نیستند؛ فقط می‌توانید آن‌ها را ویرایش کنید.", 400);

  await db.delete(telegramTopics).where(eq(telegramTopics.id, id));
  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "telegram_topic_deleted",
    entityType: "telegram_topic",
    entityId: id,
    before: existing,
  });
  return jsonOk({ success: true });
}
