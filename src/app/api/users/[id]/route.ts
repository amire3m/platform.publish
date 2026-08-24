import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { updateUserSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_users");
  if (!user) return response;
  const { id } = await params;

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return jsonError("کاربر یافت نشد.", 404);

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return jsonError("ورودی نامعتبر است. اطلاعات واردشده را بررسی کنید.", 422, "VALIDATION_ERROR");

  if (existing.isOwnerProtected && parsed.data.active === false) {
    return jsonError("مالک سیستم قابل غیرفعال‌سازی نیست.", 400);
  }
  if (existing.isOwnerProtected && parsed.data.role && parsed.data.role !== "owner") {
    return jsonError("نقش مالک سیستم قابل تغییر نیست مگر از طریق انتقال مالکیت ویژه.", 400);
  }

  const [row] = await db
    .update(users)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "user_updated",
    entityType: "user",
    entityId: id,
    before: existing,
    after: row,
  });

  return jsonOk(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_users");
  if (!user) return response;
  const { id } = await params;

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return jsonError("کاربر یافت نشد.", 404);
  if (existing.isOwnerProtected) {
    return jsonError("مالک سیستم قابل حذف نیست مگر با تأیید ویژه (این عملیات از پنل انجام نمی‌شود).", 400);
  }

  await db.update(users).set({ active: false, updatedAt: new Date() }).where(eq(users.id, id));

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "user_deactivated",
    entityType: "user",
    entityId: id,
    before: existing,
  });

  return jsonOk({ success: true });
}
