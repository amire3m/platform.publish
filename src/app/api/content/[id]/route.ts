import { eq } from "drizzle-orm";
import { db } from "@/db";
import { content } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { updateContentRecord, appendAuditEvent } from "@/lib/telegram/tgdb";
import { TelegramClient, TelegramNotConfiguredError } from "@/lib/telegram/client";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("view_content");
  if (!user) return response;
  const { id } = await params;

  const [row] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  if (!row) return jsonError("محتوا یافت نشد.", 404);

  let telegramLink: string | null = null;
  if (row.metadataMessageId) {
    try {
      const client = TelegramClient.fromEnv();
      telegramLink = client.buildMessageLink(row.metadataMessageId, row.sourceTopicId ?? undefined);
    } catch (err) {
      if (!(err instanceof TelegramNotConfiguredError)) console.error(err);
    }
  }

  return jsonOk({ ...row, telegramLink });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("edit_content");
  if (!user) return response;
  const { id } = await params;

  const [existing] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  if (!existing) return jsonError("محتوا یافت نشد.", 404);
  if (["published", "archived"].includes(existing.status)) {
    return jsonError("محتوای منتشرشده یا آرشیوشده قابل ویرایش مستقیم نیست.", 400);
  }

  const body = await req.json();
  const row = await updateContentRecord(id, body);

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "content_updated",
    entityType: "content",
    entityId: id,
    before: existing,
    after: row,
  });

  return jsonOk(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("delete_content");
  if (!user) return response;
  const { id } = await params;

  const [existing] = await db.select().from(content).where(eq(content.id, id)).limit(1);
  if (!existing) return jsonError("محتوا یافت نشد.", 404);
  if (existing.status !== "draft") {
    return jsonError("طبق سیاست حفظ داده، فقط پیش‌نویس‌ها قابل حذف هستند؛ سایر محتواها فقط آرشیو می‌شوند.", 400);
  }

  await db.delete(content).where(eq(content.id, id));
  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "content_deleted_draft",
    entityType: "content",
    entityId: id,
    before: existing,
  });

  return jsonOk({ success: true });
}
