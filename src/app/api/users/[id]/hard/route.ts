import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";

/**
 * Owner-only permanent delete. All FK references use ON DELETE SET NULL,
 * so history rows survive (actor names fall back to the raw user id).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_users");
  if (!user) return response;
  if ((user as unknown as { role?: string }).role !== "owner") {
    return jsonError("فقط مالک سیستم می‌تواند کاربر را دائماً حذف کند.", 403, "FORBIDDEN");
  }
  const { id } = await params;
  if (id === (user as unknown as { id: string }).id) {
    return jsonError("نمی‌توانید حساب خودتان را حذف کنید.", 400, "SELF_DELETE");
  }

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return jsonError("کاربر یافت نشد.", 404);
  if (existing.isOwnerProtected) {
    return jsonError("حساب مالک سیستم قابل حذف نیست.", 400, "OWNER_PROTECTED");
  }

  const snapshot = {
    id: existing.id,
    telegramId: existing.telegramId,
    name: existing.name,
    username: existing.username,
    role: existing.role,
    jobFunctions: (existing as unknown as { jobFunctions?: string[] }).jobFunctions ?? [],
  };
  await db.delete(users).where(eq(users.id, id));

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "user_hard_deleted",
    entityType: "user",
    entityId: id,
    before: snapshot,
  });

  return jsonOk({ success: true });
}
