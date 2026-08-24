import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramTopics } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { TelegramClient, TelegramNotConfiguredError } from "@/lib/telegram/client";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { generateEntityId } from "@/lib/ids";
import { FIXED_TOPICS } from "@/lib/telegram/topics-seed";

export async function GET() {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;

  const existing = await db.select().from(telegramTopics);
  if (existing.length === 0) {
    const seeded = await db
      .insert(telegramTopics)
      .values(
        FIXED_TOPICS.map((t) => ({
          id: generateEntityId("TPC"),
          key: t.key,
          label: t.label,
          purpose: t.purpose,
          isFixed: true,
        })),
      )
      .returning();
    return jsonOk(seeded);
  }
  return jsonOk(existing);
}

// Body: { key, label, mode: "create" | "map", messageThreadId?, iconColor? }
export async function POST(req: Request) {
  const { user, response } = await requirePermission("manage_settings");
  if (!user) return response;

  const body = (await req.json()) as {
    key: string;
    label: string;
    mode: "create" | "map";
    messageThreadId?: number;
    iconColor?: number;
  };

  let messageThreadId = body.messageThreadId ?? null;

  if (body.mode === "create") {
    try {
      const client = TelegramClient.fromEnv();
      const topic = await client.createForumTopic(body.label, body.iconColor);
      messageThreadId = topic.message_thread_id;
    } catch (err) {
      if (err instanceof TelegramNotConfiguredError) return jsonError(err.message, 400, "NOT_CONFIGURED");
      console.error("[telegram-topic] create failed:", err);
      return jsonError("ایجاد تاپیک در Telegram انجام نشد. دوباره تلاش کنید.", 502);
    }
  }

  const [existingRow] = await db.select().from(telegramTopics).where(eq(telegramTopics.key, body.key));
  let row;
  if (existingRow) {
    [row] = await db
      .update(telegramTopics)
      .set({ label: body.label, messageThreadId, updatedAt: new Date() })
      .where(eq(telegramTopics.key, body.key))
      .returning();
  } else {
    [row] = await db
      .insert(telegramTopics)
      .values({
        id: generateEntityId("TPC"),
        key: body.key,
        label: body.label,
        purpose: "Topic اختصاصی تعریف‌شده توسط کاربر",
        messageThreadId,
        isFixed: false,
      })
      .returning();
  }

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "telegram_topic_mapped",
    entityType: "telegram_topic",
    entityId: row.id,
    after: { key: row.key, messageThreadId: row.messageThreadId },
  });

  return jsonOk(row);
}
