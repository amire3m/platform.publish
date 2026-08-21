import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePermission, jsonError, jsonOk } from "@/lib/api-helpers";
import { appendAuditEvent } from "@/lib/telegram/tgdb";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requirePermission("manage_users");
  if (!user) return response;
  const { id } = await params;

  const body = (await req.json()) as { allowedActions?: string[]; allowedAccountIds?: string[] };
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!existing) return jsonError("کاربر یافت نشد.", 404);

  const allowedActions = (body.allowedActions ?? []).filter((a) => (ALL_PERMISSIONS as string[]).includes(a));

  const [row] = await db
    .update(users)
    .set({
      allowedActions,
      allowedAccountIds: body.allowedAccountIds ?? existing.allowedAccountIds,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  await appendAuditEvent({
    actorTelegramId: user.telegramId,
    actorUserId: user.id,
    action: "user_permissions_updated",
    entityType: "user",
    entityId: id,
    before: { allowedActions: existing.allowedActions, allowedAccountIds: existing.allowedAccountIds },
    after: { allowedActions: row.allowedActions, allowedAccountIds: row.allowedAccountIds },
  });

  return jsonOk(row);
}
